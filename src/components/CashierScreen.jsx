import { useEffect, useState } from "react";
import { OrderItems, StaffPills } from "./uiHelpers.jsx";
import {
  minutesSince,
  orderTypeText,
  PAYMENT_LABELS,
  STAFF,
  staffBtn,
  staffChip,
  staffRootStyle,
  staffSubbarStyle,
  statusLabel,
  useStaffViewport,
} from "./uiHelpersUtils.jsx";
import { getDisplayItemName } from "./customer/customerHelpers.js";

const FILTERS = {
  open: (o) => o.status === "new" || o.status === "paid",
  kitchen: (o) => o.status === "in_progress" || o.status === "ready",
  done: (o) => o.status === "delivered",
  all: () => true,
};

const PAY_BUTTONS = [
  ["cash", "💵 התקבל תשלום במזומן"],
  ["bit", "Bit"],
  ["paybox", "PayBox"],
];

function displayCustomerName(name) {
  return (name || "").trim() || "לקוח";
}

function statusTone(status) {
  if (status === "new") return "accent";
  if (status === "paid" || status === "ready") return "ok";
  if (status === "in_progress") return "warn";
  return "neutral";
}

function cashierStatusLabel(status) {
  if (status === "new") return "ממתינה לתשלום";
  if (status === "paid") return "שולמה";
  return statusLabel(status);
}

function OrderRow({ order, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "right",
        background: selected ? STAFF.accentSoft : "white",
        border: `2px solid ${selected ? STAFF.accent : "transparent"}`,
        borderRadius: 14,
        padding: "9px 12px",
        cursor: "pointer",
        fontFamily: "inherit",
        color: STAFF.ink,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 900, color: STAFF.muted }}>#{order.orderNumber}</span>
      <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <b style={{ fontSize: 15 }}>{displayCustomerName(order.customerName)}</b>
        <span style={{ fontSize: 12, color: STAFF.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {(order.items || []).map((i) => getDisplayItemName(i?.name)).join(" · ")}
        </span>
        <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <span style={staffChip(order.deliveryTime ? "del" : "neutral")}>{orderTypeText(order)}</span>
          <span style={staffChip(statusTone(order.status))}>{cashierStatusLabel(order.status)}</span>
        </span>
      </span>
      <span style={{ fontWeight: 900, fontSize: 17 }}>₪{order.total || 0}</span>
    </button>
  );
}

export default function CashierScreen({
  orders = [],
  onPay = () => {},
  onSendToKitchen = () => {},
}) {
  const { ref, height, isMobile } = useStaffViewport();
  const [filter, setFilter] = useState("open");
  const [selectedId, setSelectedId] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const filtered = orders.filter(FILTERS[filter]);
  const shown = filter === "open" ? [...filtered].reverse() : filtered;
  const selected = shown.find((o) => o.id === selectedId) || (isMobile ? null : shown[0]) || null;

  const pills = [
    { key: "open", label: "לטיפול", count: orders.filter(FILTERS.open).length },
    { key: "kitchen", label: "במטבח", count: orders.filter(FILTERS.kitchen).length },
    { key: "done", label: "נמסרו", count: orders.filter(FILTERS.done).length },
    { key: "all", label: "הכל", count: orders.length },
  ];

  const ago = selected ? minutesSince(selected.createdAtClient ?? selected.createdAt, nowMs) : null;
  const canPay = selected && (selected.status === "new" || selected.status === "paid");
  const actualPayment = selected?.paymentActual || selected?.paymentMethod;

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
          <b style={{ fontSize: 20 }}>
            #{selected.orderNumber} {displayCustomerName(selected.customerName)}
          </b>
          {isMobile ? (
            <button type="button" aria-label="סגירה" onClick={() => setSelectedId(null)} style={staffBtn("ghost")}>✕</button>
          ) : (
            ago != null && <span style={{ color: STAFF.muted, fontSize: 13 }}>לפני {ago} ד׳</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={staffChip(selected.deliveryTime ? "del" : "neutral")}>{orderTypeText(selected)}</span>
          <span style={staffChip(statusTone(selected.status))}>{cashierStatusLabel(selected.status)}</span>
          {selected.paymentRequested && (
            <span style={staffChip("accent")}>ביקש: {PAYMENT_LABELS[selected.paymentRequested] || selected.paymentRequested}</span>
          )}
          {actualPayment && <span style={staffChip("ok")}>שולם · {PAYMENT_LABELS[actualPayment] || actualPayment}</span>}
        </div>
        {selected.deliveryTime && (selected.deliveryAddress || selected.deliveryPhone) && (
          <div style={{ fontSize: 13, color: STAFF.del, fontWeight: 700 }}>
            📍 {[selected.deliveryAddress, selected.deliveryCity].filter(Boolean).join(", ")}
            {selected.deliveryPhone && ` · 📞 ${selected.deliveryPhone}`}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px" }}>
        <OrderItems items={selected.items} />
      </div>
      <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${STAFF.line}`, background: "#fffdf9", display: "grid", gap: 8 }}>
        {selected.deliveryFee > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: STAFF.muted, fontWeight: 700 }}>
            <span>דמי משלוח</span>
            <span>₪{selected.deliveryFee}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 20 }}>
          <span>סה״כ</span>
          <span>₪{selected.total || 0}</span>
        </div>
        {canPay && (
          <>
            <div style={{ fontSize: 12, color: STAFF.muted, fontWeight: 700 }}>
              {selected.status === "new" ? "בחרו איך התקבל התשלום:" : "אפשר לשנות את אופן התשלום לפני שליחה למטבח"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 6 }}>
              {PAY_BUTTONS.map(([method, label]) => {
                const active = actualPayment === method;
                const requested = selected.paymentRequested === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => onPay(selected.id, method)}
                    style={{
                      ...staffBtn("ghost"),
                      padding: "10px 6px",
                      fontSize: 13,
                      whiteSpace: "normal",
                      background: active ? STAFF.okSoft : requested ? STAFF.accentSoft : "white",
                      borderColor: active ? STAFF.ok : requested ? STAFF.accent : STAFF.line,
                      color: active ? STAFF.ok : STAFF.ink,
                    }}
                  >
                    {active ? "✓ " : ""}
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {selected.status === "paid" && (
          <button type="button" onClick={() => onSendToKitchen(selected.id)} style={staffBtn("accent", true)}>
            שלח למטבח ←
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div ref={ref} style={staffRootStyle(height)}>
      <div style={staffSubbarStyle()}>
        <b style={{ fontSize: 16 }}>💳 קופה</b>
        <StaffPills options={pills} value={filter} onChange={setFilter} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 400px" }}>
        <div style={{ minHeight: 0, overflowY: "auto", padding: "10px 12px", display: "grid", gap: 6, alignContent: "start" }}>
          {shown.length === 0 && (
            <div style={{ color: STAFF.muted, padding: 12 }}>{filter === "open" ? "אין הזמנות שממתינות לטיפול" : "אין הזמנות להצגה"}</div>
          )}
          {shown.map((order) => (
            <OrderRow key={order.id} order={order} selected={selected?.id === order.id} onSelect={() => setSelectedId(order.id)} />
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
