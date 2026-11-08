import { useState } from "react";
import { OrderItems, StaffPills } from "./uiHelpers.jsx";
import {
  PAYMENT_LABELS,
  STAFF,
  staffBtn,
  staffChip,
  staffRootStyle,
  staffSubbarStyle,
  statusLabel,
  useStaffViewport,
} from "./uiHelpersUtils.jsx";
import { DELIVERY_FEES_BY_CITY } from "./customer/customerConstants.js";
import { markDeliveryDispatchedInFirebase } from "../services/orders.js";
import { toMillis } from "../utils/timeUtils.js";

const CITIES = Object.keys(DELIVERY_FEES_BY_CITY);

function formatTime(value) {
  const ms = toMillis(value);
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function statusChip(order) {
  if (order.dispatchedAt || order.dispatchedAtClient) {
    return <span style={staffChip("ok")}>✅ יצא {formatTime(order.dispatchedAt ?? order.dispatchedAtClient) || ""}</span>;
  }
  const tone = order.status === "ready" ? "ok" : order.status === "new" ? "accent" : "warn";
  return <span style={staffChip(tone)}>{order.status === "new" ? "ממתינה לתשלום" : statusLabel(order.status)}</span>;
}

export default function DeliveryScreen({ orders = [] }) {
  const { ref, height, isMobile } = useStaffViewport();
  const [dispatching, setDispatching] = useState({});
  const [cityFilter, setCityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);

  const allDeliveries = orders.filter((o) => o.deliveryTime && o.deliveryCity);
  const deliveryOrders = allDeliveries
    .filter((o) => cityFilter === "all" || o.deliveryCity === cityFilter)
    .sort(
      (a, b) =>
        String(a.deliveryTime).localeCompare(String(b.deliveryTime)) ||
        CITIES.indexOf(a.deliveryCity) - CITIES.indexOf(b.deliveryCity) ||
        (a.orderNumber || 0) - (b.orderNumber || 0)
    );
  const times = [...new Set(deliveryOrders.map((o) => o.deliveryTime))];
  const selected =
    deliveryOrders.find((o) => o.id === selectedId) ||
    (isMobile ? null : deliveryOrders.find((o) => !o.dispatchedAt && !o.dispatchedAtClient) || deliveryOrders[0]) ||
    null;

  const handleDispatch = async (order) => {
    if (dispatching[order.id] || order.dispatchedAt) return;
    setDispatching((prev) => ({ ...prev, [order.id]: true }));
    try {
      await markDeliveryDispatchedInFirebase(order.id);
    } finally {
      setDispatching((prev) => {
        const n = { ...prev };
        delete n[order.id];
        return n;
      });
    }
  };

  const pills = [
    { key: "all", label: "הכל", count: allDeliveries.length },
    ...CITIES.map((city) => ({ key: city, label: city, count: allDeliveries.filter((o) => o.deliveryCity === city).length })),
  ];

  const address = selected ? [selected.deliveryAddress, selected.deliveryCity].filter(Boolean).join(", ") : "";
  const paid = selected?.paymentActual || selected?.paymentMethod;
  const dispatched = !!(selected?.dispatchedAt || selected?.dispatchedAtClient);

  const detail = selected && (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "white",
        ...(isMobile
          ? { position: "fixed", left: 0, right: 0, bottom: 0, height: "78vh", zIndex: 25, borderRadius: "22px 22px 0 0", boxShadow: "0 -10px 30px rgba(0,0,0,0.2)" }
          : { borderInlineStart: `1px solid ${STAFF.line}` }),
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${STAFF.line}`, display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <b style={{ fontSize: 20 }}>#{selected.orderNumber} {(selected.customerName || "").trim() || "לקוח"}</b>
          {isMobile && <button type="button" aria-label="סגירה" onClick={() => setSelectedId(null)} style={staffBtn("ghost")}>✕</button>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={staffChip("del")}>🛵 {selected.deliveryCity} · {selected.deliveryTime}</span>
          {statusChip(selected)}
          <span style={staffChip(paid ? "ok" : "accent")}>
            {paid ? `שולם · ${PAYMENT_LABELS[paid] || paid}` : `לגבות · ${PAYMENT_LABELS[selected.paymentRequested] || "לא צוין"}`}
          </span>
        </div>
      </div>
      <div style={{ padding: "10px 16px", display: "grid", gap: 8 }}>
        <div style={{ background: STAFF.soft, borderRadius: 14, padding: "10px 12px" }}>
          <div style={{ fontSize: 12, color: STAFF.muted, fontWeight: 700 }}>כתובת</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>📍 {address || "—"}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {selected.deliveryPhone ? (
            <a href={`tel:${selected.deliveryPhone}`} style={{ ...staffBtn("ghost"), textAlign: "center", textDecoration: "none" }}>📞 {selected.deliveryPhone}</a>
          ) : (
            <span style={{ ...staffBtn("ghost"), textAlign: "center", color: STAFF.muted }}>אין טלפון</span>
          )}
          <a
            href={`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`}
            target="_blank"
            rel="noreferrer"
            style={{ ...staffBtn("ghost"), textAlign: "center", textDecoration: "none" }}
          >
            🧭 Waze
          </a>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px" }}>
        <OrderItems items={selected.items} />
      </div>
      <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${STAFF.line}`, background: "#fffdf9", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 18 }}>
          <span>סה״כ (כולל משלוח{selected.deliveryFee ? ` ₪${selected.deliveryFee}` : ""})</span>
          <span>₪{selected.total || 0}</span>
        </div>
        {dispatched ? (
          <div style={{ textAlign: "center", fontWeight: 900, color: STAFF.ok }}>✅ יצא למשלוח ב-{formatTime(selected.dispatchedAt ?? selected.dispatchedAtClient)}</div>
        ) : (
          <button type="button" onClick={() => handleDispatch(selected)} disabled={!!dispatching[selected.id]} style={staffBtn("accent", true)}>
            {dispatching[selected.id] ? "..." : "🛵 יצא למשלוח"}
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div ref={ref} style={staffRootStyle(height)}>
      <div style={staffSubbarStyle()}>
        <b style={{ fontSize: 16 }}>🛵 משלוחים</b>
        <StaffPills options={pills} value={cityFilter} onChange={setCityFilter} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 400px" }}>
        <div style={{ minHeight: 0, overflowY: "auto", padding: "6px 12px 12px", display: "grid", gap: 6, alignContent: "start" }}>
          {deliveryOrders.length === 0 && <div style={{ color: STAFF.muted, padding: 12 }}>אין הזמנות משלוח להיום</div>}
          {times.map((time) => (
            <div key={time} style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: STAFF.muted, padding: "6px 4px 0" }}>
                🕒 {time} · {deliveryOrders.filter((o) => o.deliveryTime === time).length}
              </div>
              {deliveryOrders
                .filter((o) => o.deliveryTime === time)
                .map((order) => {
                  const isSel = selected?.id === order.id;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        alignItems: "center",
                        gap: 10,
                        textAlign: "right",
                        background: isSel ? STAFF.accentSoft : "white",
                        border: `2px solid ${isSel ? STAFF.accent : "transparent"}`,
                        borderRadius: 14,
                        padding: "9px 12px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: STAFF.ink,
                      }}
                    >
                      <span style={{ fontSize: 18, fontWeight: 900, color: STAFF.muted }}>#{order.orderNumber}</span>
                      <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                        <b style={{ fontSize: 15 }}>{(order.customerName || "").trim() || "לקוח"}</b>
                        <span style={{ fontSize: 12, color: STAFF.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          📍 {[order.deliveryAddress, order.deliveryCity].filter(Boolean).join(", ") || "—"}
                          {order.deliveryPhone ? ` · 📞 ${order.deliveryPhone}` : ""}
                        </span>
                        <span>{statusChip(order)}</span>
                      </span>
                      <span style={{ fontWeight: 900, fontSize: 17 }}>₪{order.total || 0}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        {detail}
      </div>
      {isMobile && selected && (
        <div onClick={() => setSelectedId(null)} style={{ position: "fixed", inset: 0, background: "rgba(43,33,24,0.35)", zIndex: 24 }} />
      )}
    </div>
  );
}
