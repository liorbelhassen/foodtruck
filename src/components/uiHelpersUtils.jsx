import { modsKeysToDisplayLabels } from "./customer/customerHelpers.js";
import { ALL_TOPPINGS, DRINK_OPTIONS, EXTRA_DRINK_OPTIONS } from "./customer/customerConstants.js";

const ALL_DRINKS = [...DRINK_OPTIONS, ...EXTRA_DRINK_OPTIONS];
const drinkImageMap = Object.fromEntries(ALL_DRINKS.map((d) => [d.key, d.imageSrc]));

export function buildItemParts(item, menuPartsById) {
  const base = (menuPartsById[item?.id] || []).map((p) => ({ ...p }));
  const drinkSrc = item?.drinkKey ? drinkImageMap[item.drinkKey] : null;
  if (drinkSrc) {
    const drinkIdx = base.findIndex(
      (p) => p.type === "image" && (p.alt?.includes("שתיה") || p.alt?.includes("פחית"))
    );
    if (drinkIdx !== -1) {
      base[drinkIdx] = { type: "image", src: drinkSrc, alt: item.drinkLabel || "שתיה" };
    } else {
      base.push({ type: "plus" }, { type: "image", src: drinkSrc, alt: item.drinkLabel || "שתיה" });
    }
  }
  return base;
}

export const logoUrl = "/logo.png";

export const toppingOptions = [
  { negativeKey: "בצל", label: "בצל", kind: "onion" },
  { negativeKey: "חסה", label: "חסה", kind: "lettuce" },
  { negativeKey: "עגבניה", label: "עגבניה", kind: "tomato" },
];

export const menu = [
  {
    id: 1,
    name: "המבורגר + צ'יפס + שתיה",
    price: 40,
    allowsToppings: true,
    parts: [
      {
        type: "image",
        src: "/Combo burger.png",
        alt: "יאגנוב המבורגר + צ'יפס + שתיה",
      },
    ],
  },
  {
    id: 2,
    name: "המבורגר",
    price: 32,
    allowsToppings: true,
    parts: [
      {
        type: "image",
        src: "/burger and chips.png",
        alt: "המבורגר",
      },
    ],
  },
  {
    id: 3,
    name: "נקניקיה + צ'יפס + שתיה",
    price: 25,
    allowsToppings: true,
    parts: [
      {
        type: "image",
        src: "/hotdog.png",
        alt: "נקניקיה בלחמניה",
      },
      { type: "plus" },
      {
        type: "image",
        src: "/chips.jpeg",
        alt: "צ'יפס",
      },
      { type: "plus" },
      {
        type: "image",
        src: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=80",
        alt: "פחית שתיה",
      },
    ],
  },
  {
    id: 4,
    name: "נקניקיה בלחמניה",
    price: 13,
    allowsToppings: true,
    parts: [
      {
        type: "image",
        src: "/hotdog.png",
        alt: "נקניקיה בלחמניה",
      },
    ],
  },
  {
    id: 5,
    name: "צ'יפס",
    price: 8,
    allowsToppings: false,
    parts: [
      {
        type: "image",
        src: "/chips.jpeg",
        alt: "צ'יפס",
      },
    ],
  },
  {
    id: 7,
    name: "מבצע משפחתי - x4 יאגנוב המבורגר",
    price: 150,
    allowsToppings: true,
    parts: [
      {
        type: "image",
        src: "https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=900&q=80",
        alt: "המבורגר",
      },
      { type: "plus" },
      {
        type: "image",
        src: "/chips.jpeg",
        alt: "צ'יפס",
      },
      { type: "plus" },
      {
        type: "image",
        src: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=80",
        alt: "פחית שתיה",
      },
    ],
  },
  {
    id: 6,
    name: "שתיה",
    price: 6,
    allowsToppings: false,
    parts: [
      {
        type: "image",
        src: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=80",
        alt: "פחית שתיה",
      },
    ],
  },
  {
    id: 8,
    name: "שתיה נוספת",
    price: 8,
    allowsToppings: false,
    parts: [
      {
        type: "image",
        src: "/fuzetea.jpeg",
        alt: "שתיה נוספת",
      },
    ],
  },
];

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function createEmptyShift(dateKey) {
  return {
    dateKey,
    orders: [],
    nextOrderNumber: 1,
  };
}

export function formatCustomerLabel(fullName) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "לקוח";
  const firstName = parts[0];
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : "";
  return `${firstName}${lastInitial}`;
}

export function groupCart(cart) {
  const safeCart = Array.isArray(cart) ? cart : [];

  return Object.entries(
    safeCart.reduce((acc, item) => {
      const safeItem = item && typeof item === "object" ? item : null;
      if (!safeItem) return acc;

      const rawName = typeof safeItem.name === "string" ? safeItem.name.trim() : "";
      const name = rawName || "פריט לא ידוע";
      const mods = Array.isArray(safeItem.mods) ? safeItem.mods : [];
      const key = `${name}__${mods.slice().sort().join(",")}`;

      if (!acc[key]) {
        acc[key] = {
          ...safeItem,
          name,
          mods,
          qty: 0,
        };
      }

      acc[key].qty += 1;
      return acc;
    }, {})
  );
}

export function statusLabel(status) {
  const safeStatus =
    typeof status === "string"
      ? status
      : status == null
        ? "-"
        : String(status);

  if (safeStatus === "new") return "ההזמנה התקבלה";
  if (safeStatus === "pending") return "ממתין לתשלום";
  if (safeStatus === "paid") return "שולם";
  if (safeStatus === "in_progress") return "בהכנה";
  if (safeStatus === "ready") return "מוכן";
  if (safeStatus === "delivered") return "נמסר ללקוח";
  return safeStatus;
}

export function formatDurationMs(start, end) {
  const toMillis = (value) => {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "object" && typeof value.toMillis === "function") {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  };

  const startMs = toMillis(start);
  const endMs = toMillis(end);
  if (startMs == null || endMs == null) return null;

  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function getIncludedToppings(item) {
  if (!item?.allowsToppings) return [];
  return modsKeysToDisplayLabels(item?.mods);
}

export function getIncludedToppingsLabel(item) {
  const selected = getIncludedToppings(item);
  if (!Array.isArray(selected)) return "ללא תוספות";

  const normalized = selected
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!normalized.length) return "ללא תוספות";
  return normalized.join(", ");
}

export function screenCardStyle() {
  return {
    maxWidth: "980px",
    margin: "0 auto",
    background: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(8px)",
    borderRadius: "28px",
    boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
    padding: "24px",
    border: "1px solid rgba(255,255,255,0.7)",
  };
}

export function chartBoxStyle() {
  return {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: "22px",
    padding: "16px",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  };
}

export function statusPill(status) {
  const styles = {
    new: { background: "#fef3c7", color: "#92400e" },
    pending: { background: "#fef3c7", color: "#92400e" },
    paid: { background: "#dbeafe", color: "#1d4ed8" },
    in_progress: { background: "#fde68a", color: "#92400e" },
    ready: { background: "#dcfce7", color: "#166534" },
    delivered: { background: "#ede9fe", color: "#6d28d9" },
  };

  const s = styles[status] || {
    background: "#e5e7eb",
    color: "#111827",
  };

  return {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 700,
    background: s.background,
    color: s.color,
  };
}
