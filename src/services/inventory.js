import { deleteField, doc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { drinkStockKey, menuStockKey } from "../components/customer/customerConstants.js";

// מסמך יחיד: { soldOut: { "menu-1": true }, qty: { "drink-coke": 24 } }
// מוצר בלי כמות = בלי ספירה. כמות 0 = חסר במלאי.
const inventoryRef = doc(db, "inventory", "status");

export function effectiveSoldOut(soldOut = {}, qty = {}) {
  const result = { ...soldOut };
  Object.entries(qty).forEach(([key, value]) => {
    if (typeof value === "number" && value <= 0) result[key] = true;
  });
  return result;
}

export function subscribeToInventory(callback) {
  return onSnapshot(
    inventoryRef,
    (snap) => {
      const data = snap.data() || {};
      const soldOut = data.soldOut || {};
      const qty = data.qty || {};
      callback(effectiveSoldOut(soldOut, qty), { soldOut, qty });
    },
    (error) => {
      console.error("Inventory subscription failed:", error);
      callback({}, { soldOut: {}, qty: {} });
    }
  );
}

export async function setSoldOutInFirebase(stockKey, soldOut, { clearQty = false } = {}) {
  await setDoc(
    inventoryRef,
    { soldOut: { [stockKey]: soldOut }, ...(clearQty ? { qty: { [stockKey]: deleteField() } } : {}) },
    { merge: true }
  );
}

export async function setStockQtyInFirebase(stockKey, qty) {
  const tracked = typeof qty === "number" && Number.isFinite(qty);
  const value = tracked ? Math.max(0, Math.floor(qty)) : deleteField();
  await setDoc(
    inventoryRef,
    { qty: { [stockKey]: value }, ...(tracked && value > 0 ? { soldOut: { [stockKey]: false } } : {}) },
    { merge: true }
  );
}

export function stockUsageForItems(items = []) {
  const usage = {};
  const add = (key, n = 1) => {
    usage[key] = (usage[key] || 0) + n;
  };
  (items || []).forEach((item) => {
    if (!item) return;
    const n = Number(item.qty) > 1 ? Number(item.qty) : 1;
    if (item.id != null) add(menuStockKey(item.id), n);
    if (item.drinkType) add(drinkStockKey(item.drinkType), n);
    (item.familyMeals || []).forEach((meal) => {
      if (meal?.drinkKey) add(drinkStockKey(meal.drinkKey), n);
    });
  });
  return usage;
}

export async function consumeStockInFirebase(items) {
  const usage = stockUsageForItems(items);
  if (Object.keys(usage).length === 0) return;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(inventoryRef);
    const qty = snap.data()?.qty || {};
    const updates = {};
    Object.entries(usage).forEach(([key, n]) => {
      if (typeof qty[key] === "number") updates[key] = Math.max(0, qty[key] - n);
    });
    if (Object.keys(updates).length > 0) transaction.set(inventoryRef, { qty: updates }, { merge: true });
  });
}
