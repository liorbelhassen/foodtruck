import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  LogoHeader,
  SectionTitle,
} from "./uiHelpers.jsx";
import {
  chartBoxStyle,
  formatDurationMs,
  screenCardStyle,
} from "./uiHelpersUtils.jsx";
import { fetchOrdersForDate, fetchOrderDatesWithData } from "../services/orders.js";
import { toMillis } from "../utils/timeUtils.js";

const ISRAEL_TIMEZONE = "Asia/Jerusalem";

function StatCard({ label, value }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "20px",
        padding: "16px",
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ color: "#6b7280", marginBottom: "6px", fontSize: "14px" }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: "28px", color: "#111827" }}>{value}</div>
    </div>
  );
}

function downloadCsv(filename, rows) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getIsraelDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: ISRAEL_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  return `${year}-${month}-${day}`;
}

function getIsraelTimeBucket(createdMs) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(createdMs));

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minuteRaw = parts.find((part) => part.type === "minute")?.value ?? "00";
  const minuteBucket = Math.floor(Number(minuteRaw) / 15) * 15;
  const minute = String(Number.isFinite(minuteBucket) ? minuteBucket : 0).padStart(2, "0");
  return `${hour}:${minute}`;
}

function getOrderStartMs(order) {
  return (
    toMillis(order?.kitchenStartedAt) ??
    toMillis(order?.sentToKitchenAt) ??
    toMillis(order?.createdAt)
  );
}

function getActualPayment(order) {
  return order?.paymentMethod || order?.paymentActual || null;
}

export default function AnalyticsScreen() {
  const todayDateKey = useMemo(() => getIsraelDateKey(new Date()), []);
  const [selectedDateKey, setSelectedDateKey] = useState(todayDateKey);
  const [ordersForDate, setOrdersForDate] = useState([]);
  const [datesWithData, setDatesWithData] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchOrderDatesWithData()
      .then((dates) => {
        if (!cancelled) setDatesWithData(dates);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;
    fetchOrdersForDate(selectedDateKey)
      .then((orders) => {
        if (!cancelled) setOrdersForDate(orders);
      })
      .catch(() => {
        if (!cancelled) setOrdersForDate([]);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(selectedDateKey);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDateKey, refreshToken]);

  const loading = loadedKey !== selectedDateKey;
  const filteredOrders = ordersForDate;

  const chartData = useMemo(() => {
    const buckets = {};

    filteredOrders.forEach((order) => {
      const createdMs = toMillis(order?.createdAt);
      if (createdMs == null) return;
      const key = getIsraelTimeBucket(createdMs);

      if (!buckets[key]) {
        buckets[key] = { time: key, orders: 0 };
      }

      buckets[key].orders += 1;
    });

    return Object.values(buckets).sort((a, b) => a.time.localeCompare(b.time));
  }, [filteredOrders]);

  const avgPrep = useMemo(() => {
    const durations = filteredOrders
      .map((order) => {
        if (typeof order?.prepDurationMs === "number" && Number.isFinite(order.prepDurationMs)) {
          return Math.max(0, order.prepDurationMs);
        }

        const startMs = getOrderStartMs(order);
        const readyMs = toMillis(order?.readyAt);
        if (startMs == null || readyMs == null) return null;
        return Math.max(0, readyMs - startMs);
      })
      .filter((value) => value != null);

    if (!durations.length) return "--";

    const avgMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    return formatDurationMs(0, avgMs) || "--";
  }, [filteredOrders]);

  const peakWindow = useMemo(() => {
    if (!chartData.length) return "--";
    const peak = [...chartData].sort((a, b) => b.orders - a.orders)[0];
    return `${peak.time} (${peak.orders})`;
  }, [chartData]);

  const paymentTotals = useMemo(() => {
    const totals = {
      cash: 0,
      bit: 0,
      paybox: 0,
    };

    filteredOrders.forEach((order) => {
      const method = getActualPayment(order);
      if (!method || totals[method] === undefined) return;
      totals[method] += Number(order?.total) || 0;
    });

    return totals;
  }, [filteredOrders]);

  const totalRevenue = useMemo(
    () => paymentTotals.cash + paymentTotals.bit + paymentTotals.paybox,
    [paymentTotals]
  );

  const readyOrDeliveredCount = useMemo(
    () => filteredOrders.filter((o) => o?.status === "ready" || o?.status === "delivered").length,
    [filteredOrders]
  );

  const deliveryCount = useMemo(
    () => filteredOrders.filter((o) => o?.deliveryTime).length,
    [filteredOrders]
  );

  const pickupCount = useMemo(
    () => filteredOrders.filter((o) => !o?.deliveryTime).length,
    [filteredOrders]
  );

  const deliveryRevenue = useMemo(
    () => filteredOrders.filter((o) => o?.deliveryTime).reduce((s, o) => s + (Number(o?.total) || 0), 0),
    [filteredOrders]
  );

  const pickupRevenue = useMemo(
    () => filteredOrders.filter((o) => !o?.deliveryTime).reduce((s, o) => s + (Number(o?.total) || 0), 0),
    [filteredOrders]
  );

  const exportShiftToCsv = () => {
    const rows = [
      ["Date Key", selectedDateKey],
      ["Total Orders", filteredOrders.length],
      ["Delivery Orders", deliveryCount],
      ["Pickup Orders", pickupCount],
      ["Ready Or Delivered Orders", readyOrDeliveredCount],
      ["Average Prep Time", avgPrep],
      ["Peak Window", peakWindow],
      ["Cash Revenue", paymentTotals.cash],
      ["BIT Revenue", paymentTotals.bit],
      ["PayBox Revenue", paymentTotals.paybox],
      [],
      [
        "Order Number",
        "Customer",
        "Type",
        "Delivery Time",
        "Delivery Address",
        "Delivery Phone",
        "Status",
        "Requested Payment",
        "Actual Payment",
        "Prep Duration (ms)",
        "Total",
        "Created At",
        "Ready At",
        "Delivered At",
      ],
      ...filteredOrders.map((o, index) => [
        o.orderNumber || index + 1,
        o.customerName || "",
        o.deliveryTime ? "משלוח" : "איסוף עצמי",
        o.deliveryTime || "",
        o.deliveryAddress || "",
        o.deliveryPhone || "",
        o.status || "",
        o.paymentRequested || "",
        getActualPayment(o) || "",
        typeof o.prepDurationMs === "number" ? o.prepDurationMs : "",
        o.total || 0,
        toMillis(o.createdAt) ? new Date(toMillis(o.createdAt)).toLocaleString("he-IL") : "",
        toMillis(o.readyAt) ? new Date(toMillis(o.readyAt)).toLocaleString("he-IL") : "",
        toMillis(o.deliveredAt) ? new Date(toMillis(o.deliveredAt)).toLocaleString("he-IL") : "",
      ]),
    ];

    downloadCsv(`orders-report-${selectedDateKey}.csv`, rows);
  };

  return (
    <div style={screenCardStyle()}>
      <LogoHeader compact />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <SectionTitle
          title="דוח עומסים והכנסות"
          subtitle="נתוני אמת מפיירבייס לפי ההזמנות שנשמרו במערכת"
        />

        <button
          onClick={exportShiftToCsv}
          style={{
            padding: "12px 14px",
            borderRadius: "16px",
            border: "none",
            background: "linear-gradient(135deg, #111827 0%, #2563eb 100%)",
            color: "white",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          ייצוא CSV ל-Google Sheets
        </button>
      </div>

      <div
        style={{
          ...chartBoxStyle(),
          marginBottom: "16px",
          padding: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "10px",
          }}
        >
          <label htmlFor="analytics-date-picker" style={{ fontWeight: 800, color: "#111827" }}>
            תאריך דוח:
          </label>
          <input
            id="analytics-date-picker"
            type="date"
            value={selectedDateKey}
            max={todayDateKey}
            onChange={(e) => setSelectedDateKey(e.target.value)}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "10px",
              padding: "8px 10px",
              fontWeight: 700,
              color: "#111827",
              background: "white",
            }}
          />
          <button
            onClick={() => setSelectedDateKey(todayDateKey)}
            style={{
              border: "1px solid #d1d5db",
              background: "#f8fafc",
              color: "#0f172a",
              borderRadius: "10px",
              padding: "8px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            היום
          </button>
          <button
            onClick={() => setRefreshToken((token) => token + 1)}
            style={{
              border: "1px solid #d1d5db",
              background: "#f8fafc",
              color: "#0f172a",
              borderRadius: "10px",
              padding: "8px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            רענן
          </button>
        </div>

        <div style={{ color: "#475569", fontSize: "13px", marginBottom: "8px" }}>
          ימים עם נתונים:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {datesWithData.length === 0 ? (
            <span style={{ color: "#6b7280", fontSize: "13px" }}>אין ימים עם נתונים</span>
          ) : (
            datesWithData.map((dateKey) => (
              <button
                key={dateKey}
                onClick={() => setSelectedDateKey(dateKey)}
                style={{
                  border: dateKey === selectedDateKey ? "2px solid #0f766e" : "1px solid #cbd5e1",
                  background: dateKey === selectedDateKey ? "#ecfeff" : "white",
                  color: "#0f172a",
                  borderRadius: "999px",
                  padding: "6px 10px",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
                title="יש הזמנות בתאריך זה"
              >
                {dateKey}
              </button>
            ))
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280", padding: "8px 0 14px" }}>טוען נתונים מפיירבייס...</div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ color: "#6b7280", padding: "8px 0 14px" }}>אין נתונים להצגה כרגע</div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <StatCard label='סה"כ הזמנות' value={filteredOrders.length} />
            <StatCard label="הזמנות מוכנות/נמסרו" value={readyOrDeliveredCount} />
            <StatCard label="זמן הכנה ממוצע" value={avgPrep} />
            <StatCard label="שיא עומס" value={peakWindow} />
          </div>

          <div
            style={{
              marginBottom: "20px",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "22px",
              padding: "18px",
              boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
              direction: "rtl",
              textAlign: "right",
            }}
          >
            <div style={{ color: "#475569", fontWeight: 800, fontSize: "14px", marginBottom: "12px" }}>
              משלוח מול איסוף עצמי
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: "14px", padding: "14px 16px" }}>
                <div style={{ fontSize: "13px", color: "#92400e", fontWeight: 700, marginBottom: "4px" }}>🛵 משלוח</div>
                <div style={{ fontSize: "32px", fontWeight: 900, color: "#78350f" }}>{deliveryCount}</div>
                <div style={{ fontSize: "12px", color: "#92400e", fontWeight: 600, marginTop: "2px" }}>
                  {filteredOrders.length > 0 ? Math.round((deliveryCount / filteredOrders.length) * 100) : 0}% מסך ההזמנות
                </div>
                <div style={{ fontSize: "15px", color: "#78350f", fontWeight: 900, marginTop: "6px" }}>
                  ₪{deliveryRevenue}
                </div>
              </div>
              <div style={{ background: "#f0fdf4", border: "2px solid #86efac", borderRadius: "14px", padding: "14px 16px" }}>
                <div style={{ fontSize: "13px", color: "#166534", fontWeight: 700, marginBottom: "4px" }}>🏪 איסוף עצמי</div>
                <div style={{ fontSize: "32px", fontWeight: 900, color: "#14532d" }}>{pickupCount}</div>
                <div style={{ fontSize: "12px", color: "#166534", fontWeight: 600, marginTop: "2px" }}>
                  {filteredOrders.length > 0 ? Math.round((pickupCount / filteredOrders.length) * 100) : 0}% מסך ההזמנות
                </div>
                <div style={{ fontSize: "15px", color: "#14532d", fontWeight: 900, marginTop: "6px" }}>
                  ₪{pickupRevenue}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginBottom: "20px",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "22px",
              padding: "18px",
              boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
              direction: "rtl",
              textAlign: "right",
            }}
          >
            <div style={{ color: "#475569", fontWeight: 800, fontSize: "14px", marginBottom: "6px" }}>
              סה״כ הכנסות
            </div>
            <div style={{ fontWeight: 900, fontSize: "40px", color: "#0f172a", marginBottom: "14px", lineHeight: 1.1 }}>
              ₪{totalRevenue}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "8px",
              }}
            >
              {[
                { label: "מזומן", value: paymentTotals.cash },
                { label: "Bit", value: paymentTotals.bit },
                { label: "PayBox", value: paymentTotals.paybox },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    borderRadius: "14px",
                    padding: "10px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span style={{ color: "#64748b", fontWeight: 700, fontSize: "13px" }}>{item.label}</span>
                  <span style={{ color: "#111827", fontWeight: 900, fontSize: "16px" }}>₪{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={chartBoxStyle()}>
            <div style={{ fontWeight: 800, marginBottom: "10px" }}>מספר הזמנות בכל חלון זמן</div>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
