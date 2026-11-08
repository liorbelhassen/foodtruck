import { useLayoutEffect, useRef, useState } from "react";
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
    price: 43,
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
    price: 35,
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
        src: "/Combo burger.png",
        alt: "מבצע משפחתי - x4 יאגנוב המבורגר",
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

export const STAFF = {
  bg: "#fbf7f1",
  ink: "#2b2118",
  muted: "#8a7b6c",
  accent: "#e2552a",
  accentSoft: "#fdeee6",
  accentInk: "#c2410c",
  line: "#ecdfd0",
  soft: "#f4ece2",
  ok: "#047857",
  okSoft: "#ecfdf5",
  bad: "#b91c1c",
  badSoft: "#fef2f2",
  warn: "#b45309",
  warnSoft: "#fffbeb",
  del: "#3730a3",
  delSoft: "#eef2ff",
};

export const PAYMENT_LABELS = { cash: "💵 מזומן", bit: "Bit", paybox: "PayBox" };

export function staffChip(tone = "neutral") {
  const tones = {
    neutral: [STAFF.soft, STAFF.ink],
    ok: [STAFF.okSoft, STAFF.ok],
    bad: [STAFF.badSoft, STAFF.bad],
    warn: [STAFF.warnSoft, STAFF.warn],
    accent: [STAFF.accentSoft, STAFF.accentInk],
    del: [STAFF.delSoft, STAFF.del],
  };
  const [background, color] = tones[tone] || tones.neutral;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background,
    color,
    whiteSpace: "nowrap",
  };
}

export function staffBtn(kind = "accent", big = false) {
  const kinds = {
    accent: { background: STAFF.accent, color: "white", border: "none" },
    ok: { background: STAFF.ok, color: "white", border: "none" },
    ghost: { background: "white", color: STAFF.ink, border: `1.5px solid ${STAFF.line}` },
    danger: { background: STAFF.badSoft, color: STAFF.bad, border: "1px solid #fecaca" },
  };
  return {
    ...(kinds[kind] || kinds.accent),
    padding: big ? "14px 16px" : "9px 14px",
    borderRadius: 14,
    fontWeight: 900,
    fontSize: big ? 18 : 14,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };
}

export function staffRootStyle(height) {
  return {
    height,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    background: STAFF.bg,
    color: STAFF.ink,
    borderRadius: 18,
    border: `1px solid ${STAFF.line}`,
    overflow: "hidden",
    direction: "rtl",
    textAlign: "right",
    position: "relative",
  };
}

export function staffSubbarStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: `1px solid ${STAFF.line}`,
    background: "white",
    flexWrap: "wrap",
  };
}

export function orderTypeText(order) {
  if (order?.deliveryTime) return `🛵 ${order.deliveryCity || "משלוח"} · ${order.deliveryTime}`;
  return `🏪 איסוף${order?.pickupTime ? ` · ${order.pickupTime}` : ""}`;
}

const staffDrinkLabelByKey = Object.fromEntries(ALL_DRINKS.map((d) => [d.key, d.label]));

function itemDetailsText({ label, mods, showToppings, drink }) {
  const toppings = modsKeysToDisplayLabels(mods);
  const parts = [];
  if (showToppings) parts.push(toppings.length > 0 ? `+${toppings.join(", ")}` : "ללא תוספות");
  if (drink) parts.push(`🥤 ${drink}`);
  if (parts.length === 0) return null;
  return `${label ? `${label}: ` : ""}${parts.join(" · ")}`;
}

export function orderItemLines(item) {
  if (Array.isArray(item?.familyMeals)) {
    return item.familyMeals
      .map((meal, idx) =>
        itemDetailsText({
          label: `מנה ${meal?.mealNumber || idx + 1}`,
          mods: meal?.mods,
          showToppings: true,
          drink: meal?.drinkLabel || staffDrinkLabelByKey[meal?.drinkKey],
        })
      )
      .filter(Boolean);
  }
  const line = itemDetailsText({
    mods: item?.mods,
    showToppings: !!item?.allowsToppings || modsKeysToDisplayLabels(item?.mods).length > 0,
    drink:
      item?.drinkLabel ||
      staffDrinkLabelByKey[item?.drinkKey] ||
      staffDrinkLabelByKey[item?.drinkType],
  });
  return line ? [line] : [];
}

export function minutesSince(value, nowMs = Date.now()) {
  const ms = typeof value === "number" ? value : value?.toMillis?.() ?? (value?.seconds != null ? value.seconds * 1000 : null);
  if (ms == null) return null;
  return Math.max(0, Math.floor((nowMs - ms) / 60000));
}

export function useStaffViewport() {
  const ref = useRef(null);
  const [state, setState] = useState(() => ({
    height: 600,
    isMobile: typeof window !== "undefined" && window.innerWidth <= 900,
  }));
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const isMobile = window.innerWidth <= 900;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(420, Math.floor(window.innerHeight - top - (isMobile ? 18 : 20)));
      setState((prev) => (prev.height === height && prev.isMobile === isMobile ? prev : { isMobile, height }));
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { ref, ...state };
}

