import { useState } from "react";
import { LogoHeader, screenCardStyle, SectionTitle } from "./uiHelpers.jsx";
import { markDeliveryDispatchedInFirebase } from "../services/orders.js";
import { toMillis } from "../utils/timeUtils.js";

const DELIVERY_TIMES = ["19:00", "20:00", "21:00"];
const CITIES = ["בני דקלים", "אליאב", "כרמי קטיף"];

function formatTime(value) {
  const ms = toMillis(value);
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export default function DeliveryScreen({ orders = [] }) {
  const [dispatching, setDispatching] = useState({});
  const [cityFilter, setCityFilter] = useState("הכל");

  const deliveryOrders = orders.filter(
    (o) => o.deliveryTime && o.deliveryCity && (cityFilter === "הכל" || o.deliveryCity === cityFilter)
  );

  const handleDispatch = async (order) => {
    if (dispatching[order.id] || order.dispatchedAt) return;
    setDispatching((prev) => ({ ...prev, [order.id]: true }));
    try {
      await markDeliveryDispatchedInFirebase(order.id);
    } finally {
      setDispatching((prev) => { const n = { ...prev }; delete n[order.id]; return n; });
    }
  };

  const allEmpty = DELIVERY_TIMES.every((t) => deliveryOrders.filter((o) => o.deliveryTime === t).length === 0);

  return (
    <div style={screenCardStyle()}>
      <LogoHeader compact />
      <div style={{ marginBottom: 14 }}>
        <SectionTitle title="מרכז משלוחים" subtitle="הזמנות למשלוח לפי שעה וישוב" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {["הכל", ...CITIES].map((city) => (
          <button
            key={city}
            onClick={() => setCityFilter(city)}
            style={{
              padding: "7px 16px",
              borderRadius: 999,
              border: `1.5px solid ${cityFilter === city ? "#0f766e" : "#d1d5db"}`,
              background: cityFilter === city ? "#0f766e" : "white",
              color: cityFilter === city ? "white" : "#374151",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {city}
          </button>
        ))}
      </div>

      {allEmpty && (
        <div style={{ color: "#6b7280", fontWeight: 600, padding: "8px 0" }}>אין הזמנות משלוח להיום</div>
      )}

      {DELIVERY_TIMES.map((time) => {
        const ordersAtTime = deliveryOrders.filter((o) => o.deliveryTime === time);
        if (ordersAtTime.length === 0) return null;

        return (
          <div key={time} style={{ marginBottom: 20 }}>
            {/* כותרת שעה */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
              background: "#111827", borderRadius: "10px 10px 0 0", padding: "8px 14px",
            }}>
              <span style={{ color: "white", fontWeight: 900, fontSize: 16 }}>🕐 {time}</span>
              <span style={{ background: "#f59e0b", color: "white", borderRadius: 999, fontSize: 12, fontWeight: 900, padding: "1px 8px" }}>
                {ordersAtTime.length}
              </span>
            </div>

            {/* טבלה */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
              {/* header row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 1fr 1fr 1fr 110px",
                background: "#f8fafc",
                borderBottom: "1px solid #e5e7eb",
                padding: "6px 12px",
                fontSize: 12, fontWeight: 800, color: "#6b7280",
                direction: "rtl",
              }}>
                <span>#</span>
                <span>שם</span>
                <span>ישוב</span>
                <span>כתובת</span>
                <span>טלפון</span>
                <span style={{ textAlign: "center" }}>סטטוס</span>
              </div>

              {CITIES.map((city) => {
                const cityOrders = ordersAtTime.filter((o) => o.deliveryCity === city);
                if (cityOrders.length === 0) return null;

                return cityOrders.map((order, idx) => {
                  const dispatched = !!order.dispatchedAt;
                  const dispatchTime = formatTime(order.dispatchedAt ?? order.dispatchedAtClient);
                  const loading = dispatching[order.id];
                  const isFirst = idx === 0;

                  return (
                    <div key={order.id}>
                      {/* city divider on first item of city */}
                      {isFirst && (
                        <div style={{
                          background: "#f0fdf4", borderBottom: "1px solid #e5e7eb",
                          padding: "4px 12px", fontSize: 12, fontWeight: 800, color: "#0f766e",
                        }}>
                          📍 {city}
                        </div>
                      )}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "80px 1fr 1fr 1fr 1fr 110px",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderBottom: "1px solid #f1f5f9",
                        background: dispatched ? "#f0fdf4" : "white",
                        fontSize: 13,
                        direction: "rtl",
                        gap: 4,
                      }}>
                        <span style={{ fontWeight: 800, color: "#374151" }}>
                          #{order.orderNumber}
                          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>₪{order.total}</span>
                        </span>
                        <span style={{ fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {order.customerName || "לקוח"}
                        </span>
                        <span style={{ color: "#374151" }}>{order.deliveryCity}</span>
                        <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {order.deliveryAddress || "—"}
                        </span>
                        <span style={{ color: "#374151" }}>{order.deliveryPhone || "—"}</span>
                        <div style={{ textAlign: "center" }}>
                          {dispatched ? (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#166534" }}>
                              ✅ {dispatchTime}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDispatch(order)}
                              disabled={loading}
                              style={{
                                padding: "6px 10px", borderRadius: 8, border: "none",
                                background: loading ? "#d1d5db" : "linear-gradient(135deg, #0f766e 0%, #f59e0b 100%)",
                                color: loading ? "#6b7280" : "white",
                                fontWeight: 800, fontSize: 12, cursor: loading ? "default" : "pointer",
                                whiteSpace: "nowrap", width: "100%",
                              }}
                            >
                              {loading ? "..." : "🛵 יצא"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
