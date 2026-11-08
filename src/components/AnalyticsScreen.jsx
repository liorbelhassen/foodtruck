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
import { StaffPills } from "./uiHelpers.jsx";
import {
  formatDurationMs,
  menu,
  STAFF,
  staffBtn,
  staffRootStyle,
  staffSubbarStyle,
  useStaffViewport,
} from "./uiHelpersUtils.jsx";
import { getDisplayItemName } from "./customer/customerHelpers.js";
import { fetchOrdersForDate, fetchOrderDatesWithData } from "../services/orders.js";
import { toMillis } from "../utils/timeUtils.js";

const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const MENU_NAME_BY_ID = Object.fromEntries(
  menu.map((m) => [m.id, m.id === 6 ? "פחית" : m.id === 8 ? "בקבוק קטן" : getDisplayItemName(m.name)])
);

function HBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(80px, 140px) 1fr auto", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
          <span>{r.label}</span>
          <div style={{ height: 10, borderRadius: 99, background: STAFF.soft, overflow: "hidden" }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: "100%", background: STAFF.accent, borderRadius: 99 }} />
          </div>
          <span style={{ color: STAFF.muted, fontSize: 12, whiteSpace: "nowrap" }}>{r.note}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: "white", border: `1px solid ${STAFF.line}`, borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function formatDateLabel(dateKey, todayKey) {
  if (dateKey === todayKey) return "היום";
  const [, month, day] = dateKey.split("-");
  return `${day}.${month}`;
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

  const { ref, height, isMobile } = useStaffViewport();

  const topItems = useMemo(() => {
    const counts = {};
    filteredOrders.forEach((order) =>
      (order.items || []).forEach((item) => {
        const name = MENU_NAME_BY_ID[item?.id] || getDisplayItemName(item?.name) || "אחר";
        counts[name] = (counts[name] || 0) + 1;
      })
    );
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value, note: String(value) }));
  }, [filteredOrders]);

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
        "Pickup Time",
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
        o.pickupTime || "",
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

  const recentDates = [...new Set([todayDateKey, ...datesWithData])].slice(0, 6);
  const kpis = [
    ['סה"כ הזמנות', filteredOrders.length],
    ["סה״כ הכנסות", `₪${totalRevenue.toLocaleString()}`],
    ["זמן הכנה ממוצע", avgPrep],
    ["שיא עומס", peakWindow],
    ["מוכנות/נמסרו", readyOrDeliveredCount],
    ["ממוצע להזמנה", filteredOrders.length ? `₪${Math.round(totalRevenue / filteredOrders.length)}` : "--"],
  ];
  const pct = (n) => (filteredOrders.length ? Math.round((n / filteredOrders.length) * 100) : 0);

  return (
    <div ref={ref} style={staffRootStyle(height)}>
      <div style={staffSubbarStyle()}>
        <b style={{ fontSize: 16 }}>📊 דוחות</b>
        <StaffPills
          options={recentDates.map((key) => ({ key, label: formatDateLabel(key, todayDateKey) }))}
          value={selectedDateKey}
          onChange={setSelectedDateKey}
        />
        <input
          id="analytics-date-picker"
          aria-label="תאריך דוח"
          type="date"
          value={selectedDateKey}
          max={todayDateKey}
          onChange={(e) => e.target.value && setSelectedDateKey(e.target.value)}
          style={{ border: `1.5px solid ${STAFF.line}`, borderRadius: 10, padding: "5px 8px", fontWeight: 700, color: STAFF.ink, background: "white", fontFamily: "inherit" }}
        />
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setRefreshToken((token) => token + 1)} style={{ ...staffBtn("ghost"), padding: "6px 12px" }}>↻ רענן</button>
          <button type="button" onClick={exportShiftToCsv} style={{ ...staffBtn("accent"), padding: "6px 12px" }}>⬇ ייצוא CSV</button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: STAFF.muted, padding: 16 }}>טוען נתונים מפיירבייס...</div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ color: STAFF.muted, padding: 16 }}>אין נתונים להצגה בתאריך הזה</div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: isMobile ? "auto" : "hidden",
            padding: 10,
            display: "grid",
            gap: 10,
            gridTemplateColumns: isMobile ? "1fr" : "220px 1fr 1fr",
            gridTemplateRows: isMobile ? "none" : "minmax(0, 1fr) minmax(0, 1fr)",
            gridAutoRows: isMobile ? "max-content" : undefined,
          }}
        >
          <div style={{ gridRow: isMobile ? "auto" : "span 2", display: "grid", gap: 8, gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "1fr" }}>
            {kpis.map(([label, value]) => (
              <div key={label} style={{ background: "white", border: `1px solid ${STAFF.line}`, borderRadius: 14, padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
                <span style={{ fontSize: 12, color: STAFF.muted, fontWeight: 700 }}>{label}</span>
                <b style={{ fontSize: isMobile ? 17 : 22 }}>{value}</b>
              </div>
            ))}
          </div>
          <Panel title="מספר הזמנות בכל רבע שעה">
            <div style={{ flex: 1, minHeight: isMobile ? 200 : 0, height: isMobile ? 200 : undefined }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} width={28} />
                  <Tooltip />
                  <Bar dataKey="orders" name="הזמנות" fill={STAFF.accent} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="הכנסות לפי אמצעי תשלום">
            <HBars
              rows={[
                { label: "💵 מזומן", value: paymentTotals.cash, note: `₪${paymentTotals.cash}` },
                { label: "Bit", value: paymentTotals.bit, note: `₪${paymentTotals.bit}` },
                { label: "PayBox", value: paymentTotals.paybox, note: `₪${paymentTotals.paybox}` },
              ]}
            />
          </Panel>
          <Panel title="משלוח מול איסוף עצמי">
            <HBars
              rows={[
                { label: "🛵 משלוח", value: deliveryCount, note: `${deliveryCount} (${pct(deliveryCount)}%) · ₪${deliveryRevenue}` },
                { label: "🏪 איסוף עצמי", value: pickupCount, note: `${pickupCount} (${pct(pickupCount)}%) · ₪${pickupRevenue}` },
              ]}
            />
          </Panel>
          <Panel title="הנמכרים ביותר">
            <HBars rows={topItems} />
          </Panel>
        </div>
      )}
    </div>
  );
}
