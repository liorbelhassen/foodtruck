import { ALL_TOPPINGS, THEME } from "./customerConstants.js";

export function getDisplayItemName(name) {
  if (name === "המבורגר + צ'יפס + שתיה" || name === "המבורגר + צ'יפס + שתייה") {
    return "יאגנוב המבורגר + צ'יפס + שתיה";
  }

  if (name === "נקניקיה + צ'יפס + שתיה" || name === "נקניקיה + צ'יפס + שתייה") {
    return "יאגנוב נקניקיה + צ'יפס + שתיה";
  }

  return name;
}

export function isStandaloneDrinkItem(item) {
  const name = String(item?.name || "").trim();
  const id = String(item?.id || "").toLowerCase().trim();

  return (
    name === "פחית" ||
    name === "שתיה" ||
    name === "שתייה" ||
    name === "שתיה נוספת" ||
    id === "can" ||
    id === "drink"
  );
}

export function itemHasDrinkChoice(item) {
  const name = String(item?.name || "");
  return (
    isStandaloneDrinkItem(item) ||
    name.includes("שתיה") ||
    name.includes("שתייה") ||
    name.includes("פחית")
  );
}

export function replaceDrinkInName(name, drinkLabel) {
  return String(name)
    .replace(" + שתיה", ` + ${drinkLabel}`)
    .replace(" + שתייה", ` + ${drinkLabel}`)
    .replace(" + פחית", ` + ${drinkLabel}`)
    .replace("שתיה", drinkLabel)
    .replace("שתייה", drinkLabel)
    .replace("פחית", drinkLabel);
}

const MOD_DISPLAY_OVERRIDES = {
  noPickles: "מלפפון חמוץ",
};

function modKeyToDisplayLabel(modKey) {
  if (typeof modKey !== "string") return null;

  const normalized = modKey.trim();
  if (!normalized) return null;

  if (normalized.startsWith("ללא ") || normalized.startsWith("בלי ")) {
    return normalized.replace(/^ללא\s+|^בלי\s+/, "").trim() || null;
  }

  if (MOD_DISPLAY_OVERRIDES[normalized]) {
    return MOD_DISPLAY_OVERRIDES[normalized];
  }

  const match = ALL_TOPPINGS.find((t) => t.key === normalized);
  if (match?.label) return match.label;

  return null;
}

export function modsKeysToDisplayLabels(mods) {
  if (!Array.isArray(mods)) return [];

  return mods
    .map((modKey) => modKeyToDisplayLabel(modKey))
    .filter(Boolean);
}

export function modsToLabel(item) {
  if (!item?.allowsToppings) return "";
  const selected = modsKeysToDisplayLabels(item.mods);
  return selected.length === 0 ? "ללא תוספות" : selected.join(", ");
}

export function cardStyle() {
  return {
    border: "1px solid rgba(255,255,255,0.5)",
    borderRadius: 24,
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(8px)",
    boxShadow: "0 14px 34px rgba(15,23,42,0.08)",
  };
}

export function panelStyle() {
  return {
    background: THEME.surfaceAlt,
    border: `1px solid ${THEME.borderSoft}`,
    borderRadius: 18,
    padding: 10,
    display: "grid",
    gap: 8,
  };
}
