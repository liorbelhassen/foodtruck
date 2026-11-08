import { describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({ db: { name: "db" } }));
vi.mock("firebase/firestore", () => ({
  doc: () => ({ path: "inventory/status" }),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  deleteField: () => "DELETE",
  runTransaction: vi.fn(),
}));

const { effectiveSoldOut, stockUsageForItems } = await import("./inventory.js");

describe("inventory quantities", () => {
  it("treats a tracked quantity of 0 as sold out and leaves untracked items alone", () => {
    expect(effectiveSoldOut({ "menu-1": true }, { "drink-coke": 0, "drink-fanta": 4 })).toEqual({
      "menu-1": true,
      "drink-coke": true,
    });
  });

  it("counts menu items, meal drinks and family-deal drinks", () => {
    const usage = stockUsageForItems([
      { id: 1, drinkType: "coke" },
      { id: 1, drinkType: "fuzetea" },
      { id: 6, drinkType: "coke" },
      { id: 7, familyMeals: [{ drinkKey: "sprite" }, { drinkKey: "sprite" }, { drinkKey: "coke" }, { drinkKey: "fanta" }] },
    ]);
    expect(usage).toEqual({
      "menu-1": 2,
      "menu-6": 1,
      "menu-7": 1,
      "drink-coke": 3,
      "drink-fuzetea": 1,
      "drink-sprite": 2,
      "drink-fanta": 1,
    });
  });
});
