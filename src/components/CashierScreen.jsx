import { useState } from "react";
import {
  LogoHeader,
  MenuVisual,
  SectionTitle,
} from "./uiHelpers.jsx";
import {
  menu,
  buildItemParts,
  screenCardStyle,
  statusLabel,
  statusPill,
} from "./uiHelpersUtils.jsx";
import { modsKeysToDisplayLabels } from "./customer/customerHelpers.js";
import { DRINK_OPTIONS, EXTRA_DRINK_OPTIONS } from "./customer/customerConstants.js";

const drinkLabelByKey = Object.fromEntries(
  [...DRINK_OPTIONS, ...EXTRA_DRINK_OPTIONS].map((d) => [d.key, d.label])
);

function ItemDetailsLine({ label, mods, showToppings, drink }) {
  const toppings = modsKeysToDisplayLabels(mods);
  const parts = [];
  if (showToppings) parts.push(toppings.length > 0 ? `+${toppings.join(", ")}` : "ללא תוספות");
  if (drink) parts.push(`🥤 ${drink}`);
  if (!label && parts.length === 0) return null;
  return (
    <div style={{ fontSize: "13px", color: "#334155", marginTop: "2px" }}>
      {label && <span style={{ fontWeight: 800 }}>{label}:</span>} {parts.join(" · ")}
    </div>
  );
}

const menuPartsById = Object.fromEntries(menu.map((m) => [m.id, m.parts || []]));

function payBtnStyle(background, color, active = false) {
  return {
    padding: "12px 16px",
    borderRadius: "16px",
    border: active ? "2px solid #ef4444" : "1px solid #d1d5db",
    background,
    color,
    cursor: "pointer",
    fontWeight: 700,
    boxShadow: active ? "0 0 0 2px rgba(239,68,68,0.14)" : "none",
  };
}

function paymentLabel(method) {
  if (method === "cash") return "מזומן";
  if (method === "bit") return "Bit";
  if (method === "paybox") return "PayBox";
  return "-";
}

function paymentConfirmationMessage(method) {
  if (method === "cash") return "התקבל תשלום במזומן";
  if (method === "bit") return "התקבל תשלום ב-Bit";
  if (method === "paybox") return "התקבל תשלום ב-PayBox";
  return "-";
}

function cashierStatusLabel(status) {
  if (status === "new") return "הזמנה חדשה";
  if (status === "ready") return "ההזמנה מוכנה";
  return statusLabel(status);
}

function displayCustomerName(name) {
  return (name || "").trim() || "לקוח";
}

export default function CashierScreen({
  orders = [],
  onPay = () => {},
  onSendToKitchen = () => {},
}) {
  const [showOnlyUnhandled, setShowOnlyUnhandled] = useState(false);

  const displayedOrders = showOnlyUnhandled
    ? orders.filter((order) => order.status === "new" || order.status === "paid")
    : orders;

  return (
    <div style={screenCardStyle()}>
      <LogoHeader compact />
      <SectionTitle title="מסך קופאי" subtitle="אישור תשלום ושליחה למטבח" />

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "#f8fafc",
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          padding: "6px",
          marginBottom: "14px",
        }}
      >
        <button
          onClick={() => setShowOnlyUnhandled(false)}
          style={{
            padding: "8px 12px",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            background: showOnlyUnhandled ? "transparent" : "#111827",
            color: showOnlyUnhandled ? "#334155" : "white",
          }}
        >
          כל ההזמנות
        </button>
        <button
          onClick={() => setShowOnlyUnhandled(true)}
          style={{
            padding: "8px 12px",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            background: showOnlyUnhandled ? "#111827" : "transparent",
            color: showOnlyUnhandled ? "white" : "#334155",
          }}
        >
          טרם טופלו
        </button>
      </div>

      {displayedOrders.length === 0 ? (
        <div style={{ color: "#6b7280" }}>
          {showOnlyUnhandled ? "אין הזמנות שטרם טופלו" : "אין עדיין הזמנות"}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "14px",
            maxWidth: "760px",
            margin: "0 auto",
          }}
        >
          {displayedOrders.map((order, index) => (
            <div
              key={order.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "22px",
                padding: "18px",
                background: "white",
                boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "20px",
                      color: "#111827",
                    }}
                  >
                    הזמנה #{order.orderNumber || index + 1}
                  </div>
                  <div
                    style={{
                      color: "#1d4ed8",
                      fontWeight: 700,
                      marginTop: "4px",
                    }}
                  >
                    שם הלקוח: {displayCustomerName(order.customerName)}
                  </div>
                  {order.deliveryTime && (
                    <div style={{ marginTop: "8px", background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: "10px", padding: "8px 12px" }}>
                      <div style={{ color: "#92400e", fontWeight: 900, fontSize: "15px", marginBottom: "3px" }}>
                        🛵 משלוח ב-{order.deliveryTime}
                      </div>
                      {(order.deliveryAddress || order.deliveryCity) && (
                        <div style={{ color: "#78350f", fontWeight: 700, fontSize: "13px" }}>📍 {[order.deliveryAddress, order.deliveryCity].filter(Boolean).join(", ")}</div>
                      )}
                      {order.deliveryPhone && (
                        <div style={{ color: "#78350f", fontWeight: 700, fontSize: "13px", marginTop: "2px" }}>📞 {order.deliveryPhone}</div>
                      )}
                    </div>
                  )}
                  {!order.deliveryTime && order.pickupTime && (
                    <div style={{ marginTop: "8px", background: "#dcfce7", border: "2px solid #16a34a", borderRadius: "10px", padding: "8px 12px" }}>
                      <div style={{ color: "#166534", fontWeight: 900, fontSize: "15px" }}>
                        🏪 איסוף עצמי ב-{order.pickupTime}
                      </div>
                    </div>
                  )}
                </div>
                <div style={statusPill(order.status)}>
                  {cashierStatusLabel(order.status)}
                </div>
              </div>

              <div style={{ display: "grid", gap: "10px", marginBottom: "10px" }}>
                {(order.items || []).map((item, idx) => (
                  <div key={`${order.id}-${idx}`} style={{ display: "flex", gap: "10px", alignItems: "center", background: "#f8fafc", borderRadius: "12px", padding: "8px 10px" }}>
                    <div style={{ width: "60px", height: "60px", flexShrink: 0, borderRadius: "10px", overflow: "hidden", background: "#f1f5f9" }}>
                      <MenuVisual parts={buildItemParts(item, menuPartsById)} size="small" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: "14px", color: "#0f172a" }}>
                        {item.name}{item.qty && item.qty > 1 ? ` ×${item.qty}` : ""}
                      </div>
                      {Array.isArray(item.familyMeals) ? (
                        item.familyMeals.map((meal, mealIdx) => (
                          <ItemDetailsLine
                            key={mealIdx}
                            label={`מנה ${meal?.mealNumber || mealIdx + 1}`}
                            mods={meal?.mods}
                            showToppings
                            drink={meal?.drinkLabel || drinkLabelByKey[meal?.drinkKey]}
                          />
                        ))
                      ) : (
                        <ItemDetailsLine
                          mods={item.mods}
                          showToppings={!!item.allowsToppings || modsKeysToDisplayLabels(item.mods).length > 0}
                          drink={item.drinkLabel || drinkLabelByKey[item.drinkKey] || drinkLabelByKey[item.drinkType]}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginBottom: "12px",
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                סה"כ: ₪{order.total || 0}
              </div>

              {order.paymentRequested && (
                <div
                  style={{
                    marginBottom: "12px",
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: "14px",
                    padding: "10px 12px",
                    color: "#334155",
                    fontWeight: 700,
                  }}
                >
                  אופן תשלום מבוקש: {paymentLabel(order.paymentRequested)}
                </div>
              )}

              {order.paymentActual && (
                <div
                  style={{
                    marginBottom: "12px",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "14px",
                    padding: "10px 12px",
                    color: "#1d4ed8",
                    fontWeight: 700,
                  }}
                >
                  {paymentConfirmationMessage(order.paymentActual)}
                </div>
              )}

              {(order.status === "new" || order.status === "paid") && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "10px",
                  }}
                >
                  <button
                    onClick={() => onPay(order.id, "cash")}
                    style={payBtnStyle(
                      "#ecfeff",
                      "#155e75",
                      order.paymentActual === "cash" || order.paymentMethod === "cash"
                    )}
                  >
                    💵 התקבל תשלום במזומן
                  </button>

                  <button
                    onClick={() => onPay(order.id, "bit")}
                    style={payBtnStyle(
                      "#eef2ff",
                      "#4338ca",
                      order.paymentActual === "bit" || order.paymentMethod === "bit"
                    )}
                  >
                    BIT
                  </button>

                  <button
                    onClick={() => onPay(order.id, "paybox")}
                    style={payBtnStyle(
                      "#fff7ed",
                      "#c2410c",
                      order.paymentActual === "paybox" || order.paymentMethod === "paybox"
                    )}
                  >
                    PayBox
                  </button>
                </div>
              )}

              {(order.status === "new" || order.status === "paid") && (
                <div
                  style={{
                    marginBottom: "10px",
                    color: "#64748b",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  ניתן לעדכן את אופן התשלום לפני שליחה למטבח
                </div>
              )}

              {order.status === "paid" && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    width: "100%",
                    marginTop: "6px",
                  }}
                >
                  <button
                    onClick={() => onSendToKitchen(order.id)}
                    style={{
                      padding: "15px 30px",
                      borderRadius: "16px",
                      border: "none",
                      background:
                        "linear-gradient(135deg, #111827 0%, #f59e0b 100%)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: "17px",
                      minWidth: "230px",
                      textAlign: "center",
                    }}
                  >
                    שלח למטבח
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
