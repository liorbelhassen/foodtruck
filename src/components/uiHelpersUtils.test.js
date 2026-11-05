import { describe, expect, it } from "vitest";
import {
  buildItemParts,
  formatCustomerLabel,
  formatDurationMs,
  getIncludedToppings,
  getIncludedToppingsLabel,
  groupCart,
  menu,
  statusLabel,
} from "./uiHelpersUtils.jsx";

describe("menu", () => {
  it("has unique ids and positive prices", () => {
    const ids = menu.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    menu.forEach((m) => expect(m.price).toBeGreaterThan(0));
  });
});

describe("formatCustomerLabel", () => {
  it("shows first name and last initial", () => {
    expect(formatCustomerLabel("חיים לוי")).toBe("חיים ל.");
    expect(formatCustomerLabel("  דנה  ")).toBe("דנה");
    expect(formatCustomerLabel("")).toBe("לקוח");
    expect(formatCustomerLabel(null)).toBe("לקוח");
  });
});

describe("groupCart", () => {
  it("groups identical items regardless of toppings order", () => {
    const grouped = groupCart([
      { name: "המבורגר", mods: ["noOnion", "noMayo"], price: 32 },
      { name: "המבורגר", mods: ["noMayo", "noOnion"], price: 32 },
      { name: "המבורגר", mods: [], price: 32 },
    ]);
    expect(grouped).toHaveLength(2);
    const quantities = grouped.map(([, item]) => item.qty).sort();
    expect(quantities).toEqual([1, 2]);
  });

  it("ignores invalid entries and names unknown items", () => {
    const grouped = groupCart([null, "x", { name: "  " }]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0][1]).toMatchObject({ name: "פריט לא ידוע", qty: 1, mods: [] });
    expect(groupCart(undefined)).toEqual([]);
  });
});

describe("statusLabel", () => {
  it.each([
    ["new", "ההזמנה התקבלה"],
    ["pending", "ממתין לתשלום"],
    ["paid", "שולם"],
    ["in_progress", "בהכנה"],
    ["ready", "מוכן"],
    ["delivered", "נמסר ללקוח"],
  ])("%s -> %s", (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });

  it("falls back for unknown values", () => {
    expect(statusLabel("weird")).toBe("weird");
    expect(statusLabel(null)).toBe("-");
    expect(statusLabel(3)).toBe("3");
  });
});

describe("formatDurationMs", () => {
  it("formats mm:ss between two timestamps", () => {
    expect(formatDurationMs(0, 125000)).toBe("02:05");
    expect(formatDurationMs(new Date(0), { toMillis: () => 59000 })).toBe("00:59");
  });

  it("clamps negative durations and handles missing values", () => {
    expect(formatDurationMs(10000, 0)).toBe("00:00");
    expect(formatDurationMs(null, 1000)).toBeNull();
  });
});

describe("getIncludedToppings", () => {
  it("returns labels for items that allow toppings", () => {
    expect(getIncludedToppings({ allowsToppings: true, mods: ["noOnion", "noLettuce"] })).toEqual([
      "בצל",
      "חסה",
    ]);
    expect(getIncludedToppingsLabel({ allowsToppings: true, mods: ["noKetchup"] })).toBe("קטשופ");
  });

  it("returns nothing when toppings are not allowed or empty", () => {
    expect(getIncludedToppings({ allowsToppings: false, mods: ["noOnion"] })).toEqual([]);
    expect(getIncludedToppingsLabel({ allowsToppings: true, mods: [] })).toBe("ללא תוספות");
  });
});

describe("buildItemParts", () => {
  const partsById = {
    1: [
      { type: "image", src: "/burger.png", alt: "המבורגר" },
      { type: "image", src: "/can.png", alt: "פחית" },
    ],
  };

  it("swaps the generic drink image for the chosen drink", () => {
    const parts = buildItemParts({ id: 1, drinkKey: "sprite" }, partsById);
    expect(parts[1]).toMatchObject({ src: "/sprite.png" });
    expect(partsById[1][1].src).toBe("/can.png");
  });

  it("returns a copy of the base parts when no drink is chosen", () => {
    expect(buildItemParts({ id: 1 }, partsById)).toEqual(partsById[1]);
    expect(buildItemParts({ id: 99 }, partsById)).toEqual([]);
  });
});
