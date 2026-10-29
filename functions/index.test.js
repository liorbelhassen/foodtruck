import { beforeAll, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";

vi.mock("firebase-admin/app", () => ({ initializeApp: vi.fn() }));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ collection: vi.fn() })),
  Timestamp: { fromDate: (d) => d },
}));
vi.mock("firebase-admin/storage", () => ({ getStorage: vi.fn(() => ({})) }));
vi.mock("firebase-functions/v2/https", () => ({ onRequest: (_opts, handler) => handler }));
vi.mock("firebase-functions/v2/scheduler", () => ({ onSchedule: (_opts, handler) => handler }));
vi.mock("firebase-functions/logger", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const TZ = "Asia/Jerusalem";
const at = (iso) => DateTime.fromISO(iso, { zone: TZ }).toMillis();

let t;
let mod;

beforeAll(async () => {
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.REPORTS_MANUAL_TOKEN = "secret-token";
  vi.spyOn(console, "log").mockImplementation(() => {});
  mod = await import("./index.js");
  t = mod.__testables;
});

describe("date helpers (Israel time)", () => {
  it("getIsraelDateKey formats yyyy-LL-dd", () => {
    expect(t.getIsraelDateKey(DateTime.fromISO("2026-10-29T23:30", { zone: TZ }))).toBe(
      "2026-10-29"
    );
  });

  it("getRangeWindow spans whole Israel days, inclusive of the end day", () => {
    const w = t.getRangeWindow("2026-10-01", "2026-10-02");
    expect(w.startMs).toBe(at("2026-10-01T00:00"));
    expect(w.endMs).toBe(at("2026-10-03T00:00"));
    expect(() => t.getRangeWindow("bad", "2026-10-02")).toThrow(/Invalid range/);
  });

  it("weekly report covers the 7 days ending yesterday", () => {
    const friday = DateTime.fromISO("2026-10-30T06:00", { zone: TZ });
    expect(t.getWeekDateKeysEndingYesterday(friday)).toEqual({
      startDateKey: "2026-10-23",
      endDateKey: "2026-10-29",
    });
  });

  it("getOrderCreatedMillis prefers createdAtClient, then createdAt", () => {
    expect(t.getOrderCreatedMillis({ createdAtClient: 10, createdAt: { toMillis: () => 20 } })).toBe(10);
    expect(t.getOrderCreatedMillis({ createdAt: { toMillis: () => 20 } })).toBe(20);
    expect(t.getOrderCreatedMillis({})).toBeNull();
  });
});

describe("normalizePaymentMethod", () => {
  it.each([
    [{ paymentMethod: "cash" }, "cash"],
    [{ paymentActual: "מזומן" }, "cash"],
    [{ paymentRequested: "BIT" }, "bit"],
    [{ paymentMethod: "Pay Box" }, "paybox"],
    [{ paymentMethod: "card" }, null],
    [{}, null],
  ])("%j -> %s", (order, expected) => {
    expect(t.normalizePaymentMethod(order)).toBe(expected);
  });

  it("paymentMethod wins over requested", () => {
    expect(t.normalizePaymentMethod({ paymentMethod: "cash", paymentRequested: "bit" })).toBe("cash");
  });
});

describe("drinks", () => {
  it("normalizes drink keys and aliases to Hebrew labels", () => {
    expect(t.normalizeDrinkLabel("coke")).toBe("קוקה קולה");
    expect(t.normalizeDrinkLabel("cokeZero")).toBe("קולה זירו");
    expect(t.normalizeDrinkLabel("Sprite")).toBe("ספרייט");
    expect(t.normalizeDrinkLabel("")).toBeNull();
  });

  it("extracts drinks from drinkType, multiplied by quantity", () => {
    expect(t.extractDrinksFromItem({ name: "x", drinkType: "fanta" }, 2)).toEqual(["פאנטה", "פאנטה"]);
  });

  it("extracts one drink per family meal", () => {
    const item = { familyMeals: [{ drinkKey: "coke" }, { drinkLabel: "ספרייט" }, {}] };
    expect(t.extractDrinksFromItem(item, 1)).toEqual(["קוקה קולה", "ספרייט"]);
  });

  // Known bug: normalizeDrinkLabel returns any unknown name as-is, so food items
  // (e.g. "המבורגר") end up in the drinks inventory of the report.
  it.fails("does not count food items as drinks", () => {
    expect(t.extractDrinksFromItem({ name: "המבורגר" }, 1)).toEqual([]);
  });
});

describe("item classification", () => {
  it("detects family deal, hamburger and hotdog items", () => {
    expect(t.isFamilyDealItem("מבצע משפחתי - x4 יאגנוב המבורגר")).toBe(true);
    expect(t.isHamburgerItem("יאגנוב המבורגר + צ'יפס")).toBe(true);
    expect(t.isHotdogItem("נקניקיה בלחמניה")).toBe(true);
    expect(t.isHotdogItem("צ'יפס")).toBe(false);
  });
});

describe("getPrepDurationMs", () => {
  it("uses stored prepDurationMs when present (clamped at 0)", () => {
    expect(t.getPrepDurationMs({ prepDurationMs: 90000 })).toBe(90000);
    expect(t.getPrepDurationMs({ prepDurationMs: -5 })).toBe(0);
  });

  it("falls back to kitchenStartedAt / sentToKitchenAt / createdAt until readyAt", () => {
    expect(t.getPrepDurationMs({ kitchenStartedAt: 1000, sentToKitchenAt: 0, readyAt: 61000 })).toBe(60000);
    expect(t.getPrepDurationMs({ sentToKitchenAt: 1000, readyAt: 31000 })).toBe(30000);
    expect(t.getPrepDurationMs({ createdAtClient: 0, readyAt: 5000 })).toBe(5000);
  });

  it("returns null when not ready or timestamps are inverted", () => {
    expect(t.getPrepDurationMs({ sentToKitchenAt: 1000 })).toBeNull();
    expect(t.getPrepDurationMs({ sentToKitchenAt: 5000, readyAt: 1000 })).toBeNull();
  });
});

describe("computeMetrics", () => {
  const orders = [
    {
      paymentMethod: "cash",
      total: 40,
      status: "delivered",
      createdAtClient: at("2026-10-29T12:30"),
      sentToKitchenAt: 1_000_000,
      readyAt: 1_300_000,
      items: [
        { name: "המבורגר", price: 32, qty: 1, allowsToppings: true, mods: ["noOnion"] },
        { name: "שתיה", price: 8, drinkType: "coke" },
      ],
    },
    {
      paymentRequested: "bit",
      total: 25,
      status: "ready",
      createdAtClient: at("2026-10-29T12:45"),
      prepDurationMs: 600_000,
      items: [{ name: "נקניקיה + צ'יפס + שתיה", price: 25, qty: 2, drinkType: "sprite" }],
    },
    {
      total: 150,
      status: "new",
      createdAtClient: at("2026-10-29T18:05"),
      items: [
        {
          name: "מבצע משפחתי - x4 יאגנוב המבורגר",
          price: 150,
          familyMeals: [
            { drinkKey: "fanta" },
            { drinkKey: "coke" },
            { drinkKey: "fanta" },
            { drinkKey: "sprite" },
          ],
        },
      ],
    },
  ];

  const m = () => t.computeMetrics(orders, "2026-10-29");

  it("counts orders, revenue per payment method and average order value", () => {
    const r = m();
    expect(r.dateKey).toBe("2026-10-29");
    expect(r.totalOrders).toBe(3);
    expect(r.paymentTotals).toEqual({ cash: 40, bit: 25, paybox: 0 });
    expect(r.totalRevenue).toBe(65);
    expect(r.averageOrderValue).toBe(32.5);
    expect(r.paymentShare.cash).toBeCloseTo((40 / 65) * 100);
  });

  it("counts statuses and completed orders", () => {
    const r = m();
    expect(r.statusCounts).toEqual({ new: 1, paid: 0, in_progress: 0, ready: 1, delivered: 1 });
    expect(r.completedOrDeliveredOrders).toBe(2);
  });

  it("computes inventory: patties, sausages and drinks from drinkType/familyMeals", () => {
    const r = m();
    expect(r.inventory.burgerPatties).toBe(5);
    expect(r.inventory.sausages).toBe(4);
    const drinks = Object.fromEntries(r.inventory.drinks.map((d) => [d.drink, d.count]));
    expect(drinks["קוקה קולה"]).toBe(2);
    expect(drinks["ספרייט"]).toBe(3);
    expect(drinks["פאנטה"]).toBe(2);
  });

  // Known bug: computeMetrics re-normalizes "קולה זירו", which matches the "קולה"
  // alias of Coca-Cola first, so Coke Zero is reported as Coca-Cola.
  it.fails("reports Coke Zero separately from Coca-Cola", () => {
    const r = t.computeMetrics([{ items: [{ name: "שתיה", drinkType: "cokeZero" }] }], "2026-10-29");
    expect(r.inventory.drinks).toEqual([{ drink: "קולה זירו", count: 1 }]);
  });

  it("finds busiest hour, top item and average prep time", () => {
    const r = m();
    expect(r.busiestHour).toEqual({ hour: "12:00", count: 2 });
    expect(r.loadByHour[18].count).toBe(1);
    expect(r.topItem).toMatchObject({ name: "נקניקיה + צ'יפס + שתיה", qty: 2, revenue: 50 });
    expect(r.averagePrepDurationMs).toBe(450_000);
  });

  it("handles an empty day", () => {
    const r = t.computeMetrics([], "2026-10-29");
    expect(r.totalRevenue).toBe(0);
    expect(r.averageOrderValue).toBe(0);
    expect(r.topItem).toEqual({ name: "--", qty: 0 });
    expect(r.topDrink).toEqual({ label: "--", count: 0 });
    expect(r.averagePrepDurationMs).toBeNull();
  });
});

describe("formatting", () => {
  it("formats money and minutes", () => {
    expect(t.formatMoney(12.5)).toBe("₪12.50");
    expect(t.formatMoney(null)).toBe("₪0.00");
    expect(t.formatDurationMinutes(150000)).toBe("3 דקות");
    expect(t.formatDurationMinutes(null)).toBe("--");
  });
});

describe("manual report request parsing", () => {
  const req = (over = {}) => ({ headers: {}, query: {}, body: {}, method: "GET", ...over });

  it("reads the token from header, query, body or bearer", () => {
    expect(t.extractManualToken(req({ headers: { "x-report-token": "a" } }))).toBe("a");
    expect(t.extractManualToken(req({ query: { token: "b" } }))).toBe("b");
    expect(t.extractManualToken(req({ body: { token: "c" } }))).toBe("c");
    expect(t.extractManualToken(req({ headers: { authorization: "Bearer d" } }))).toBe("d");
  });

  it("resolves explicit range, single day, or defaults to last week", () => {
    expect(t.resolveManualRange(req({ query: { startDateKey: "2026-10-01", endDateKey: "2026-10-07" } }))).toEqual({
      startDateKey: "2026-10-01",
      endDateKey: "2026-10-07",
    });
    expect(t.resolveManualRange(req({ body: { dateKey: "2026-10-05" } }))).toEqual({
      startDateKey: "2026-10-05",
      endDateKey: "2026-10-05",
    });
    expect(t.resolveManualRange(req({ query: { dateKey: "05/10/2026" } }))).toEqual(
      t.getWeekDateKeysEndingYesterday()
    );
  });

  const fakeRes = () => {
    const res = { statusCode: 0, body: null };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    return res;
  };

  it("generateDailyReportNow rejects bad methods and wrong tokens", async () => {
    const r1 = fakeRes();
    await mod.generateDailyReportNow(req({ method: "PUT" }), r1);
    expect(r1.statusCode).toBe(405);

    const r2 = fakeRes();
    await mod.generateDailyReportNow(req({ query: { token: "wrong" } }), r2);
    expect(r2.statusCode).toBe(403);
  });
});
