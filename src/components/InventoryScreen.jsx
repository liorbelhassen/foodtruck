import { useState } from "react";
import {
  menu,
  STAFF,
  staffChip,
  staffRootStyle,
  staffSubbarStyle,
  useStaffViewport,
} from "./uiHelpersUtils.jsx";
import { getDisplayItemName } from "./customer/customerHelpers.js";
import {
  DRINK_OPTIONS,
  EXTRA_DRINK_OPTIONS,
  drinkStockKey,
  menuStockKey,
} from "./customer/customerConstants.js";
import { setSoldOutInFirebase, setStockQtyInFirebase } from "../services/inventory.js";

const LOW_STOCK = 5;
const MENU_LABEL_OVERRIDES = { 6: "כל הפחיות", 8: "כל הבקבוקים" };

const PRODUCTS = [
  ...menu.map((item) => ({
    key: menuStockKey(item.id),
    label: MENU_LABEL_OVERRIDES[item.id] || getDisplayItemName(item.name),
    group: "מנות",
    img: item.parts?.find((part) => part.type === "image")?.src,
  })),
  ...DRINK_OPTIONS.map((d) => ({ key: drinkStockKey(d.key), label: d.label, group: "פחית ₪6", img: d.imageSrc })),
  ...EXTRA_DRINK_OPTIONS.map((d) => ({ key: drinkStockKey(d.key), label: d.label, group: "בקבוק ₪8", img: d.imageSrc })),
];

const qtyBtnStyle = {
  width: 30,
  height: 30,
  borderRadius: 10,
  border: `1.5px solid ${STAFF.line}`,
  background: "white",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "inherit",
  color: STAFF.ink,
};

export default function InventoryScreen({ soldOut = {}, qty = {} }) {
  const { ref, height, isMobile } = useStaffViewport();
  const [saving, setSaving] = useState({});
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({});

  const run = async (key, update) => {
    if (saving[key]) return;
    setSaving((prev) => ({ ...prev, [key]: true }));
    setError("");
    try {
      await update();
    } catch (err) {
      console.error("Inventory update failed:", err);
      setError("העדכון נכשל. נסו שוב.");
    } finally {
      setSaving((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const isTracked = (key) => typeof qty[key] === "number";
  const isOut = (key) => soldOut[key] === true || (isTracked(key) && qty[key] <= 0);

  const toggle = (key) =>
    run(key, () =>
      isOut(key)
        ? setSoldOutInFirebase(key, false, { clearQty: isTracked(key) && qty[key] <= 0 })
        : setSoldOutInFirebase(key, true)
    );

  const setQty = (key, value) => run(key, () => setStockQtyInFirebase(key, value));

  const commitDraft = (key) => {
    const raw = drafts[key];
    if (raw === undefined) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const text = String(raw).trim();
    if (text === "") {
      if (isTracked(key)) setQty(key, null);
      return;
    }
    const value = Number(text);
    if (Number.isFinite(value) && value >= 0 && value !== qty[key]) setQty(key, value);
  };

  const outList = PRODUCTS.filter((p) => isOut(p.key));
  const lowList = PRODUCTS.filter((p) => !isOut(p.key) && isTracked(p.key) && qty[p.key] <= LOW_STOCK);

  return (
    <div ref={ref} style={staffRootStyle(height)}>
      <div style={staffSubbarStyle()}>
        <b style={{ fontSize: 16 }}>📦 מלאי</b>
        <span style={{ fontSize: 13, color: STAFF.muted, fontWeight: 700 }}>חסרים:</span>
        {outList.length ? outList.map((p) => <span key={p.key} style={staffChip("bad")}>{p.label}</span>) : <span style={staffChip("ok")}>אין</span>}
        {lowList.length > 0 && (
          <>
            <span style={{ fontSize: 13, color: STAFF.muted, fontWeight: 700 }}>עומדים להיגמר:</span>
            {lowList.map((p) => (
              <span key={p.key} style={staffChip("warn")}>
                {p.label} · {qty[p.key]}
              </span>
            ))}
          </>
        )}
        {error && <span style={{ color: STAFF.bad, fontWeight: 800 }}>{error}</span>}
      </div>
      <div style={{ fontSize: 12, color: STAFF.muted, padding: "6px 12px 0" }}>
        לחיצה על מוצר מחליפה בין במלאי לחסר. כמות ריקה (∞) = בלי ספירה. כל הזמנה שנשלחת למטבח מורידה מהכמות, וכשמגיעים ל-0 המוצר נסגר ללקוחות.
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 10,
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 150}px, 1fr))`,
          gap: 8,
          alignContent: "start",
        }}
      >
        {PRODUCTS.map((p) => {
          const out = isOut(p.key);
          const tracked = isTracked(p.key);
          const count = qty[p.key];
          const low = tracked && !out && count <= LOW_STOCK;
          return (
            <div
              key={p.key}
              style={{
                background: out ? STAFF.badSoft : "white",
                border: `2px solid ${out ? "#fca5a5" : low ? "#fcd34d" : STAFF.line}`,
                borderRadius: 14,
                padding: 8,
                display: "grid",
                gap: 6,
                justifyItems: "center",
                textAlign: "center",
                opacity: saving[p.key] ? 0.6 : 1,
              }}
            >
              <button
                type="button"
                onClick={() => toggle(p.key)}
                aria-label={`${p.label}: ${out ? "חסר במלאי" : "במלאי"}`}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "grid", gap: 3, justifyItems: "center", width: "100%", color: STAFF.ink }}
              >
                {p.img ? (
                  <img src={p.img} alt="" style={{ height: 48, width: "100%", objectFit: "contain", filter: out ? "grayscale(1)" : "none", opacity: out ? 0.5 : 1 }} />
                ) : (
                  <div style={{ height: 48 }} />
                )}
                <span style={{ fontSize: 10.5, color: STAFF.muted, fontWeight: 800 }}>{p.group}</span>
                <b style={{ fontSize: 13, lineHeight: 1.25 }}>{p.label}</b>
                <span style={staffChip(out ? "bad" : low ? "warn" : "ok")}>{out ? "✕ חסר" : low ? `נשארו ${count}` : "✓ במלאי"}</span>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  aria-label={`הורדת כמות ${p.label}`}
                  disabled={!tracked || count <= 0}
                  onClick={() => setQty(p.key, count - 1)}
                  style={{ ...qtyBtnStyle, opacity: !tracked || count <= 0 ? 0.4 : 1 }}
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`כמות ${p.label}`}
                  placeholder="∞"
                  value={drafts[p.key] ?? (tracked ? String(count) : "")}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [p.key]: e.target.value.replace(/[^\d]/g, "") }))}
                  onBlur={() => commitDraft(p.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  style={{ width: 50, height: 30, boxSizing: "border-box", textAlign: "center", borderRadius: 10, border: `1.5px solid ${STAFF.line}`, fontWeight: 900, fontSize: 15, fontFamily: "inherit", color: STAFF.ink }}
                />
                <button type="button" aria-label={`הוספת כמות ${p.label}`} onClick={() => setQty(p.key, (tracked ? count : 0) + 1)} style={qtyBtnStyle}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
