import { createRequire } from "module";
import { DateTime } from "luxon";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";

const require = createRequire(import.meta.url);
require("dotenv").config();
const { Resend } = require("resend");

initializeApp();

const db = getFirestore();
const storage = getStorage();

const ORDERS_COLLECTION = "orders";
const ISRAEL_TZ = "Asia/Jerusalem";
const RECIPIENT_DEFAULT = "lior.belhassen@gmail.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DAILY_REPORT_TO = process.env.DAILY_REPORT_TO || RECIPIENT_DEFAULT;
const DAILY_REPORT_FROM = process.env.DAILY_REPORT_FROM || process.env.MAIL_USER;
const resend = new Resend(RESEND_API_KEY);

console.log("Email config loaded:", {
  hasKey: !!process.env.RESEND_API_KEY,
  to: process.env.DAILY_REPORT_TO,
  from: process.env.DAILY_REPORT_FROM,
});

const DRINK_KEY_TO_LABEL = {
  coke: "קוקה קולה",
  cokezero: "קולה זירו",
  sprite: "ספרייט",
  fanta: "פאנטה",
  grapewater: "מים ענבים",
  peachwater: "מים אפרסק",
  fuzetea: "פיוזטי",
  xl: "XL",
  blu: "BLU",
};

const DRINK_LABEL_ALIASES = {
  "קוקה קולה": ["קוקה קולה", "קולה", "coke"],
  "קולה זירו": ["קולה זירו", "זירו", "coke zero", "cokezero"],
  "ספרייט": ["ספרייט", "sprite"],
  "פאנטה": ["פאנטה", "fanta"],
  מים: ["מים", "water"],
  "מים ענבים": ["מים ענבים", "grape water"],
  "מים אפרסק": ["מים אפרסק", "peach water"],
  פיוזטי: ["פיוזטי", "fuzetea", "fuse tea"],
  XL: ["xl"],
  BLU: ["blu"],
};

function toMillis(value) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function getIsraelDateKey(dateTime = DateTime.now().setZone(ISRAEL_TZ)) {
  return dateTime.toFormat("yyyy-LL-dd");
}

function getRangeWindow(startDateKey, endDateKey) {
  const start = DateTime.fromISO(startDateKey, { zone: ISRAEL_TZ }).startOf("day");
  const end = DateTime.fromISO(endDateKey, { zone: ISRAEL_TZ })
    .startOf("day")
    .plus({ days: 1 });
  if (!start.isValid || !end.isValid) {
    throw new Error(`Invalid range: ${startDateKey}..${endDateKey}`);
  }
  return {
    startDate: start.toJSDate(),
    endDate: end.toJSDate(),
    startMs: start.toMillis(),
    endMs: end.toMillis(),
  };
}

// The most recent complete 7-day week: the 7 calendar days ending yesterday
// (Israel time). Run on Friday morning this spans last Friday..Thursday.
function getWeekDateKeysEndingYesterday(now = DateTime.now().setZone(ISRAEL_TZ)) {
  const endDay = now.minus({ days: 1 }).startOf("day");
  const startDay = endDay.minus({ days: 6 });
  return {
    startDateKey: startDay.toFormat("yyyy-LL-dd"),
    endDateKey: endDay.toFormat("yyyy-LL-dd"),
  };
}

function getOrderCreatedMillis(order) {
  return (
    (typeof order?.createdAtClient === "number" && Number.isFinite(order.createdAtClient)
      ? order.createdAtClient
      : null) ?? toMillis(order?.createdAt)
  );
}

function normalizePaymentMethod(order) {
  const raw = String(
    order?.paymentMethod || order?.paymentActual || order?.paymentRequested || ""
  )
    .trim()
    .toLowerCase();

  if (!raw) return null;
  if (raw.includes("cash") || raw.includes("מזומן")) return "cash";
  if (raw.includes("bit")) return "bit";
  if (raw.includes("paybox") || raw.includes("pay box")) return "paybox";
  return null;
}

function normalizeDrinkLabel(raw) {
  const candidate = String(raw || "").trim();
  if (!candidate) return null;

  const key = candidate.toLowerCase().replace(/\s+/g, "");
  if (DRINK_KEY_TO_LABEL[key]) return DRINK_KEY_TO_LABEL[key];

  const lower = candidate.toLowerCase();
  let bestLabel = null;
  let bestLength = 0;
  for (const [label, aliases] of Object.entries(DRINK_LABEL_ALIASES)) {
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      if (a.length > bestLength && lower.includes(a)) {
        bestLabel = label;
        bestLength = a.length;
      }
    }
  }
  return bestLabel || candidate;
}

function extractDrinksFromItem(item, quantity = 1) {
  const results = [];
  const qty = Math.max(1, Number(quantity) || 1);
  const familyMeals = Array.isArray(item?.familyMeals) ? item.familyMeals : [];

  if (familyMeals.length) {
    for (let i = 0; i < qty; i += 1) {
      familyMeals.forEach((meal) => {
        const drinkLabel = normalizeDrinkLabel(meal?.drinkLabel || meal?.drinkKey);
        if (drinkLabel) results.push(drinkLabel);
      });
    }
    return results;
  }

  const byType = normalizeDrinkLabel(item?.drinkType);
  if (byType) {
    for (let i = 0; i < qty; i += 1) results.push(byType);
    return results;
  }

  const byName = normalizeDrinkLabel(item?.name);
  if (byName && Object.prototype.hasOwnProperty.call(DRINK_LABEL_ALIASES, byName)) {
    for (let i = 0; i < qty; i += 1) results.push(byName);
  }

  return results;
}

function isFamilyDealItem(name) {
  return String(name || "").includes("מבצע משפחתי - x4 יאגנוב המבורגר");
}

function isHamburgerItem(name) {
  return String(name || "").includes("המבורגר");
}

function isHotdogItem(name) {
  return String(name || "").includes("נקניקיה");
}

function getPrepDurationMs(order) {
  if (typeof order?.prepDurationMs === "number" && Number.isFinite(order.prepDurationMs)) {
    return Math.max(0, order.prepDurationMs);
  }

  const startMs =
    toMillis(order?.kitchenStartedAt) ??
    toMillis(order?.sentToKitchenAt) ??
    getOrderCreatedMillis(order);
  const readyMs = toMillis(order?.readyAt);
  if (startMs == null || readyMs == null || readyMs < startMs) return null;
  return readyMs - startMs;
}

async function fetchOrdersForRange(startDateKey, endDateKey) {
  const window = getRangeWindow(startDateKey, endDateKey);
  const ordersRef = db.collection(ORDERS_COLLECTION);

  const [dateKeySnap, createdAtSnap, createdAtClientSnap] = await Promise.all([
    ordersRef
      .where("orderDateKey", ">=", startDateKey)
      .where("orderDateKey", "<=", endDateKey)
      .get(),
    ordersRef
      .where("createdAt", ">=", Timestamp.fromDate(window.startDate))
      .where("createdAt", "<", Timestamp.fromDate(window.endDate))
      .get(),
    ordersRef
      .where("createdAtClient", ">=", window.startMs)
      .where("createdAtClient", "<", window.endMs)
      .get(),
  ]);

  const map = new Map();
  [dateKeySnap, createdAtSnap, createdAtClientSnap].forEach((snap) => {
    snap.forEach((docSnap) => {
      map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    });
  });

  const orders = Array.from(map.values()).sort((a, b) => {
    const aMs = getOrderCreatedMillis(a) ?? 0;
    const bMs = getOrderCreatedMillis(b) ?? 0;
    return aMs - bMs;
  });

  return orders;
}

function computeMetrics(orders, dateKey) {
  const totalOrders = orders.length;

  const payments = { cash: 0, bit: 0, paybox: 0 };
  let countedRevenueOrders = 0;

  const statusCounts = {
    new: 0,
    paid: 0,
    in_progress: 0,
    ready: 0,
    delivered: 0,
  };

  const itemsByName = new Map();
  const drinksByType = new Map();
  const loadByHour = Array.from({ length: 24 }, (_, hour) => ({
    hour: String(hour).padStart(2, "0") + ":00",
    count: 0,
  }));

  let burgerPatties = 0;
  let sausageCount = 0;

  const prepDurations = [];

  orders.forEach((order) => {
    const method = normalizePaymentMethod(order);
    const total = Number(order?.total) || 0;
    if (method && Object.prototype.hasOwnProperty.call(payments, method)) {
      payments[method] += total;
      countedRevenueOrders += 1;
    }

    const status = String(order?.status || "");
    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
      statusCounts[status] += 1;
    }

    const createdMs = getOrderCreatedMillis(order);
    if (createdMs != null) {
      const hourIndex = Number(
        DateTime.fromMillis(createdMs, { zone: ISRAEL_TZ }).toFormat("HH")
      );
      if (Number.isFinite(hourIndex) && loadByHour[hourIndex]) {
        loadByHour[hourIndex].count += 1;
      }
    }

    const prepMs = getPrepDurationMs(order);
    if (prepMs != null) prepDurations.push(prepMs);

    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item) => {
      const name = String(item?.name || "פריט לא ידוע").trim() || "פריט לא ידוע";
      const qty = Math.max(1, Number(item?.qty) || 1);
      const unitPrice = Number(item?.price) || 0;
      const lineRevenue = unitPrice * qty;

      const current = itemsByName.get(name) || { name, qty: 0, revenue: 0 };
      current.qty += qty;
      current.revenue += lineRevenue;
      itemsByName.set(name, current);

      if (isFamilyDealItem(name)) {
        burgerPatties += 4 * qty;
      } else if (isHamburgerItem(name)) {
        burgerPatties += qty;
      }

      if (isHotdogItem(name)) {
        sausageCount += 2 * qty;
      }

      extractDrinksFromItem(item, qty).forEach((drinkLabel) => {
        const normalizedLabel = normalizeDrinkLabel(drinkLabel) || "שתיה לא מזוהה";
        drinksByType.set(normalizedLabel, (drinksByType.get(normalizedLabel) || 0) + 1);
      });
    });
  });

  const totalRevenue = payments.cash + payments.bit + payments.paybox;
  const averageOrderValue = countedRevenueOrders
    ? totalRevenue / countedRevenueOrders
    : totalOrders
      ? totalRevenue / totalOrders
      : 0;
  const completedOrDeliveredOrders = statusCounts.ready + statusCounts.delivered;

  const busiestHour =
    [...loadByHour].sort((a, b) => b.count - a.count)[0] || { hour: "--", count: 0 };
  const topItem =
    [...itemsByName.values()].sort((a, b) => b.qty - a.qty)[0] || { name: "--", qty: 0 };
  const topDrink =
    [...drinksByType.entries()].sort((a, b) => b[1] - a[1])[0] || ["--", 0];

  const averagePrepDurationMs = prepDurations.length
    ? prepDurations.reduce((sum, value) => sum + value, 0) / prepDurations.length
    : null;

  return {
    dateKey,
    totalOrders,
    totalRevenue,
    averageOrderValue,
    completedOrDeliveredOrders,
    paymentTotals: payments,
    paymentShare: {
      cash: totalRevenue ? (payments.cash / totalRevenue) * 100 : 0,
      bit: totalRevenue ? (payments.bit / totalRevenue) * 100 : 0,
      paybox: totalRevenue ? (payments.paybox / totalRevenue) * 100 : 0,
    },
    statusCounts,
    itemsSold: [...itemsByName.values()].sort((a, b) => b.qty - a.qty),
    inventory: {
      burgerPatties,
      sausages: sausageCount,
      drinks: [...drinksByType.entries()]
        .map(([drink, count]) => ({ drink, count }))
        .sort((a, b) => b.count - a.count),
    },
    loadByHour,
    busiestHour,
    topItem,
    topDrink: { label: topDrink[0], count: topDrink[1] },
    averagePrepDurationMs,
  };
}

function formatMoney(value) {
  return `₪${Number(value || 0).toFixed(2)}`;
}

function formatDurationMinutes(ms) {
  if (ms == null) return "--";
  const minutes = Math.round(ms / 60000);
  return `${minutes} דקות`;
}

function buildPdfReportBuffer({ label, metrics }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("Foodtruck Weekly Report", { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(12).fillColor("#475569").text(`Period: ${label}`);
    doc.moveDown(0.8);

    doc.fillColor("#111827").fontSize(14).text("Sales Summary");
    doc.moveDown(0.3);
    doc.fontSize(11);
    doc.text(`Total Orders: ${metrics.totalOrders}`);
    doc.text(`Total Revenue: ${formatMoney(metrics.totalRevenue)}`);
    doc.text(`Average Order Value: ${formatMoney(metrics.averageOrderValue)}`);
    doc.text(`Completed/Delivered Orders: ${metrics.completedOrDeliveredOrders}`);
    doc.text(`Average Prep Time: ${formatDurationMinutes(metrics.averagePrepDurationMs)}`);
    doc.moveDown(0.8);

    doc.fontSize(14).text("Revenue Breakdown");
    doc.moveDown(0.3);
    doc.fontSize(11);
    doc.text(`Cash: ${formatMoney(metrics.paymentTotals.cash)}`);
    doc.text(`Bit: ${formatMoney(metrics.paymentTotals.bit)}`);
    doc.text(`PayBox: ${formatMoney(metrics.paymentTotals.paybox)}`);
    doc.moveDown(0.8);

    doc.fontSize(14).text("Inventory Consumption");
    doc.moveDown(0.3);
    doc.fontSize(11);
    doc.text(`Burger Patties: ${metrics.inventory.burgerPatties}`);
    doc.text(`Sausages: ${metrics.inventory.sausages}`);
    if (metrics.inventory.drinks.length) {
      doc.moveDown(0.2);
      metrics.inventory.drinks.forEach((entry) => {
        doc.text(`Drink - ${entry.drink}: ${entry.count}`);
      });
    }

    doc.addPage();
    doc.fontSize(14).fillColor("#111827").text("Order Load by Hour");
    doc.moveDown(0.4);

    const chart = {
      x: 50,
      y: 110,
      width: 500,
      height: 180,
    };

    doc.rect(chart.x, chart.y, chart.width, chart.height).stroke("#cbd5e1");

    const nonZeroPoints = metrics.loadByHour.filter((row) => row.count > 0);
    const points = nonZeroPoints.length ? nonZeroPoints : metrics.loadByHour.slice(8, 17);
    const maxCount = Math.max(...points.map((row) => row.count), 1);
    const barWidth = Math.max(8, (chart.width - 20) / Math.max(points.length, 1) - 6);

    points.forEach((row, index) => {
      const barHeight = (row.count / maxCount) * (chart.height - 30);
      const x = chart.x + 12 + index * (barWidth + 6);
      const y = chart.y + chart.height - 12 - barHeight;
      doc.rect(x, y, barWidth, barHeight).fillAndStroke("#3b82f6", "#1d4ed8");
      doc.fillColor("#1f2937").fontSize(8).text(row.hour, x - 2, chart.y + chart.height - 10, {
        width: barWidth + 8,
        align: "center",
      });
      doc.fontSize(8).text(String(row.count), x, y - 10, { width: barWidth, align: "center" });
    });

    doc.moveDown(12);
    doc.fillColor("#111827").fontSize(14).text("Items Sold Breakdown");
    doc.moveDown(0.4);
    doc.fontSize(10);
    metrics.itemsSold.slice(0, 30).forEach((item) => {
      doc.text(`${item.name} | qty: ${item.qty} | revenue: ${formatMoney(item.revenue)}`);
    });

    doc.end();
  });
}

async function buildXlsxReportBuffer({ label, orders, metrics }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Foodtruck Automated Reports";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 36 },
    { header: "Value", key: "value", width: 30 },
  ];
  summary.addRows([
    { metric: "Period", value: label },
    { metric: "Total Orders", value: metrics.totalOrders },
    { metric: "Total Revenue", value: metrics.totalRevenue },
    { metric: "Average Order Value", value: metrics.averageOrderValue },
    { metric: "Completed/Delivered Orders", value: metrics.completedOrDeliveredOrders },
    { metric: "Average Prep Duration (ms)", value: metrics.averagePrepDurationMs ?? "" },
    { metric: "Busiest Hour", value: `${metrics.busiestHour.hour} (${metrics.busiestHour.count})` },
    { metric: "Top Item", value: `${metrics.topItem.name} (${metrics.topItem.qty})` },
    { metric: "Top Drink", value: `${metrics.topDrink.label} (${metrics.topDrink.count})` },
  ]);

  const payments = workbook.addWorksheet("Payments");
  payments.columns = [
    { header: "Method", key: "method", width: 20 },
    { header: "Revenue", key: "revenue", width: 20 },
    { header: "Share %", key: "share", width: 16 },
  ];
  payments.addRows([
    {
      method: "Cash",
      revenue: metrics.paymentTotals.cash,
      share: metrics.paymentShare.cash,
    },
    {
      method: "Bit",
      revenue: metrics.paymentTotals.bit,
      share: metrics.paymentShare.bit,
    },
    {
      method: "PayBox",
      revenue: metrics.paymentTotals.paybox,
      share: metrics.paymentShare.paybox,
    },
  ]);

  const itemsSheet = workbook.addWorksheet("Items");
  itemsSheet.columns = [
    { header: "Item", key: "name", width: 45 },
    { header: "Quantity Sold", key: "qty", width: 16 },
    { header: "Revenue", key: "revenue", width: 18 },
  ];
  metrics.itemsSold.forEach((item) => itemsSheet.addRow(item));

  const inventory = workbook.addWorksheet("Inventory");
  inventory.columns = [
    { header: "Category", key: "category", width: 28 },
    { header: "Value", key: "value", width: 20 },
  ];
  inventory.addRows([
    { category: "Burger Patties", value: metrics.inventory.burgerPatties },
    { category: "Sausages", value: metrics.inventory.sausages },
  ]);
  metrics.inventory.drinks.forEach((entry) => {
    inventory.addRow({ category: `Drink - ${entry.drink}`, value: entry.count });
  });

  const load = workbook.addWorksheet("LoadByHour");
  load.columns = [
    { header: "Hour", key: "hour", width: 14 },
    { header: "Orders", key: "count", width: 14 },
  ];
  metrics.loadByHour.forEach((row) => load.addRow(row));

  const rawOrders = workbook.addWorksheet("Orders");
  rawOrders.columns = [
    { header: "Order ID", key: "id", width: 34 },
    { header: "Order Number", key: "orderNumber", width: 14 },
    { header: "Customer Name", key: "customerName", width: 28 },
    { header: "Status", key: "status", width: 16 },
    { header: "Payment Requested", key: "paymentRequested", width: 18 },
    { header: "Payment Actual", key: "paymentActual", width: 18 },
    { header: "Payment Method", key: "paymentMethod", width: 16 },
    { header: "Total", key: "total", width: 12 },
    { header: "CreatedAtClient", key: "createdAtClient", width: 18 },
    { header: "CreatedAt", key: "createdAt", width: 26 },
    { header: "SentToKitchenAt", key: "sentToKitchenAt", width: 26 },
    { header: "ReadyAt", key: "readyAt", width: 26 },
    { header: "DeliveredAt", key: "deliveredAt", width: 26 },
    { header: "PrepDurationMs", key: "prepDurationMs", width: 16 },
    { header: "Items JSON", key: "items", width: 80 },
  ];

  orders.forEach((order) => {
    rawOrders.addRow({
      id: order.id,
      orderNumber: order.orderNumber ?? "",
      customerName: order.customerName ?? "",
      status: order.status ?? "",
      paymentRequested: order.paymentRequested ?? "",
      paymentActual: order.paymentActual ?? "",
      paymentMethod: order.paymentMethod ?? "",
      total: Number(order.total) || 0,
      createdAtClient:
        typeof order.createdAtClient === "number" && Number.isFinite(order.createdAtClient)
          ? order.createdAtClient
          : "",
      createdAt: toMillis(order.createdAt) ?? "",
      sentToKitchenAt: toMillis(order.sentToKitchenAt) ?? "",
      readyAt: toMillis(order.readyAt) ?? "",
      deliveredAt: toMillis(order.deliveredAt) ?? "",
      prepDurationMs: order.prepDurationMs ?? "",
      items: JSON.stringify(order.items ?? []),
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function getMailTransport() {
  const service = process.env.MAIL_SERVICE;
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const secure = String(process.env.MAIL_SECURE || "").toLowerCase() === "true";
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!user || !pass) return null;

  if (service) {
    return nodemailer.createTransport({
      service,
      auth: { user, pass },
    });
  }

  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  return null;
}

async function sendReportEmail({
  label,
  fileLabel,
  pdfBuffer,
  xlsxBuffer,
  metrics,
  toEmail = RECIPIENT_DEFAULT,
}) {
  const fromAddress = DAILY_REPORT_FROM;
  if (!RESEND_API_KEY || !fromAddress) {
    logger.warn(
      "Email is not configured. Skipping email send.",
      "Set RESEND_API_KEY and DAILY_REPORT_FROM."
    );
    return { emailed: false, reason: "mail_not_configured" };
  }

  await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: `Weekly Foodtruck Report - ${label}`,
    text: [
      `Attached are the reports for ${label}.`,
      `Total orders: ${metrics.totalOrders}`,
      `Total revenue: ${formatMoney(metrics.totalRevenue)}`,
      "Files: PDF + XLSX",
    ].join("\n"),
    attachments: [
      {
        filename: `foodtruck-report-${fileLabel}.pdf`,
        content: pdfBuffer,
      },
      {
        filename: `foodtruck-report-${fileLabel}.xlsx`,
        content: xlsxBuffer,
      },
    ],
  });

  return { emailed: true };
}

async function saveReportFilesToStorage({ fileLabel, pdfBuffer, xlsxBuffer }) {
  try {
    const bucket = storage.bucket();
    const basePath = `reports/${fileLabel}`;
    const pdfPath = `${basePath}/foodtruck-report-${fileLabel}.pdf`;
    const xlsxPath = `${basePath}/foodtruck-report-${fileLabel}.xlsx`;

    await Promise.all([
      bucket.file(pdfPath).save(pdfBuffer, {
        contentType: "application/pdf",
        resumable: false,
        metadata: { cacheControl: "no-store" },
      }),
      bucket.file(xlsxPath).save(xlsxBuffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        resumable: false,
        metadata: { cacheControl: "no-store" },
      }),
    ]);

    return {
      saved: true,
      paths: {
        pdf: `gs://${bucket.name}/${pdfPath}`,
        xlsx: `gs://${bucket.name}/${xlsxPath}`,
      },
    };
  } catch (error) {
    logger.error("Failed saving report files to Cloud Storage", error);
    return { saved: false, error: error.message };
  }
}

async function buildAndDeliverReport({
  startDateKey,
  endDateKey,
  mode = "scheduled",
  recipientEmail = RECIPIENT_DEFAULT,
}) {
  const isSingleDay = startDateKey === endDateKey;
  const label = isSingleDay ? startDateKey : `${startDateKey} – ${endDateKey}`;
  const fileLabel = isSingleDay ? startDateKey : `${startDateKey}_${endDateKey}`;

  logger.info("Starting report generation", { startDateKey, endDateKey, mode });

  const orders = await fetchOrdersForRange(startDateKey, endDateKey);
  const metrics = computeMetrics(orders, label);

  const [pdfBuffer, xlsxBuffer] = await Promise.all([
    buildPdfReportBuffer({ label, metrics }),
    buildXlsxReportBuffer({ label, orders, metrics }),
  ]);

  const [emailResult, storageResult] = await Promise.all([
    sendReportEmail({
      label,
      fileLabel,
      pdfBuffer,
      xlsxBuffer,
      metrics,
      toEmail: recipientEmail,
    }),
    saveReportFilesToStorage({ fileLabel, pdfBuffer, xlsxBuffer }),
  ]);

  logger.info("Report generation complete", {
    startDateKey,
    endDateKey,
    mode,
    totalOrders: metrics.totalOrders,
    totalRevenue: metrics.totalRevenue,
    emailed: emailResult.emailed,
    savedToStorage: storageResult.saved,
  });

  return {
    startDateKey,
    endDateKey,
    mode,
    totalOrders: metrics.totalOrders,
    totalRevenue: metrics.totalRevenue,
    emailed: emailResult.emailed,
    emailReason: emailResult.reason || null,
    storage: storageResult,
  };
}

function extractManualToken(req) {
  const bearer = req.headers.authorization || "";
  const bearerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  return (
    req.headers["x-report-token"] ||
    req.query.token ||
    (typeof req.body?.token === "string" ? req.body.token : "") ||
    bearerToken
  );
}

function resolveManualRange(req) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const startDateKey = String(req.query.startDateKey || req.body?.startDateKey || "");
  const endDateKey = String(req.query.endDateKey || req.body?.endDateKey || "");
  if (re.test(startDateKey) && re.test(endDateKey)) {
    return { startDateKey, endDateKey };
  }

  const single = String(req.query.dateKey || req.body?.dateKey || "");
  if (re.test(single)) {
    return { startDateKey: single, endDateKey: single };
  }

  // Default: the most recent complete week (7 days ending yesterday).
  return getWeekDateKeysEndingYesterday();
}

export const generateWeeklyReportFridayIl = onSchedule(
  {
    // Every Friday at 06:00 Israel time (cron day-of-week 5 = Friday).
    schedule: "0 6 * * 5",
    timeZone: ISRAEL_TZ,
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    const { startDateKey, endDateKey } = getWeekDateKeysEndingYesterday();
    await buildAndDeliverReport({
      startDateKey,
      endDateKey,
      mode: "scheduled-weekly",
      recipientEmail: DAILY_REPORT_TO,
    });
  }
);

export const generateDailyReportNow = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    try {
      if (!["GET", "POST"].includes(req.method)) {
        res.status(405).json({ ok: false, error: "Method not allowed" });
        return;
      }

      const expectedToken = process.env.REPORTS_MANUAL_TOKEN;
      if (expectedToken) {
        const receivedToken = String(extractManualToken(req) || "");
        if (!receivedToken || receivedToken !== expectedToken) {
          res.status(403).json({ ok: false, error: "Forbidden" });
          return;
        }
      }

      const { startDateKey, endDateKey } = resolveManualRange(req);
      const recipientEmail =
        String(req.query.to || req.body?.to || DAILY_REPORT_TO);

      const result = await buildAndDeliverReport({
        startDateKey,
        endDateKey,
        mode: "manual",
        recipientEmail,
      });

      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      logger.error("Manual report generation failed", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "Failed to generate report",
      });
    }
  }
);

export const sendTestEmail = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req, res) => {
    try {
      if (!process.env.RESEND_API_KEY) {
        res.status(500).json({
          ok: false,
          error: "Missing RESEND_API_KEY",
        });
        return;
      }

      const toEmail = process.env.DAILY_REPORT_TO;
      const fromEmail = process.env.DAILY_REPORT_FROM;

      if (!toEmail || !fromEmail) {
        res.status(500).json({
          ok: false,
          error: "Missing DAILY_REPORT_TO or DAILY_REPORT_FROM",
        });
        return;
      }

      const result = await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: "Test Email - Foodtruck",
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif">
            <h2>מייל בדיקה</h2>
            <p>זהו מייל בדיקה כדי לוודא שמערכת הדוחות יכולה לשלוח מיילים.</p>
          </div>
        `,
      });

      res.status(200).json({
        ok: true,
        message: "Test email sent successfully",
        result,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error?.message || "Failed to send test email",
      });
    }
  }
);

export const __testables = {
  toMillis,
  getIsraelDateKey,
  getRangeWindow,
  getWeekDateKeysEndingYesterday,
  getOrderCreatedMillis,
  normalizePaymentMethod,
  normalizeDrinkLabel,
  extractDrinksFromItem,
  isFamilyDealItem,
  isHamburgerItem,
  isHotdogItem,
  getPrepDurationMs,
  computeMetrics,
  formatMoney,
  formatDurationMinutes,
  extractManualToken,
  resolveManualRange,
};
