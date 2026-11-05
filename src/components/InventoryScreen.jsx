import { useState } from "react";
import { LogoHeader, screenCardStyle, SectionTitle } from "./uiHelpers.jsx";
import { menu } from "./uiHelpersUtils.jsx";
import { getDisplayItemName } from "./customer/customerHelpers.js";
import {
  DRINK_OPTIONS,
  EXTRA_DRINK_OPTIONS,
  drinkStockKey,
  menuStockKey,
} from "./customer/customerConstants.js";
import { setSoldOutInFirebase } from "../services/inventory.js";

const SECTIONS = [
  {
    title: "מנות",
    items: menu.map((item) => ({ key: menuStockKey(item.id), label: getDisplayItemName(item.name) })),
  },
  {
    title: "שתיה (פחיות)",
    items: DRINK_OPTIONS.map((drink) => ({ key: drinkStockKey(drink.key), label: drink.label })),
  },
  {
    title: "שתיה (בקבוקים קטנים)",
    items: EXTRA_DRINK_OPTIONS.map((drink) => ({ key: drinkStockKey(drink.key), label: drink.label })),
  },
];

export default function InventoryScreen({ soldOut = {} }) {
  const [saving, setSaving] = useState({});
  const [error, setError] = useState("");

  const toggle = async (key) => {
    if (saving[key]) return;
    setSaving((prev) => ({ ...prev, [key]: true }));
    setError("");
    try {
      await setSoldOutInFirebase(key, !soldOut[key]);
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

  return (
    <div style={screenCardStyle()}>
      <LogoHeader compact />
      <div style={{ marginBottom: 14 }}>
        <SectionTitle title="ניהול מלאי" subtitle="לחיצה על מוצר מעבירה אותו בין 'במלאי' ל'חסר במלאי'" />
      </div>

      {error && (
        <div style={{ color: "#b91c1c", fontWeight: 800, marginBottom: 12, textAlign: "center" }}>{error}</div>
      )}

      <div style={{ display: "grid", gap: 18 }}>
        {SECTIONS.map((section) => (
          <div key={section.title} style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#115e59" }}>{section.title}</div>
            {section.items.map(({ key, label }) => {
              const isSoldOut = soldOut[key] === true;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 14,
                    background: isSoldOut ? "#fef2f2" : "white",
                    border: `1.5px solid ${isSoldOut ? "#fca5a5" : "#dbe7e4"}`,
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#111827" }}>{label}</div>
                  <button
                    onClick={() => toggle(key)}
                    disabled={!!saving[key]}
                    style={{
                      minWidth: 120,
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "none",
                      background: isSoldOut ? "#dc2626" : "#0f766e",
                      color: "white",
                      fontWeight: 900,
                      fontSize: 14,
                      cursor: saving[key] ? "wait" : "pointer",
                      opacity: saving[key] ? 0.6 : 1,
                      fontFamily: "inherit",
                    }}
                  >
                    {isSoldOut ? "✕ חסר במלאי" : "✓ במלאי"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
