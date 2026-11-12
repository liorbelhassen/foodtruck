// Hebrew Telegram message for a new order. Item lines follow the staff
// screens (orderItemLines in src/components/uiHelpersUtils.jsx).
import { DRINK_OPTIONS, EXTRA_DRINK_OPTIONS } from "../../src/components/customer/customerConstants.js";
import { modsKeysToDisplayLabels } from "../../src/components/customer/customerHelpers.js";

const TZ = "Asia/Jerusalem";
const MAX_TELEGRAM_TEXT = 4000; // Telegram limit is 4096 characters
const PAYMENT_LABELS = { cash: "מזומן", bit: "Bit", paybox: "PayBox" };
const DRINK_LABELS = Object.fromEntries([...DRINK_OPTIONS, ...EXTRA_DRINK_OPTIONS].map((d) => [d.key, d.label]));

function clean(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function itemDetailsText({ label, mods, showToppings, drink }) {
  const toppings = modsKeysToDisplayLabels(mods);
  const parts = [];
  if (showToppings) parts.push(toppings.length > 0 ? `+${toppings.join(", ")}` : "ללא תוספות");
  if (drink) parts.push(`🥤 ${drink}`);
  if (parts.length === 0) return null;
  return `${label ? `${label}: ` : ""}${parts.join(" · ")}`;
}

function itemLines(item) {
  if (Array.isArray(item?.familyMeals)) {
    return item.familyMeals
      .map((meal, idx) =>
        itemDetailsText({
          label: `מנה ${meal?.mealNumber || idx + 1}`,
          mods: meal?.mods,
          showToppings: true,
          drink: meal?.drinkLabel || DRINK_LABELS[meal?.drinkKey],
        })
      )
      .filter(Boolean);
  }
  const line = itemDetailsText({
    mods: item?.mods,
    showToppings: !!item?.allowsToppings || modsKeysToDisplayLabels(item?.mods).length > 0,
    drink: item?.drinkLabel || DRINK_LABELS[item?.drinkKey] || DRINK_LABELS[item?.drinkType],
  });
  return line ? [line] : [];
}

function groupItems(items) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object") continue;
    const name = clean(item.name) || "פריט לא ידוע";
    const lines = itemLines(item);
    // Same toppings in a different order are the same item.
    const sortedMods = (m) => (Array.isArray(m) ? [...m].sort() : m);
    const keyItem = Array.isArray(item.familyMeals)
      ? { ...item, familyMeals: item.familyMeals.map((meal) => ({ ...meal, mods: sortedMods(meal?.mods) })) }
      : { ...item, mods: sortedMods(item.mods) };
    const key = `${name}__${itemLines(keyItem).join("|")}`;
    const g = groups.get(key) || { name, lines, qty: 0 };
    g.qty += 1;
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function formatIsraelTime(ms) {
  if (!Number.isFinite(ms)) return "לא ידוע";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  return `${parts.hour}:${parts.minute} · ${parts.day}/${parts.month}/${parts.year}`;
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `₪${Math.round(v * 100) / 100}` : "לא ידוע";
}

export function formatOrderMessage(order, createdAtMs) {
  const lines = [];
  const num = order.orderNumber != null ? `#${order.orderNumber}` : "";
  lines.push(`🍔 הזמנה חדשה ${num}`.trim());
  lines.push(`👤 לקוח: ${clean(order.customerName) || "לקוח"}`);
  lines.push(`🕒 ${formatIsraelTime(createdAtMs)}`);

  lines.push("", "📋 פריטים:");
  const groups = groupItems(order.items);
  if (groups.length === 0) lines.push("• (אין פריטים)");
  for (const g of groups) {
    lines.push(`• ${g.qty}× ${g.name}`);
    for (const l of g.lines) lines.push(`   ${l}`);
  }

  lines.push("");
  if (order.deliveryTime || order.deliveryCity || order.deliveryAddress) {
    const parts = [clean(order.deliveryCity), clean(order.deliveryAddress), clean(order.deliveryTime)].filter(Boolean);
    lines.push(`🛵 משלוח: ${parts.join(" · ") || "כן"}`);
  } else {
    lines.push(`🏪 איסוף עצמי${order.pickupTime ? ` · ${clean(order.pickupTime)}` : ""}`);
  }
  const notes = [order.notes, order.note, order.comment].map(clean).filter(Boolean);
  lines.push(`📝 הערות: ${notes.length ? notes.join(" | ") : "אין"}`);

  const fee = Number(order.deliveryFee) || 0;
  lines.push(`💰 סכום: ${money(order.total)}${fee > 0 ? ` (כולל משלוח ${money(fee)})` : ""}`);
  const requested = clean(order.paymentRequested);
  lines.push(`💳 אמצעי תשלום שנבחר: ${requested ? PAYMENT_LABELS[requested] || requested : "לא נבחר"}`);
  const actual = clean(order.paymentActual);
  lines.push(
    actual
      ? `✅ תשלום אושר בקופה (${PAYMENT_LABELS[actual] || actual})`
      : "⏳ תשלום: טרם אושר"
  );

  let text = lines.join("\n");
  if (text.length > MAX_TELEGRAM_TEXT) text = `${text.slice(0, MAX_TELEGRAM_TEXT - 20)}\n… (ההודעה קוצרה)`;
  return text;
}
