import {
  writeBatch,
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { toMillis } from "../utils/timeUtils.js";

const ordersRef = collection(db, "orders");
const menuRatingsRef = collection(db, "menuRatings");
const COUNTERS_COLLECTION = "counters";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

function getIsraelDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    // Fallback that still uses Israel timezone.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: ISRAEL_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  return `${year}-${month}-${day}`;
}

function sortOrdersByCreatedDesc(orders) {
  return [...orders].sort((a, b) => {
    const aTs =
      (typeof a.createdAtClient === "number" && Number.isFinite(a.createdAtClient)
        ? a.createdAtClient
        : null) ?? toMillis(a.createdAt) ?? 0;
    const bTs =
      (typeof b.createdAtClient === "number" && Number.isFinite(b.createdAtClient)
        ? b.createdAtClient
        : null) ?? toMillis(b.createdAt) ?? 0;
    return bTs - aTs;
  });
}

export async function createOrder(order) {
  const dateKey = getIsraelDateKey();
  const counterRef = doc(db, COUNTERS_COLLECTION, dateKey);
  const newOrderRef = doc(ordersRef);
  const createdAtClient = Date.now();

  await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const lastOrderNumber = Number(counterSnap.data()?.lastOrderNumber) || 0;
    const nextOrderNumber = lastOrderNumber + 1;

    transaction.set(
      counterRef,
      {
        lastOrderNumber: nextOrderNumber,
      },
      { merge: true }
    );

    transaction.set(newOrderRef, {
      customerName: order.customerName,
      paymentRequested: order.paymentRequested,
      paymentActual: null,
      paymentMethod: null,
      notifiedReady: false,
      status: "new",
      total: order.total,
      items: order.items,
      orderNumber: nextOrderNumber,
      orderDateKey: dateKey,
      createdAt: serverTimestamp(),
      createdAtClient,
      sentToKitchenAt: null,
      readyAt: null,
      deliveryTime: order.deliveryTime || null,
      deliveryAddress: order.deliveryAddress || null,
      deliveryCity: order.deliveryCity || null,
      deliveryPhone: order.deliveryPhone || null,
    });
  });

  return newOrderRef;
}

// Live stream for the operational screens (customer / cashier / kitchen).
// Scoped to today's orders (Israel timezone) to bound Firestore reads.
// Historical days are read on demand via fetchOrdersForDate (used by Analytics).
export function subscribeToOrders(callback) {
  const todayKey = getIsraelDateKey();
  const todayQuery = query(ordersRef, where("orderDateKey", "==", todayKey));

  return onSnapshot(todayQuery, (snapshot) => {
    const orders = sortOrdersByCreatedDesc(
      snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    );
    callback(orders);
  });
}

// One-time fetch of all orders for a given Israel date key (YYYY-MM-DD).
export async function fetchOrdersForDate(dateKey) {
  if (!dateKey) return [];
  const dateQuery = query(ordersRef, where("orderDateKey", "==", dateKey));
  const snapshot = await getDocs(dateQuery);
  return sortOrdersByCreatedDesc(
    snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
  );
}

// Lists the date keys that have at least one order, derived from the per-day
// counters collection (one doc per day with orders).
export async function fetchOrderDatesWithData() {
  const snapshot = await getDocs(collection(db, COUNTERS_COLLECTION));
  return snapshot.docs
    .map((docSnap) => docSnap.id)
    .filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id))
    .sort((a, b) => b.localeCompare(a));
}

export async function payOrderInFirebase(orderId, paymentMethod) {
  const orderRef = doc(db, "orders", orderId);

  await updateDoc(orderRef, {
    paymentMethod,
    paymentActual: paymentMethod,
    status: "paid",
  });
}

export async function sendToKitchenInFirebase(orderId) {
  const orderRef = doc(db, "orders", orderId);

  await updateDoc(orderRef, {
    status: "in_progress",
    sentToKitchenAt: serverTimestamp(),
  });
}

export async function deleteOrdersInFirebase(orderIds = []) {
  const ids = Array.isArray(orderIds) ? orderIds.filter(Boolean) : [];
  if (!ids.length) return;

  const batch = writeBatch(db);
  ids.forEach((id) => {
    batch.delete(doc(db, "orders", id));
  });

  await batch.commit();
}

export async function submitOrderReviewInFirebase(orderId, review = {}) {
  const safeRating = Number(review.rating);
  if (!Number.isFinite(safeRating) || safeRating < 1 || safeRating > 5) {
    throw new Error("Invalid rating value");
  }

  const rawComment = typeof review.comment === "string" ? review.comment : "";
  const safeComment = rawComment.trim().slice(0, 200);

  const safeItemIds = Array.isArray(review.itemIds)
    ? [...new Set(review.itemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))]
    : [];

  if (!safeItemIds.length) {
    throw new Error("No reviewable items found for this order");
  }

  const roundedRating = Math.round(safeRating);
  const orderRef = doc(db, "orders", orderId);

  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error("Order not found");
    }

    const existingReviewRating = Number(orderSnap.data()?.review?.rating);
    if (Number.isFinite(existingReviewRating) && existingReviewRating >= 1 && existingReviewRating <= 5) {
      throw new Error("Order already reviewed");
    }

    transaction.update(orderRef, {
      review: {
        rating: roundedRating,
        comment: safeComment,
        itemIds: safeItemIds,
        createdAt: serverTimestamp(),
      },
    });

    safeItemIds.forEach((itemId) => {
      const ratingRef = doc(menuRatingsRef, String(itemId));
      transaction.set(
        ratingRef,
        {
          itemId,
          ratingCount: increment(1),
          ratingSum: increment(roundedRating),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  });
}

export function subscribeToMenuRatings(callback) {
  return onSnapshot(menuRatingsRef, (snapshot) => {
    const ratings = {};

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const fallbackId = Number(docSnap.id);
      const rawItemId = Number(data.itemId);
      const itemId = Number.isFinite(rawItemId) ? rawItemId : fallbackId;
      if (!Number.isFinite(itemId)) return;

      const count = Number(data.ratingCount) || 0;
      const sum = Number(data.ratingSum) || 0;
      if (count <= 0 || sum <= 0) return;

      ratings[itemId] = {
        count,
        avg: Math.round((sum / count) * 10) / 10,
      };
    });

    callback(ratings);
  });
}

export async function markDeliveryDispatchedInFirebase(orderId) {
  const orderRef = doc(db, "orders", orderId);
  await updateDoc(orderRef, {
    dispatchedAt: serverTimestamp(),
    dispatchedAtClient: Date.now(),
  });
}
