import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  transaction: null,
  updateDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  batch: { delete: vi.fn(), commit: vi.fn() },
}));

vi.mock("../firebase", () => ({ db: { name: "db" } }));
vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (parent, ...segments) =>
    segments.length ? { path: [parent?.collection, ...segments].filter(Boolean).join("/") } : { id: "new-order-id" },
  query: (ref, ...constraints) => ({ ref, constraints }),
  where: (field, op, value) => ({ field, op, value }),
  getDocs: fs.getDocs,
  onSnapshot: fs.onSnapshot,
  updateDoc: fs.updateDoc,
  writeBatch: () => fs.batch,
  serverTimestamp: () => "SERVER_TS",
  increment: (n) => ({ increment: n }),
  runTransaction: async (_db, fn) => fn(fs.transaction),
}));

const orders = await import("./orders.js");

const snap = (docs) => ({
  docs: docs.map(([id, data]) => ({ id, data: () => data })),
  forEach(cb) {
    this.docs.forEach(cb);
  },
});

function makeTransaction(getResult) {
  return { get: vi.fn(async () => getResult), set: vi.fn(), update: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createOrder", () => {
  it("assigns the next daily order number and stores items as-is", async () => {
    fs.transaction = makeTransaction({ data: () => ({ lastOrderNumber: 4 }) });
    const items = [{ id: 2, name: "המבורגר", allowsToppings: true, mods: ["noOnion"] }];

    const ref = await orders.createOrder({
      customerName: "דנה",
      paymentRequested: "cash",
      total: 32,
      items,
    });

    expect(ref).toEqual({ id: "new-order-id" });
    const [counterCall, orderCall] = fs.transaction.set.mock.calls;
    expect(counterCall[0].path).toMatch(/^counters\/\d{4}-\d{2}-\d{2}$/);
    expect(counterCall[1]).toEqual({ lastOrderNumber: 5 });
    expect(orderCall[1]).toMatchObject({
      customerName: "דנה",
      status: "new",
      orderNumber: 5,
      total: 32,
      items,
      paymentActual: null,
      deliveryTime: null,
    });
    expect(orderCall[1].orderDateKey).toBe(counterCall[0].path.split("/")[1]);
  });

  it("starts at 1 when there is no counter yet", async () => {
    fs.transaction = makeTransaction({ data: () => undefined });
    await orders.createOrder({ items: [] });
    expect(fs.transaction.set.mock.calls[1][1].orderNumber).toBe(1);
  });
});

describe("status transitions", () => {
  it("payOrderInFirebase marks the order paid with the method", async () => {
    await orders.payOrderInFirebase("o1", "bit");
    expect(fs.updateDoc).toHaveBeenCalledWith(
      { path: "orders/o1" },
      { paymentMethod: "bit", paymentActual: "bit", status: "paid" }
    );
  });

  it("sendToKitchenInFirebase moves the order to in_progress", async () => {
    await orders.sendToKitchenInFirebase("o1");
    expect(fs.updateDoc).toHaveBeenCalledWith(
      { path: "orders/o1" },
      { status: "in_progress", sentToKitchenAt: "SERVER_TS" }
    );
  });

  it("markDeliveryDispatchedInFirebase records dispatch time", async () => {
    await orders.markDeliveryDispatchedInFirebase("o1");
    expect(fs.updateDoc.mock.calls[0][1]).toMatchObject({ dispatchedAt: "SERVER_TS" });
    expect(typeof fs.updateDoc.mock.calls[0][1].dispatchedAtClient).toBe("number");
  });
});

describe("deleteOrdersInFirebase", () => {
  it("does nothing for an empty list", async () => {
    await orders.deleteOrdersInFirebase([]);
    await orders.deleteOrdersInFirebase(null);
    expect(fs.batch.commit).not.toHaveBeenCalled();
  });

  it("batch-deletes the given ids", async () => {
    await orders.deleteOrdersInFirebase(["a", "", "b"]);
    expect(fs.batch.delete).toHaveBeenCalledTimes(2);
    expect(fs.batch.commit).toHaveBeenCalledOnce();
  });
});

describe("reading orders", () => {
  it("subscribeToOrders listens to today's orders, newest first", () => {
    const callback = vi.fn();
    fs.onSnapshot.mockImplementation((q, cb) => {
      expect(q.constraints[0]).toMatchObject({ field: "orderDateKey", op: "==" });
      cb(snap([["old", { createdAtClient: 1 }], ["new", { createdAtClient: 3 }], ["mid", { createdAt: { toMillis: () => 2 } }]]));
      return "unsubscribe";
    });

    expect(orders.subscribeToOrders(callback)).toBe("unsubscribe");
    expect(callback.mock.calls[0][0].map((o) => o.id)).toEqual(["new", "mid", "old"]);
  });

  it("fetchOrdersForDate returns [] without a date", async () => {
    expect(await orders.fetchOrdersForDate("")).toEqual([]);
    expect(fs.getDocs).not.toHaveBeenCalled();
  });

  it("fetchOrderDatesWithData returns valid date keys, newest first", async () => {
    fs.getDocs.mockResolvedValue(snap([["2026-10-01", {}], ["junk", {}], ["2026-10-29", {}]]));
    expect(await orders.fetchOrderDatesWithData()).toEqual(["2026-10-29", "2026-10-01"]);
  });

  it("subscribeToMenuRatings computes rounded averages and skips empty docs", () => {
    const callback = vi.fn();
    fs.onSnapshot.mockImplementation((_ref, cb) => {
      cb(snap([["2", { itemId: 2, ratingCount: 3, ratingSum: 13 }], ["4", { ratingCount: 0, ratingSum: 0 }]]));
    });
    orders.subscribeToMenuRatings(callback);
    expect(callback).toHaveBeenCalledWith({ 2: { count: 3, avg: 4.3 } });
  });
});

describe("submitOrderReviewInFirebase", () => {
  const existing = (data) => ({ exists: () => true, data: () => data });

  it("validates rating and items", async () => {
    await expect(orders.submitOrderReviewInFirebase("o1", { rating: 0, itemIds: [1] })).rejects.toThrow(
      "Invalid rating value"
    );
    await expect(orders.submitOrderReviewInFirebase("o1", { rating: 5, itemIds: [] })).rejects.toThrow(
      "No reviewable items"
    );
  });

  it("rejects missing or already-reviewed orders", async () => {
    fs.transaction = makeTransaction({ exists: () => false });
    await expect(orders.submitOrderReviewInFirebase("o1", { rating: 4, itemIds: [1] })).rejects.toThrow(
      "Order not found"
    );
    fs.transaction = makeTransaction(existing({ review: { rating: 5 } }));
    await expect(orders.submitOrderReviewInFirebase("o1", { rating: 4, itemIds: [1] })).rejects.toThrow(
      "Order already reviewed"
    );
  });

  it("stores the review and increments per-item ratings", async () => {
    fs.transaction = makeTransaction(existing({}));
    await orders.submitOrderReviewInFirebase("o1", {
      rating: 4.4,
      comment: `  ${"x".repeat(250)}  `,
      itemIds: [2, "2", 5, "bad"],
    });

    const review = fs.transaction.update.mock.calls[0][1].review;
    expect(review.rating).toBe(4);
    expect(review.comment).toHaveLength(200);
    expect(review.itemIds).toEqual([2, 5]);
    expect(fs.transaction.set).toHaveBeenCalledTimes(2);
    expect(fs.transaction.set.mock.calls[0][1]).toMatchObject({
      itemId: 2,
      ratingCount: { increment: 1 },
      ratingSum: { increment: 4 },
    });
  });
});
