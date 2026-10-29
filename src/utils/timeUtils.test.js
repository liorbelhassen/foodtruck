import { describe, expect, it } from "vitest";
import { toMillis } from "./timeUtils.js";

describe("toMillis", () => {
  it("returns null for null/undefined", () => {
    expect(toMillis(null)).toBeNull();
    expect(toMillis(undefined)).toBeNull();
  });

  it("passes finite numbers through and rejects non-finite ones", () => {
    expect(toMillis(1234)).toBe(1234);
    expect(toMillis(0)).toBe(0);
    expect(toMillis(NaN)).toBeNull();
    expect(toMillis(Infinity)).toBeNull();
  });

  it("converts Date and Firestore-Timestamp-like objects", () => {
    expect(toMillis(new Date(5000))).toBe(5000);
    expect(toMillis({ toMillis: () => 7000 })).toBe(7000);
    expect(toMillis({ toMillis: () => NaN })).toBeNull();
  });

  it("returns null for unsupported values", () => {
    expect(toMillis("2026-01-01")).toBeNull();
    expect(toMillis({})).toBeNull();
  });
});
