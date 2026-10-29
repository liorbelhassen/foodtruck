import { describe, expect, it } from "vitest";
import {
  getDisplayItemName,
  isStandaloneDrinkItem,
  itemHasDrinkChoice,
  modsKeysToDisplayLabels,
  modsToLabel,
  replaceDrinkInName,
} from "./customerHelpers.js";

describe("getDisplayItemName", () => {
  it("brands combo meals as יאגנוב", () => {
    expect(getDisplayItemName("המבורגר + צ'יפס + שתיה")).toBe("יאגנוב המבורגר + צ'יפס + שתיה");
    expect(getDisplayItemName("המבורגר + צ'יפס + שתייה")).toBe("יאגנוב המבורגר + צ'יפס + שתיה");
    expect(getDisplayItemName("נקניקיה + צ'יפס + שתיה")).toBe("יאגנוב נקניקיה + צ'יפס + שתיה");
  });

  it("leaves other names unchanged", () => {
    expect(getDisplayItemName("צ'יפס")).toBe("צ'יפס");
  });
});

describe("drink detection", () => {
  it("recognises standalone drinks by name or id", () => {
    expect(isStandaloneDrinkItem({ name: "שתיה" })).toBe(true);
    expect(isStandaloneDrinkItem({ name: "שתיה נוספת" })).toBe(true);
    expect(isStandaloneDrinkItem({ name: "x", id: "CAN" })).toBe(true);
    expect(isStandaloneDrinkItem({ name: "המבורגר", id: 2 })).toBe(false);
    expect(isStandaloneDrinkItem(null)).toBe(false);
  });

  it("detects items that require a drink choice", () => {
    expect(itemHasDrinkChoice({ name: "המבורגר + צ'יפס + שתיה" })).toBe(true);
    expect(itemHasDrinkChoice({ name: "מבצע + פחית" })).toBe(true);
    expect(itemHasDrinkChoice({ name: "המבורגר" })).toBe(false);
  });
});

describe("replaceDrinkInName", () => {
  it("replaces the generic drink word with the chosen drink", () => {
    expect(replaceDrinkInName("המבורגר + צ'יפס + שתיה", "ספרייט")).toBe("המבורגר + צ'יפס + ספרייט");
    expect(replaceDrinkInName("פחית", "פאנטה")).toBe("פאנטה");
  });
});

describe("toppings labels", () => {
  it("maps topping keys to Hebrew labels, with overrides and ללא/בלי prefixes", () => {
    expect(modsKeysToDisplayLabels(["noOnion", "noPickles", "ללא חסה", "בלי עגבניה"])).toEqual([
      "בצל",
      "מלפפון חמוץ",
      "חסה",
      "עגבניה",
    ]);
  });

  it("drops unknown or invalid keys", () => {
    expect(modsKeysToDisplayLabels(["family:abc", "", 5, null])).toEqual([]);
    expect(modsKeysToDisplayLabels(undefined)).toEqual([]);
  });

  it("modsToLabel respects allowsToppings", () => {
    expect(modsToLabel({ allowsToppings: false, mods: ["noOnion"] })).toBe("");
    expect(modsToLabel({ allowsToppings: true, mods: [] })).toBe("ללא תוספות");
    expect(modsToLabel({ allowsToppings: true, mods: ["noOnion", "noMayo"] })).toBe("בצל, מיונז");
  });
});
