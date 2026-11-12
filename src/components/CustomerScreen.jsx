import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  screenCardStyle,
  statusLabel,
} from "./uiHelpersUtils.jsx";
import {
  groupCart,
  menu,
} from "./uiHelpersUtils.jsx";
import {
  ALL_TOPPINGS,
  DRINK_OPTIONS,
  EXTRA_DRINK_OPTIONS,
  THEME,
  DELIVERY_FEES_BY_CITY,
  drinkStockKey,
  menuStockKey,
} from "./customer/customerConstants.js";
import {
  getDisplayItemName,
  isStandaloneDrinkItem,
  itemHasDrinkChoice,
  modsKeysToDisplayLabels,
  replaceDrinkInName,
} from "./customer/customerHelpers.js";
import { PaymentChoiceButton } from "./customer/customerAtoms.jsx";
import { TimeWheelPicker } from "./customer/TimeWheelPicker.jsx";

const PAYMENT_LINKS = {
  bit: { url: "https://www.bitpay.co.il/app/me/4AF18BEF-2E06-426D-8A63-C99100BE8068", label: "קישור לתשלום בביט" },
  paybox: { url: "https://links.payboxapp.com/Rp9SBFAn85b", label: "קישור לתשלום בפייבוקס" },
};

const PICKUP_TIME_MIN = "18:30";
const PICKUP_TIME_MAX = "23:00";
const DEFAULT_PICKUP_TIME = PICKUP_TIME_MIN;

// השעה המוקדמת ביותר שאפשר לבחור לאיסוף: עכשיו (שעון ישראל) מעוגל למעלה
// ל-15 דקות, בתוך הטווח PICKUP_TIME_MIN–PICKUP_TIME_MAX.
function getEarliestPickupTime() {
  const [h, m] = new Date()
    .toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .split(":")
    .map(Number);
  const rounded = Math.ceil((h * 60 + m) / 15) * 15;
  const now = `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
  if (now < PICKUP_TIME_MIN) return PICKUP_TIME_MIN;
  if (now > PICKUP_TIME_MAX) return PICKUP_TIME_MAX;
  return now;
}

const REVIEW_DISMISS_STORAGE_KEY = "ft_dismissed_review_order_id";

function getDismissedReviewOrderId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REVIEW_DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistDismissedReviewOrderId(orderId) {
  if (typeof window === "undefined") return;
  try {
    if (orderId) {
      window.localStorage.setItem(REVIEW_DISMISS_STORAGE_KEY, orderId);
    } else {
      window.localStorage.removeItem(REVIEW_DISMISS_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
}

const STATUS_DISMISS_STORAGE_KEY = "ft_dismissed_status_key";

function getDismissedStatusKey() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STATUS_DISMISS_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persistDismissedStatusKey(key) {
  if (typeof window === "undefined") return;
  try {
    if (key) {
      window.localStorage.setItem(STATUS_DISMISS_STORAGE_KEY, key);
    } else {
      window.localStorage.removeItem(STATUS_DISMISS_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
}

function isFamilyDealItem(item) {
  return String(item?.name || "").includes("מבצע משפחתי - x4 יאגנוב המבורגר");
}

function isExtraDrinkItem(item) {
  return String(item?.name || "").trim() === "שתיה נוספת";
}

function getDrinkOptionsForItem(item) {
  if (isExtraDrinkItem(item)) return EXTRA_DRINK_OPTIONS;
  return DRINK_OPTIONS;
}

// Meals include a can; a small bottle can be chosen instead for the price difference.
const MEAL_DRINK_OPTIONS = [...DRINK_OPTIONS, ...EXTRA_DRINK_OPTIONS];
const CAN_PRICE = menu.find((item) => isStandaloneDrinkItem(item) && !isExtraDrinkItem(item))?.price ?? 0;
const BOTTLE_PRICE = menu.find(isExtraDrinkItem)?.price ?? CAN_PRICE;
const BOTTLE_DRINK_KEYS = new Set(EXTRA_DRINK_OPTIONS.map((drink) => drink.key));

function mealDrinkSurcharge(drinkKey) {
  return BOTTLE_DRINK_KEYS.has(drinkKey) ? Math.max(0, BOTTLE_PRICE - CAN_PRICE) : 0;
}

function mealDrinkChoiceLabel(drink, isSoldOut) {
  if (isSoldOut) return `${drink.label} (חסר)`;
  const surcharge = mealDrinkSurcharge(drink.key);
  return surcharge ? `${drink.label} +₪${surcharge}` : drink.label;
}

function createInitialFamilyMealsConfig() {
  return Array.from({ length: 4 }, () => ({
    mods: [],
    drinkKey: null,
  }));
}

const READY_VIBRATION_PATTERN = [300, 100, 300];

function starsVisual(value = 0) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

function starsVisualFromFloat(value = 0) {
  const safe = Math.max(0, Math.min(5, Number(value) || 0));
  const rounded = Math.round(safe);
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

function formatReviewDate(value) {
  if (!value) return "";
  try {
    if (typeof value === "object" && typeof value.toDate === "function") {
      return value.toDate().toLocaleDateString("he-IL");
    }
    if (typeof value === "number") {
      return new Date(value).toLocaleDateString("he-IL");
    }
  } catch {
    return "";
  }
  return "";
}

const KIOSK = {
  bg: "#fbf7f1",
  ink: "#2b2118",
  muted: "#8a7b6c",
  accent: "#e2552a",
  accentSoft: "#fdeee6",
  accentInk: "#c2410c",
  line: "#ecdfd0",
  soft: "#f4ece2",
  imgBg: "#f6efe6",
};

const KIOSK_CATEGORIES = [
  { key: "main", label: "מנות עיקריות", icon: "🍔" },
  { key: "drinks", label: "שתיה", icon: "🥤" },
  { key: "sides", label: "תוספות", icon: "🍟" },
];

function kioskCategoryOf(item) {
  if (isStandaloneDrinkItem(item)) return "drinks";
  if (item.allowsToppings || itemHasDrinkChoice(item) || isFamilyDealItem(item)) return "main";
  return "sides";
}

function splitKioskTitle(name) {
  const display = getDisplayItemName(name);
  if (display.includes(" - ")) {
    const [title, ...rest] = display.split(" - ");
    return { title, sub: rest.join(" - ") };
  }
  const plusIdx = display.indexOf(" + ");
  if (plusIdx > 0) return { title: display.slice(0, plusIdx), sub: display.slice(plusIdx + 1) };
  return { title: display, sub: "" };
}

function menuItemImage(itemId) {
  const item = menu.find((m) => m.id === itemId);
  return item?.parts?.find((p) => p.type === "image")?.src || "";
}

function cartGroupKey(item) {
  const rawName = typeof item?.name === "string" ? item.name.trim() : "";
  const mods = Array.isArray(item?.mods) ? item.mods : [];
  return `${rawName || "פריט לא ידוע"}__${mods.slice().sort().join(",")}`;
}

function kioskMealSummary(mods, drinkLabel) {
  const labels = modsKeysToDisplayLabels(mods);
  const parts = [labels.length ? `+${labels.join(", ")}` : "ללא תוספות"];
  if (drinkLabel) parts.push(`🥤 ${drinkLabel}`);
  return parts.join(" · ");
}

const kioskSheetTitleStyle = { fontWeight: 900, fontSize: 15, color: KIOSK.ink };
const kioskChoiceGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))",
  gap: 8,
};
const kioskSummaryLineStyle = {
  fontSize: 13.5,
  fontWeight: 700,
  color: KIOSK.muted,
  background: KIOSK.soft,
  padding: "8px 10px",
  borderRadius: 10,
};
const kioskCloseButtonStyle = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "none",
  background: KIOSK.soft,
  color: KIOSK.ink,
  cursor: "pointer",
  fontSize: 15,
  flexShrink: 0,
};

function kioskCtaStyle(enabled) {
  return {
    width: "100%",
    padding: "15px",
    borderRadius: 16,
    border: "none",
    background: KIOSK.accent,
    color: "white",
    fontWeight: 900,
    fontSize: 17,
    fontFamily: "inherit",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.45,
    boxShadow: enabled ? "0 8px 20px rgba(226,85,42,0.25)" : "none",
  };
}

function KioskSheet({ isMobile, onClose, children }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 24,
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 16,
        direction: "rtl",
      }}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: isMobile ? "92dvh" : "90vh",
          overflowY: "auto",
          background: "white",
          borderRadius: isMobile ? "24px 24px 0 0" : 24,
          padding: 16,
          boxSizing: "border-box",
          display: "grid",
          gap: 10,
          textAlign: "right",
          color: KIOSK.ink,
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

function KioskSheetHeader({ imageSrc, title, subtitle, onClose }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {imageSrc && (
        <img
          src={imageSrc}
          alt=""
          style={{ width: 84, height: 60, objectFit: "cover", borderRadius: 12, flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 20 }}>{title}</div>
        <div style={{ color: KIOSK.muted, fontWeight: 700 }}>{subtitle}</div>
      </div>
      <button type="button" onClick={onClose} aria-label="סגור" style={kioskCloseButtonStyle}>
        ✕
      </button>
    </div>
  );
}

function KioskChoice({ label, imageSrc, active, disabled = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        border: `2px solid ${active ? KIOSK.accent : KIOSK.line}`,
        background: active ? KIOSK.accentSoft : "white",
        color: active ? KIOSK.accentInk : KIOSK.ink,
        borderRadius: 14,
        padding: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        fontWeight: 800,
        fontSize: 13,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <img src={imageSrc} alt="" style={{ width: 44, height: 44, objectFit: "contain" }} />
      <span>{label}</span>
    </button>
  );
}

function KioskTile({ tile, isMobile, onSelect, onOpenReviews }) {
  const { title, sub, price, imageSrc, contain, soldOut: tileSoldOut, qty, ratingStats, badge } = tile;
  const badgeText = tileSoldOut ? "חסר במלאי" : qty > 0 ? `✓ ${qty} בהזמנה` : badge;
  return (
    <div
      style={{
        position: "relative",
        background: "white",
        borderRadius: 16,
        boxShadow: "0 1px 4px rgba(60,30,0,0.08)",
        border: `2px solid ${qty > 0 && !tileSoldOut ? KIOSK.accent : "transparent"}`,
        opacity: tileSoldOut ? 0.55 : 1,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {badgeText && (
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 1,
            background: tileSoldOut ? "#7f1d1d" : KIOSK.accent,
            color: "white",
            fontSize: 11.5,
            fontWeight: 900,
            padding: "3px 9px",
            borderRadius: 999,
          }}
        >
          {badgeText}
        </span>
      )}
      <button
        type="button"
        disabled={tileSoldOut}
        onClick={onSelect}
        style={{
          border: "none",
          background: "none",
          padding: 10,
          paddingBottom: ratingStats?.count > 0 ? 2 : 10,
          textAlign: "right",
          cursor: tileSoldOut ? "not-allowed" : "pointer",
          display: "grid",
          gap: 2,
          fontFamily: "inherit",
          color: KIOSK.ink,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            aspectRatio: "1.5",
            borderRadius: 10,
            overflow: "hidden",
            background: contain ? "white" : KIOSK.imgBg,
            marginBottom: 6,
          }}
        >
          <img
            src={imageSrc}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: contain ? "contain" : "cover",
              display: "block",
            }}
          />
        </div>
        <div style={{ fontWeight: 900, fontSize: isMobile ? 15 : 16, lineHeight: 1.25 }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: KIOSK.muted, fontWeight: 600 }}>{sub}</div>}
        <div style={{ fontWeight: 900, fontSize: 19, color: KIOSK.accentInk, marginTop: 4 }}>₪{price}</div>
      </button>
      {ratingStats?.count > 0 && (
        <button
          type="button"
          onClick={onOpenReviews}
          aria-label={`הצג ביקורות עבור ${title}`}
          style={{
            border: "none",
            background: "none",
            padding: "0 10px 10px",
            textAlign: "right",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
            color: KIOSK.muted,
          }}
        >
          <span style={{ color: "#f59e0b" }}>{starsVisualFromFloat(ratingStats.avg)}</span>{" "}
          {ratingStats.avg.toFixed(1)} ({ratingStats.count})
        </button>
      )}
    </div>
  );
}

const deliveryLabelStyle = {
  fontWeight: 900,
  color: "#78350f",
  fontSize: 15,
  marginBottom: 8,
};

export default function CustomerScreen({
  soldOut = {},
  customerName = "",
  setCustomerName = () => {},
  customerConfirmed = false,
  setCustomerConfirmed = () => {},
  cart = [],
  setCart = () => {},
  onSendOrder = () => {},
  customerOrder = null,
  onSubmitReview = async () => {},
  menuRatingsByItemId = {},
  menuItemReviewsById = {},
  onOpenPrivacy = () => {},
}) {
  const [showFamilyConfig, setShowFamilyConfig] = useState(false);
  const [familyConfigError, setFamilyConfigError] = useState("");
  const [familyMealConfigs, setFamilyMealConfigs] = useState(createInitialFamilyMealsConfig);
  const [familyDealItem, setFamilyDealItem] = useState(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [submitOrderError, setSubmitOrderError] = useState("");
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [showOrderStatusModal, setShowOrderStatusModal] = useState(false);
  const [dismissedStatusKey, setDismissedStatusKeyState] = useState(getDismissedStatusKey);
  const setDismissedStatusKey = (key) => {
    setDismissedStatusKeyState(key);
    persistDismissedStatusKey(key);
  };
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewModalDismissedOrderId, setReviewModalDismissedOrderIdState] = useState(
    getDismissedReviewOrderId
  );
  const setReviewModalDismissedOrderId = (orderId) => {
    setReviewModalDismissedOrderIdState(orderId);
    persistDismissedReviewOrderId(orderId);
  };
  const [selectedReviewsItem, setSelectedReviewsItem] = useState(null);
  const [activeCategory, setActiveCategory] = useState("main");
  const [panelTab, setPanelTab] = useState("order");
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [sheetItem, setSheetItem] = useState(null);
  const [sheetMods, setSheetMods] = useState([]);
  const [sheetDrink, setSheetDrink] = useState(null);
  const [activeFamilyMeal, setActiveFamilyMeal] = useState(0);
  const [kioskHeight, setKioskHeight] = useState(null);
  const [requestedPayment, setRequestedPayment] = useState("cash");
  const [orderType, setOrderType] = useState("pickup");
  const [certLightbox, setCertLightbox] = useState(null);
  const [deliveryTime, setDeliveryTime] = useState(null);
  const [pickupTime, setPickupTime] = useState(DEFAULT_PICKUP_TIME);
  const earliestPickupTime = getEarliestPickupTime();
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const kioskRef = useRef(null);
  const notifyingReadyOrderIdsRef = useRef(new Set());
  const readyAudioRef = useRef(null);
  const audioUnlockedRef = useRef(false);

  const isMobile = viewportWidth <= 900;
  const isDesktop = viewportWidth > 900;
  const displayCustomerName = customerName.trim() || "לקוח";
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const deliveryFee = orderType === "delivery" ? DELIVERY_FEES_BY_CITY[deliveryCity] || 0 : 0;
  const orderTotal = total + deliveryFee;
  const deliveryDetailsComplete =
    Boolean(customerName.trim()) &&
    (orderType === "pickup" ||
    (Boolean(deliveryCity) &&
      Boolean(deliveryTime) &&
      Boolean(deliveryAddress.trim()) &&
      Boolean(deliveryPhone.trim())));
  const grouped = useMemo(() => groupCart(cart), [cart]);
  const customerStatusModalKey =
    customerOrder?.id && customerOrder?.status
      ? `${customerOrder.id}:${customerOrder.status}`
      : "";
  const shouldShowCustomerStatusModal =
    !!customerOrder &&
    ["new", "paid", "in_progress"].includes(customerOrder.status) &&
    !showReadyModal &&
    !showReviewModal &&
    !selectedReviewsItem &&
    !sheetItem &&
    !showFamilyConfig;
  const selectedItemReviews =
    selectedReviewsItem && Array.isArray(menuItemReviewsById[selectedReviewsItem.id])
      ? menuItemReviewsById[selectedReviewsItem.id]
      : [];
  const reviewsModal =
    selectedReviewsItem && typeof document !== "undefined"
      ? createPortal(
          <div
            onClick={() => setSelectedReviewsItem(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.42)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 27,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 460,
                maxHeight: "78vh",
                overflow: "hidden",
                background: "white",
                borderRadius: 20,
                border: `1px solid ${THEME.border}`,
                boxShadow: "0 24px 60px rgba(15,23,42,0.20)",
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                direction: "rtl",
                textAlign: "right",
              }}
            >
              <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${THEME.borderSoft}` }}>
                <div style={{ fontWeight: 900, color: THEME.text, fontSize: 17 }}>
                  ביקורות עבור {getDisplayItemName(selectedReviewsItem.name)}
                </div>
              </div>

              <div style={{ overflowY: "auto", padding: "10px 16px", display: "grid", gap: 8 }}>
                {selectedItemReviews.length ? (
                  selectedItemReviews.map((review, idx) => (
                    <div
                      key={`${review.orderId || "review"}-${idx}`}
                      style={{
                        border: `1px solid ${THEME.borderSoft}`,
                        borderRadius: 12,
                        padding: "9px 10px",
                        background: "#f8fafc",
                        display: "grid",
                        gap: 5,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ color: "#f59e0b", fontWeight: 900, letterSpacing: 0.5 }}>
                          {starsVisual(review.rating)}
                        </div>
                        <div style={{ color: THEME.textMuted, fontSize: 12, fontWeight: 700 }}>
                          {formatReviewDate(review.createdAt)}
                        </div>
                      </div>
                      <div style={{ color: THEME.text, fontSize: 14, lineHeight: 1.5 }}>
                        {(review.comment || "").trim() || "ללא הערה"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: THEME.textMuted, fontWeight: 700 }}>עדיין אין ביקורות להצגה</div>
                )}
              </div>

              <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${THEME.borderSoft}` }}>
                <button
                  onClick={() => setSelectedReviewsItem(null)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: `1px solid ${THEME.border}`,
                    background: "white",
                    color: THEME.text,
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  סגור
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const activeFamilyMealConfig = familyMealConfigs[activeFamilyMeal] || familyMealConfigs[0];
  const familyConfigModal = showFamilyConfig ? (
    <KioskSheet isMobile={isMobile} onClose={closeFamilyConfig}>
      <KioskSheetHeader
        imageSrc={menuItemImage(familyDealItem?.id)}
        title="מבצע משפחתי - x4 יאגנוב המבורגר"
        subtitle={`בחרו תוספות ושתיה לכל אחת מ-4 המנות · ₪${familyDealItem?.price ?? ""}`}
        onClose={closeFamilyConfig}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {familyMealConfigs.map((meal, index) => (
          <button
            key={`family-meal-tab-${index}`}
            type="button"
            onClick={() => setActiveFamilyMeal(index)}
            style={{
              padding: "9px 4px",
              borderRadius: 10,
              border: "none",
              background: index === activeFamilyMeal ? KIOSK.accent : KIOSK.soft,
              color: index === activeFamilyMeal ? "white" : KIOSK.ink,
              fontWeight: 800,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            מנה {index + 1}
            {meal.drinkKey ? " ✓" : ""}
          </button>
        ))}
      </div>

      <div style={kioskSheetTitleStyle}>תוספות למנה {activeFamilyMeal + 1}</div>
      <div style={kioskChoiceGridStyle}>
        {ALL_TOPPINGS.map((ing) => (
          <KioskChoice
            key={`family-${activeFamilyMeal}-${ing.key}`}
            imageSrc={ing.imageSrc}
            label={ing.label}
            active={activeFamilyMealConfig.mods.includes(ing.key)}
            onClick={() => toggleFamilyMealMod(activeFamilyMeal, ing.key)}
          />
        ))}
      </div>

      <div style={kioskSheetTitleStyle}>שתיה למנה {activeFamilyMeal + 1}</div>
      <div style={kioskChoiceGridStyle}>
        {MEAL_DRINK_OPTIONS.map((drink) => {
          const drinkSoldOut = soldOut[drinkStockKey(drink.key)] === true;
          return (
            <KioskChoice
              key={`family-drink-${activeFamilyMeal}-${drink.key}`}
              imageSrc={drink.imageSrc}
              label={mealDrinkChoiceLabel(drink, drinkSoldOut)}
              active={activeFamilyMealConfig.drinkKey === drink.key}
              disabled={drinkSoldOut}
              onClick={() => chooseFamilyDrink(drink.key)}
            />
          );
        })}
      </div>

      <div style={kioskSummaryLineStyle}>
        מנה {activeFamilyMeal + 1}:{" "}
        {kioskMealSummary(
          activeFamilyMealConfig.mods,
          MEAL_DRINK_OPTIONS.find((d) => d.key === activeFamilyMealConfig.drinkKey)?.label || "בחרו שתיה"
        )}
      </div>

      {familyConfigError && (
        <div style={{ color: "#b91c1c", fontWeight: 800, textAlign: "center" }}>
          {familyConfigError}
        </div>
      )}

      <button type="button" onClick={() => handleConfirmFamily()} style={kioskCtaStyle(true)}>
        הוספה להזמנה · ₪
        {(familyDealItem?.price ?? 0) +
          familyMealConfigs.reduce((sum, meal) => sum + mealDrinkSurcharge(meal.drinkKey), 0)}
      </button>
    </KioskSheet>
  ) : null;

  const reviewStageModal =
    showReviewModal &&
    customerOrder?.status === "delivered" &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.52)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 26,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 500,
                background: "white",
                borderRadius: 22,
                border: "1px solid #dbeafe",
                boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
                padding: isMobile ? 14 : 16,
                display: "grid",
                gap: 10,
                maxHeight: "88vh",
                overflowY: "auto",
                direction: "rtl",
                textAlign: "right",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 18, color: THEME.text }}>
                איך הייתה החוויה שלך?
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={`review-star-${star}`}
                    disabled={isSubmittingReview || reviewSubmitted}
                    onClick={() => setReviewRating(star)}
                    style={{
                      border: reviewRating >= star ? "1px solid #f59e0b" : "1px solid #cbd5e1",
                      background: reviewRating >= star ? "#fef3c7" : "white",
                      color: "#b45309",
                      borderRadius: 12,
                      padding: "8px 10px",
                      cursor:
                        isSubmittingReview || reviewSubmitted ? "not-allowed" : "pointer",
                      fontSize: 20,
                      lineHeight: 1,
                    }}
                    aria-label={`דירוג ${star} כוכבים`}
                  >
                    {reviewRating >= star ? "★" : "☆"}
                  </button>
                ))}
              </div>

              <div style={{ color: THEME.textMuted, fontWeight: 700, fontSize: 13 }}>
                {reviewRating ? `דירוג נבחר: ${starsVisual(reviewRating)}` : "בחר דירוג בין 1 ל-5 כוכבים"}
              </div>

              <textarea
                maxLength={200}
                disabled={isSubmittingReview || reviewSubmitted}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value.slice(0, 200))}
                placeholder="רוצה להוסיף הערה? (עד 200 תווים)"
                style={{
                  width: "100%",
                  minHeight: 90,
                  borderRadius: 14,
                  border: "1px solid #cbd5e1",
                  padding: 10,
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  fontSize: 14,
                  resize: "vertical",
                  direction: "rtl",
                  textAlign: "right",
                }}
              />

              <div style={{ fontSize: 12, color: THEME.textMuted, textAlign: "right" }}>
                {reviewComment.length}/200
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={handleSubmitReview}
                  disabled={isSubmittingReview || reviewSubmitted}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: "none",
                    background: reviewSubmitted
                      ? "#10b981"
                      : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                    color: "white",
                    cursor:
                      isSubmittingReview || reviewSubmitted ? "not-allowed" : "pointer",
                    fontWeight: 800,
                  }}
                >
                  {reviewSubmitted ? "תודה על הדירוג!" : isSubmittingReview ? "שולח..." : "שלח דירוג"}
                </button>

                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    if (customerOrder?.id) {
                      setReviewModalDismissedOrderId(customerOrder.id);
                    }
                  }}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: `1px solid ${THEME.border}`,
                    background: "white",
                    color: THEME.text,
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  סגור
                </button>

                {reviewError && (
                  <div style={{ color: "#b91c1c", fontWeight: 700 }}>{reviewError}</div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const customerStatusModal =
    showOrderStatusModal &&
    shouldShowCustomerStatusModal &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            onClick={() => {
              setShowOrderStatusModal(false);
              setDismissedStatusKey(customerStatusModalKey);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.48)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 460,
                background: "white",
                borderRadius: 22,
                border: "1px solid #bfdbfe",
                boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
                padding: isMobile ? "18px 16px" : "22px 20px",
                direction: "rtl",
                textAlign: "right",
                display: "grid",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: isMobile ? 24 : 28,
                  color: "#1d4ed8",
                  textAlign: "right",
                }}
              >
                הזמנה #{customerOrder.orderNumber}
              </div>
              <div style={{ color: "#1f2937", fontWeight: 700, lineHeight: 1.6 }}>
                {(customerOrder.customerName || "").trim() || "לקוח"}
              </div>
              <div style={{ color: "#1f2937", fontWeight: 800, fontSize: 18 }}>
                סטטוס: {statusLabel(customerOrder.status)}
              </div>
              <button
                onClick={() => {
                  setShowOrderStatusModal(false);
                  setDismissedStatusKey(customerStatusModalKey);
                }}
                style={{
                  marginTop: 4,
                  padding: "10px 16px",
                  borderRadius: 14,
                  border: "1px solid #d1d5db",
                  background: "white",
                  color: "#111827",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                הבנתי
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const audio = new Audio("/notification.mp3");
    audio.preload = "auto";
    audio.volume = 1;
    readyAudioRef.current = audio;

    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;

      try {
        const wasMuted = audio.muted;
        audio.muted = true;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = wasMuted;
            })
            .catch(() => {
              // Some browsers may still block until a stricter gesture context.
              audio.muted = wasMuted;
            });
        } else {
          audio.muted = wasMuted;
        }
      } catch {
        // Graceful no-op for unsupported/restricted environments.
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
    window.addEventListener("touchstart", unlockAudio, { once: true, passive: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      if (readyAudioRef.current) {
        readyAudioRef.current.pause();
        readyAudioRef.current.currentTime = 0;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!customerConfirmed) return undefined;
    const measure = () => {
      const el = kioskRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const below = isMobile ? 26 : 34;
      setKioskHeight(Math.max(460, Math.floor(window.innerHeight - top - below)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [customerConfirmed, isMobile]);

  useEffect(() => {
    const currentOrderId = customerOrder?.id;
    if (!currentOrderId) return;
    if (customerOrder?.status !== "ready") return;
    if (customerOrder?.notifiedReady !== false) return;
    if (notifyingReadyOrderIdsRef.current.has(currentOrderId)) return;

    notifyingReadyOrderIdsRef.current.add(currentOrderId);

    const notifyAndPersist = async () => {
      setShowReadyModal(true);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      const readyAudio = readyAudioRef.current;
      if (readyAudio) {
        try {
          readyAudio.currentTime = 0;
          const playPromise = readyAudio.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {
              // Keep visual status as primary fallback when autoplay is blocked.
            });
          }
        } catch {
          // Graceful no-op for unsupported/restricted environments.
        }
      }

      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(READY_VIBRATION_PATTERN);
        }
      } catch {
        // Graceful no-op for unsupported environments.
      }

      try {
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const orderNumber = customerOrder?.orderNumber;
          new Notification("ההזמנה מוכנה! 🍔", {
            body: orderNumber
              ? `הזמנה #${orderNumber} מוכנה לאיסוף`
              : "ההזמנה מוכנה לאיסוף",
            icon: "/logo.png",
            tag: `order-ready-${currentOrderId}`,
          });
        }
      } catch {
        // Graceful no-op when notifications are unavailable/blocked.
      }

      try {
        await updateDoc(doc(db, "orders", currentOrderId), {
          notifiedReady: true,
        });
      } finally {
        notifyingReadyOrderIdsRef.current.delete(currentOrderId);
      }
    };

    notifyAndPersist().catch(() => {
      notifyingReadyOrderIdsRef.current.delete(currentOrderId);
    });
  }, [
    customerOrder?.id,
    customerOrder?.status,
    customerOrder?.notifiedReady,
    customerOrder?.orderNumber,
  ]);

  useEffect(() => {
    if (customerOrder?.status !== "ready") return;
    setShowReadyModal(false);
  }, [customerOrder?.id, customerOrder?.status]);

  const previousReviewOrderIdRef = useRef(customerOrder?.id || null);
  useEffect(() => {
    const currentOrderId = customerOrder?.id || null;
    const isGenuinelyNewOrder =
      previousReviewOrderIdRef.current !== null &&
      previousReviewOrderIdRef.current !== currentOrderId;
    previousReviewOrderIdRef.current = currentOrderId;

    setReviewRating(0);
    setReviewComment("");
    setReviewError("");
    setReviewSubmitted(false);
    setShowReviewModal(false);
    setShowOrderStatusModal(false);

    // Only clear the persisted "dismissed" flags when the customer actually
    // moves on to a different order. Do NOT clear them just because this
    // component remounted (e.g. switching tabs and back) - otherwise the
    // review/status popups would reappear every time the customer tab is
    // reopened.
    if (isGenuinelyNewOrder) {
      setReviewModalDismissedOrderId(null);
      setDismissedStatusKey("");
    }
  }, [customerOrder?.id]);

  useEffect(() => {
    const currentOrderId = customerOrder?.id || null;
    if (!currentOrderId) {
      setShowReviewModal(false);
      return;
    }

    if (customerOrder?.status !== "delivered") {
      setShowReviewModal(false);
      return;
    }

    const existingReviewRating = Number(customerOrder?.review?.rating);
    if (Number.isFinite(existingReviewRating) && existingReviewRating >= 1 && existingReviewRating <= 5) {
      setShowReviewModal(false);
      return;
    }

    if (reviewModalDismissedOrderId === currentOrderId) return;
    setShowReviewModal(true);
  }, [customerOrder?.id, customerOrder?.status, customerOrder?.review?.rating, reviewModalDismissedOrderId]);

  useEffect(() => {
    if (!customerStatusModalKey) {
      setShowOrderStatusModal(false);
      return;
    }
    if (!["new", "paid", "in_progress"].includes(customerOrder?.status)) {
      setShowOrderStatusModal(false);
      return;
    }
    if (dismissedStatusKey === customerStatusModalKey) return;
    setShowOrderStatusModal(true);
  }, [customerOrder?.status, customerStatusModalKey, dismissedStatusKey]);

  const handleSubmitOrder = async () => {
    if (isSubmittingOrder) return;

    const hasSoldOutItem = cart.some(
      (c) =>
        soldOut[menuStockKey(c.id)] ||
        (c.drinkType && soldOut[drinkStockKey(c.drinkType)]) ||
        c.familyMeals?.some((meal) => soldOut[drinkStockKey(meal.drinkKey)])
    );
    if (hasSoldOutItem) {
      setSubmitOrderError("חלק מהפריטים בעגלה חסרים במלאי. הסירו אותם ונסו שוב.");
      return;
    }

    try {
      setIsSubmittingOrder(true);
      setSubmitOrderError("");
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        Notification.requestPermission().catch(() => {});
      }
      await onSendOrder({
        requestedPayment,
        deliveryTime,
        deliveryAddress,
        deliveryCity,
        deliveryPhone,
        pickupTime:
          orderType === "pickup"
            ? pickupTime && pickupTime >= earliestPickupTime
              ? pickupTime
              : earliestPickupTime
            : null,
      });
      setPanelTab("order");
      setIsMobilePanelOpen(false);
    } catch (error) {
      console.error("Order submission failed:", error);
      setSubmitOrderError("שליחת ההזמנה נכשלה. נסה שוב.");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  async function handleSubmitReview() {
    const orderId = customerOrder?.id;
    if (!orderId || isSubmittingReview || reviewSubmitted) return;

    const safeRating = Number(reviewRating);
    if (!Number.isFinite(safeRating) || safeRating < 1 || safeRating > 5) {
      setReviewError("יש לבחור דירוג בין 1 ל-5 כוכבים");
      return;
    }

    try {
      setIsSubmittingReview(true);
      setReviewError("");
      const itemIds = Array.isArray(customerOrder?.items)
        ? [...new Set(customerOrder.items.map((item) => Number(item?.id)).filter((id) => Number.isFinite(id)))]
        : [];

      await onSubmitReview(orderId, {
        rating: safeRating,
        comment: reviewComment.slice(0, 200),
        itemIds,
      });
      setReviewSubmitted(true);
    } catch (error) {
      console.error("Review submission failed:", error);
      setReviewError("שליחת הדירוג נכשלה. נסה שוב.");
    } finally {
      setIsSubmittingReview(false);
    }
  }

  function toggleFamilyMealMod(mealIndex, modKey) {
    setFamilyMealConfigs((prev) =>
      prev.map((meal, idx) => {
        if (idx !== mealIndex) return meal;
        const nextMods = meal.mods.includes(modKey)
          ? meal.mods.filter((key) => key !== modKey)
          : [...meal.mods, modKey];
        return { ...meal, mods: nextMods };
      })
    );
  }

  function selectFamilyMealDrink(mealIndex, drinkKey) {
    if (soldOut[drinkStockKey(drinkKey)]) return;
    setFamilyMealConfigs((prev) =>
      prev.map((meal, idx) => (idx === mealIndex ? { ...meal, drinkKey } : meal))
    );
  }

  function closeFamilyConfig() {
    setShowFamilyConfig(false);
    setFamilyConfigError("");
    setFamilyDealItem(null);
    setFamilyMealConfigs(createInitialFamilyMealsConfig());
  }

  function confirmFamilyConfig() {
    if (!familyDealItem) return;

    const allDrinksSelected = familyMealConfigs.every((meal) => Boolean(meal.drinkKey));
    if (!allDrinksSelected) {
      setFamilyConfigError("יש לבחור שתיה לכל 4 המנות");
      return;
    }

    const configuredMeals = familyMealConfigs.map((meal, idx) => {
      const drink = MEAL_DRINK_OPTIONS.find((d) => d.key === meal.drinkKey);
      return {
        mealNumber: idx + 1,
        mods: [...meal.mods],
        drinkKey: meal.drinkKey,
        drinkLabel: drink?.label || "",
      };
    });

    const signature = configuredMeals
      .map(
        (meal) =>
          `${meal.drinkKey || "-"}:${[...meal.mods].sort().join(".")}`
      )
      .join("|");

    setCart([
      ...cart,
      {
        ...familyDealItem,
        price:
          familyDealItem.price +
          configuredMeals.reduce((sum, meal) => sum + mealDrinkSurcharge(meal.drinkKey), 0),
        allowsToppings: false,
        mods: [`family:${signature}`],
        familyMeals: configuredMeals,
      },
    ]);

    closeFamilyConfig();
  }

  const closeItemSheet = () => {
    setSheetItem(null);
    setSheetMods([]);
    setSheetDrink(null);
  };

  const openMenuItem = (item) => {
    if (soldOut[menuStockKey(item.id)]) return;

    if (isFamilyDealItem(item)) {
      setFamilyDealItem(item);
      setFamilyMealConfigs(createInitialFamilyMealsConfig());
      setFamilyConfigError("");
      setActiveFamilyMeal(0);
      setShowFamilyConfig(true);
      return;
    }

    if (item.allowsToppings || itemHasDrinkChoice(item)) {
      setSheetItem(item);
      setSheetMods([]);
      setSheetDrink(null);
      return;
    }

    setCart([...cart, { ...item, name: getDisplayItemName(item.name), mods: [] }]);
  };

  const toggleSheetMod = (modKey) => {
    setSheetMods((prev) =>
      prev.includes(modKey) ? prev.filter((key) => key !== modKey) : [...prev, modKey]
    );
  };

  const sheetNeedsDrink = !!sheetItem && itemHasDrinkChoice(sheetItem);

  const confirmItemSheet = () => {
    if (!sheetItem) return;
    const mods = sheetItem.allowsToppings ? [...sheetMods] : [];

    if (sheetNeedsDrink) {
      const drink = MEAL_DRINK_OPTIONS.find((d) => d.key === sheetDrink);
      if (!drink || soldOut[drinkStockKey(drink.key)]) return;
      setCart([
        ...cart,
        {
          ...sheetItem,
          price: sheetItem.price + mealDrinkSurcharge(drink.key),
          name: replaceDrinkInName(getDisplayItemName(sheetItem.name), drink.label),
          drinkType: drink.key,
          mods,
        },
      ]);
    } else {
      setCart([...cart, { ...sheetItem, name: getDisplayItemName(sheetItem.name), mods }]);
    }
    closeItemSheet();
  };

  const addDrinkToCart = (item, drink) => {
    if (soldOut[menuStockKey(item.id)] || soldOut[drinkStockKey(drink.key)]) return;
    setCart([
      ...cart,
      {
        ...item,
        name: drink.label,
        drinkType: drink.key,
        imageSrc: drink.imageSrc,
        allowsToppings: false,
      },
    ]);
  };

  const isCartItemSoldOut = (item) =>
    soldOut[menuStockKey(item.id)] === true ||
    (item.drinkType && soldOut[drinkStockKey(item.drinkType)] === true) ||
    item.familyMeals?.some((meal) => soldOut[drinkStockKey(meal.drinkKey)] === true) ||
    false;

  const addOneOfGroup = (groupKey) => {
    const idx = cart.map(cartGroupKey).lastIndexOf(groupKey);
    if (idx < 0) return;
    setCart([...cart, { ...cart[idx] }]);
  };

  const removeOneOfGroup = (groupKey) => {
    const idx = cart.map(cartGroupKey).lastIndexOf(groupKey);
    if (idx < 0) return;
    const next = [...cart];
    next.splice(idx, 1);
    setCart(next);
  };

  const chooseFamilyDrink = (drinkKey) => {
    if (soldOut[drinkStockKey(drinkKey)]) return;
    selectFamilyMealDrink(activeFamilyMeal, drinkKey);
    const nextEmpty = familyMealConfigs.findIndex(
      (meal, idx) => idx > activeFamilyMeal && !meal.drinkKey
    );
    if (nextEmpty !== -1) setActiveFamilyMeal(nextEmpty);
  };

  const handleConfirmFamily = () => {
    const firstMissing = familyMealConfigs.findIndex((meal) => !meal.drinkKey);
    if (firstMissing !== -1) setActiveFamilyMeal(firstMissing);
    confirmFamilyConfig();
  };

  const clearCart = () => {
    setCart([]);
  };

  const handleNameSubmit = () => {
    if (!customerName.trim()) return;
    setCustomerConfirmed(true);
  };

  const openReviewsForItem = (item) => {
    setSelectedReviewsItem(item);
  };

  const kioskTiles =
    activeCategory === "drinks"
      ? menu.filter(isStandaloneDrinkItem).flatMap((item) =>
          getDrinkOptionsForItem(item).map((drink) => ({
            key: `${item.id}-${drink.key}`,
            item,
            drink,
            title: drink.label,
            sub: isExtraDrinkItem(item) ? "בקבוק קטן" : "פחית",
            price: item.price,
            imageSrc: drink.imageSrc,
            contain: true,
            soldOut:
              soldOut[menuStockKey(item.id)] === true || soldOut[drinkStockKey(drink.key)] === true,
            qty: cart.filter((c) => c.id === item.id && c.drinkType === drink.key).length,
          }))
        )
      : menu
          .filter((item) => kioskCategoryOf(item) === activeCategory)
          .map((item) => ({
            key: String(item.id),
            item,
            ...splitKioskTitle(item.name),
            price: item.price,
            imageSrc: menuItemImage(item.id),
            contain: false,
            soldOut: soldOut[menuStockKey(item.id)] === true,
            qty: cart.filter((c) => c.id === item.id).length,
            ratingStats: menuRatingsByItemId[item.id] || null,
            badge: isFamilyDealItem(item) ? "מבצע" : "",
          }));

  const effectivePickupTime =
    pickupTime && pickupTime >= earliestPickupTime ? pickupTime : earliestPickupTime;
  const paymentLabels = { cash: "מזומן", bit: "ביט", paybox: "PayBox" };
  const panelTabs = [
    { key: "order", label: "1. ההזמנה", hint: `${cart.length} פריטים` },
    {
      key: "delivery",
      label: "2. איסוף/משלוח",
      hint: orderType === "pickup" ? `איסוף ${effectivePickupTime}` : deliveryCity || "משלוח",
    },
    { key: "pay", label: "3. תשלום", hint: paymentLabels[requestedPayment] || "לא נבחר" },
  ];
  const canSubmitOrder = cart.length > 0 && deliveryDetailsComplete && !isSubmittingOrder;

  const itemSheetModal = sheetItem ? (
    <KioskSheet isMobile={isMobile} onClose={closeItemSheet}>
      <KioskSheetHeader
        imageSrc={menuItemImage(sheetItem.id)}
        title={getDisplayItemName(sheetItem.name)}
        subtitle={`₪${sheetItem.price}`}
        onClose={closeItemSheet}
      />

      {sheetItem.allowsToppings && (
        <>
          <div style={kioskSheetTitleStyle}>תוספות (לחיצה מוסיפה תוספת)</div>
          <div style={kioskChoiceGridStyle}>
            {ALL_TOPPINGS.map((ing) => (
              <KioskChoice
                key={`sheet-${ing.key}`}
                imageSrc={ing.imageSrc}
                label={ing.label}
                active={sheetMods.includes(ing.key)}
                onClick={() => toggleSheetMod(ing.key)}
              />
            ))}
          </div>
        </>
      )}

      {sheetNeedsDrink && (
        <>
          <div style={kioskSheetTitleStyle}>שתיה לארוחה</div>
          <div style={kioskChoiceGridStyle}>
            {MEAL_DRINK_OPTIONS.map((drink) => {
              const drinkSoldOut = soldOut[drinkStockKey(drink.key)] === true;
              return (
                <KioskChoice
                  key={`sheet-drink-${drink.key}`}
                  imageSrc={drink.imageSrc}
                  label={mealDrinkChoiceLabel(drink, drinkSoldOut)}
                  active={sheetDrink === drink.key}
                  disabled={drinkSoldOut}
                  onClick={() => setSheetDrink(drink.key)}
                />
              );
            })}
          </div>
        </>
      )}

      <div style={kioskSummaryLineStyle}>
        {kioskMealSummary(
          sheetMods,
          sheetNeedsDrink ? MEAL_DRINK_OPTIONS.find((d) => d.key === sheetDrink)?.label || "בחרו שתיה" : null
        )}
      </div>

      <button
        type="button"
        disabled={sheetNeedsDrink && !sheetDrink}
        onClick={confirmItemSheet}
        style={kioskCtaStyle(!(sheetNeedsDrink && !sheetDrink))}
      >
        {sheetNeedsDrink && !sheetDrink ? "בחרו שתיה כדי להוסיף" : `הוספה להזמנה · ₪${sheetItem.price + mealDrinkSurcharge(sheetDrink)}`}
      </button>
    </KioskSheet>
  ) : null;

  return (
    <div
      style={{
        ...screenCardStyle(),
        maxWidth: customerConfirmed ? 1280 : 980,
        backgroundImage:
          "linear-gradient(rgba(245,252,250,0.88), rgba(255,255,255,0.92)), url('https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: isMobile ? "scroll" : "fixed",
        minHeight: customerConfirmed ? undefined : isDesktop ? "calc(100vh - 120px)" : "100svh",
        padding: isMobile
          ? customerConfirmed
            ? "6px"
            : "12px 10px 14px"
          : customerConfirmed
            ? "10px"
            : "8px 16px 12px",
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      <style>{`
        .customer-name-input {
          color: #0f172a;
          caret-color: #0f172a;
        }
        .customer-name-input::placeholder {
          color: #64748b;
          opacity: 1;
        }
      `}</style>
      {!customerConfirmed ? (
        <div style={{
          minHeight: isDesktop ? "calc(100vh - 60px)" : "calc(100svh - 20px)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          borderRadius: 24,
        }}>
          {/* hero background */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "url('https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=1600&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center 40%",
            filter: "brightness(0.38)",
            zIndex: 0,
          }} />

          {/* gradient overlay bottom */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 100%)",
            zIndex: 1,
          }} />

          {/* content */}
          <div style={{
            position: "relative", zIndex: 2,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? "24px 16px 20px" : "32px 24px 28px",
            gap: isMobile ? 20 : 24,
          }}>

            {/* logo + title */}
            <div style={{ textAlign: "center" }}>
              <img src="/logo.png" alt="הנחשוניה" style={{
                height: isMobile ? 90 : 120,
                width: "auto",
                objectFit: "contain",
                marginBottom: 12,
                filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))",
              }} />
            </div>

            {/* name input card */}
            <div style={{
              background: "rgba(255,255,255,0.97)",
              borderRadius: 12,
              padding: "6px 10px",
              width: "100%",
              maxWidth: isMobile ? 200 : 215,
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              display: "grid",
              gap: 6,
            }}>
              <label style={{
                display: "block",
                fontWeight: 800,
                color: "#111827",
                fontSize: 15,
                textAlign: "center",
              }}>מה שמך?</label>

              <input
                className="customer-name-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleNameSubmit(); }}
                placeholder="למשל: חיים לוי"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: "1.5px solid #e5e7eb",
                  boxSizing: "border-box",
                  fontSize: 16,
                  background: "#f9fafb",
                  color: "#0f172a",
                  textAlign: "center",
                }}
              />

              {customerName.trim() && (
                <div style={{
                  color: "#6b7280", fontSize: 13,
                  background: "#f8fafc", borderRadius: 10,
                  padding: "8px 12px", textAlign: "center",
                }}>
                  יוצג על ההזמנה: <strong style={{ color: "#111827" }}>{displayCustomerName}</strong>
                </div>
              )}

              <button
                disabled={!customerName.trim()}
                onClick={handleNameSubmit}
                style={{
                  width: "100%",
                  padding: "15px",
                  borderRadius: 14,
                  border: "none",
                  background: customerName.trim()
                    ? "linear-gradient(135deg, #111827 0%, #f59e0b 100%)"
                    : "#d1d5db",
                  color: "white",
                  cursor: customerName.trim() ? "pointer" : "not-allowed",
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  boxShadow: customerName.trim() ? "0 8px 24px rgba(245,158,11,0.35)" : "none",
                  transition: "all 0.2s",
                }}
              >
                {customerName.trim() ? "▶ לתפריט" : "הכנס שם להמשך"}
              </button>
            </div>

            {/* certifications strip */}
            {(() => {
              const certs = [
                { src: "/KosherM.png", alt: "Kosher M", h: isMobile ? 64 : 80 },
                { src: "/KosherH.jpg", alt: "Kosher H", h: isMobile ? 64 : 80 },
                { src: "/Rav.png", alt: "Rav", h: isMobile ? 80 : 100 },
              ];
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap" }}>
                  {certs.map((c) => (
                    <img
                      key={c.src}
                      src={c.src}
                      alt={c.alt}
                      onClick={() => setCertLightbox(c.src)}
                      style={{
                        height: c.h,
                        width: "auto",
                        objectFit: "contain",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.92)",
                        padding: 4,
                        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                        cursor: "pointer",
                        transition: "transform 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = "scale(1.07)"}
                      onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                    />
                  ))}
                </div>
              );
            })()}

          </div>
        </div>
      ) : (
        <>
          <div
            ref={kioskRef}
            style={{
              height: kioskHeight || (isMobile ? "calc(100svh - 190px)" : "calc(100vh - 150px)"),
              display: "grid",
              gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 380px",
              gridTemplateRows: "minmax(0, 1fr)",
              background: KIOSK.bg,
              borderRadius: isMobile ? 18 : 22,
              overflow: "hidden",
              border: `1px solid ${KIOSK.line}`,
              color: KIOSK.ink,
              direction: "rtl",
              textAlign: "right",
            }}
          >
            {(!isMobile || !isMobilePanelOpen) && (
              <section style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: isMobile ? "10px 12px 4px" : "12px 16px 6px",
                  }}
                >
                  <img
                    src="/logo.png"
                    alt="הנחשוניה"
                    style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: isMobile ? 16 : 19 }}>
                      🍔 הזמנה עצמית
                    </div>
                    <div style={{ color: KIOSK.muted, fontSize: 12.5, fontWeight: 700 }}>
                      {isMobile ? "בחרו מנות, ואז המשיכו להזמנה בכפתור למטה" : "בחרו מנות, ואז השלימו את ההזמנה בצד"}
                    </div>
                  </div>
                </div>

                <div
                  role="tablist"
                  style={{
                    display: "flex",
                    gap: isMobile ? 6 : 8,
                    padding: isMobile ? "6px 10px 10px" : "6px 16px 12px",
                    borderBottom: `1px solid ${KIOSK.line}`,
                    overflowX: "auto",
                  }}
                >
                  {KIOSK_CATEGORIES.map((category) => {
                    const active = activeCategory === category.key;
                    return (
                      <button
                        key={category.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveCategory(category.key)}
                        style={{
                          padding: isMobile ? "9px 12px" : "10px 16px",
                          borderRadius: 999,
                          border: `2px solid ${active ? KIOSK.ink : KIOSK.line}`,
                          background: active ? KIOSK.ink : "white",
                          color: active ? "white" : KIOSK.ink,
                          fontWeight: 900,
                          fontSize: isMobile ? 14 : 15,
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {category.icon} {category.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 10 : 16 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 165}px, 1fr))`,
                      gap: isMobile ? 10 : 12,
                    }}
                  >
                    {kioskTiles.map((tile) => (
                      <KioskTile
                        key={tile.key}
                        tile={tile}
                        isMobile={isMobile}
                        onSelect={() =>
                          tile.drink ? addDrinkToCart(tile.item, tile.drink) : openMenuItem(tile.item)
                        }
                        onOpenReviews={() => openReviewsForItem(tile.item)}
                      />
                    ))}
                  </div>
                </div>

                {isMobile && (
                  <button
                    type="button"
                    disabled={cart.length === 0}
                    onClick={() => setIsMobilePanelOpen(true)}
                    style={{
                      margin: "8px 10px 10px",
                      padding: "14px 18px",
                      borderRadius: 16,
                      border: "none",
                      background: KIOSK.accent,
                      color: "white",
                      fontWeight: 900,
                      fontSize: 17,
                      fontFamily: "inherit",
                      display: "flex",
                      justifyContent: "space-between",
                      cursor: cart.length ? "pointer" : "not-allowed",
                      opacity: cart.length ? 1 : 0.45,
                    }}
                  >
                    <span>🛒 ההזמנה שלי ({cart.length})</span>
                    <span>₪{orderTotal} ←</span>
                  </button>
                )}
              </section>
            )}

            {(!isMobile || isMobilePanelOpen) && (
              <aside
                style={{
                  background: "white",
                  borderRight: isMobile ? "none" : `1px solid ${KIOSK.line}`,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setIsMobilePanelOpen(false)}
                    style={{
                      padding: "12px 14px",
                      border: "none",
                      borderBottom: `1px solid ${KIOSK.line}`,
                      background: "white",
                      color: KIOSK.accent,
                      fontWeight: 900,
                      fontSize: 15,
                      fontFamily: "inherit",
                      textAlign: "right",
                      cursor: "pointer",
                    }}
                  >
                    → חזרה לתפריט
                  </button>
                )}

                <div
                  role="tablist"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    borderBottom: `1px solid ${KIOSK.line}`,
                  }}
                >
                  {panelTabs.map((tab) => {
                    const active = panelTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setPanelTab(tab.key)}
                        style={{
                          padding: "12px 4px",
                          border: "none",
                          borderBottom: `3px solid ${active ? KIOSK.accent : "transparent"}`,
                          background: "white",
                          color: active ? KIOSK.accent : KIOSK.muted,
                          fontWeight: 900,
                          fontSize: 14,
                          fontFamily: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        {tab.label}
                        <span style={{ display: "block", fontSize: 11, fontWeight: 700 }}>{tab.hint}</span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px" }}>
                  {panelTab === "order" &&
                    (grouped.length === 0 ? (
                      <div style={{ color: KIOSK.muted, textAlign: "center", padding: 14, fontWeight: 700 }}>
                        ההזמנה ריקה. בחרו מנה מהתפריט כדי להתחיל
                      </div>
                    ) : (
                      <>
                        {grouped.map(([key, item]) => {
                          const lineSoldOut = isCartItemSoldOut(item);
                          return (
                            <div
                              key={key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "8px 0",
                                borderBottom: `1px solid ${KIOSK.line}`,
                              }}
                            >
                              <img
                                src={item.imageSrc || menuItemImage(item.id)}
                                alt=""
                                style={{
                                  width: 52,
                                  height: 40,
                                  objectFit: item.imageSrc ? "contain" : "cover",
                                  borderRadius: 8,
                                  flexShrink: 0,
                                  background: KIOSK.imgBg,
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{item.name}</div>
                                {item.allowsToppings && (
                                  <div style={{ fontSize: 12.5, color: KIOSK.muted }}>
                                    {kioskMealSummary(item.mods, null)}
                                  </div>
                                )}
                                {Array.isArray(item.familyMeals) &&
                                  item.familyMeals.map((meal) => (
                                    <div key={`${key}-meal-${meal.mealNumber}`} style={{ fontSize: 12.5, color: KIOSK.muted }}>
                                      <b>מנה {meal.mealNumber}:</b> {kioskMealSummary(meal.mods, meal.drinkLabel || "לא נבחרה")}
                                    </div>
                                  ))}
                                {lineSoldOut && (
                                  <div style={{ fontSize: 12.5, color: "#b91c1c", fontWeight: 800 }}>
                                    חסר במלאי, יש להסיר
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "grid", justifyItems: "center", gap: 4, flexShrink: 0 }}>
                                <div style={{ fontWeight: 900 }}>₪{item.qty * item.price}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <button
                                    type="button"
                                    aria-label={`הסר אחד: ${item.name}`}
                                    onClick={() => removeOneOfGroup(key)}
                                    style={kioskCloseButtonStyle}
                                  >
                                    −
                                  </button>
                                  <span style={{ fontWeight: 900, minWidth: 14, textAlign: "center" }}>{item.qty}</span>
                                  <button
                                    type="button"
                                    aria-label={`הוסף עוד: ${item.name}`}
                                    disabled={lineSoldOut}
                                    onClick={() => addOneOfGroup(key)}
                                    style={{ ...kioskCloseButtonStyle, opacity: lineSoldOut ? 0.4 : 1 }}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={clearCart}
                          style={{
                            marginTop: 10,
                            border: "none",
                            background: "none",
                            color: KIOSK.muted,
                            fontWeight: 800,
                            fontFamily: "inherit",
                            cursor: "pointer",
                          }}
                        >
                          🗑 לנקות הכל
                        </button>
                      </>
                    ))}

                  {panelTab === "delivery" && (
                    <>
                      <label style={{ display: "block", marginBottom: 12 }}>
                        <div style={deliveryLabelStyle}>
                          👤 שם המזמין <span style={{ color: "#dc2626" }}>*</span>
                        </div>
                        <input
                          type="text"
                          placeholder="השם שיופיע על ההזמנה"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "12px 14px",
                            borderRadius: 14,
                            border: `2px solid ${customerName.trim() ? KIOSK.line : KIOSK.accent}`,
                            fontSize: 16,
                            fontWeight: 700,
                            fontFamily: "inherit",
                            direction: "rtl",
                            color: "#0f172a",
                          }}
                        />
                      </label>
                <div
                  style={{
                    marginBottom: 4,
                    border: `2px solid ${orderType === "delivery" ? "#f59e0b" : THEME.border}`,
                    borderRadius: 18,
                    overflow: "hidden",
                  }}
                >
                  {/* Radio בחירה */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                    {[
                      { value: "pickup", label: "🏪 איסוף עצמי" },
                      { value: "delivery", label: "🛵 משלוח" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => {
                          setOrderType(value);
                          if (value === "pickup") {
                            setDeliveryTime(null);
                            setDeliveryAddress("");
                            setDeliveryCity("");
                            setDeliveryPhone("");
                            setPickupTime((prev) => prev || DEFAULT_PICKUP_TIME);
                          } else {
                            setPickupTime(null);
                          }
                        }}
                        style={{
                          padding: "16px 0",
                          border: "none",
                          borderBottom: orderType === value ? `3px solid ${value === "delivery" ? "#f59e0b" : THEME.accent}` : "3px solid transparent",
                          background: orderType === value
                            ? value === "delivery" ? "#fef3c7" : "#f0fdf4"
                            : "#f8fafc",
                          color: orderType === value
                            ? value === "delivery" ? "#92400e" : THEME.accent
                            : THEME.textMuted,
                          fontWeight: 900,
                          fontSize: 18,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* שעת איסוף — מוצג רק כשנבחר איסוף עצמי */}
                  {orderType === "pickup" && (
                    <div style={{ padding: "14px 16px", background: "#f0fdf4", textAlign: "center" }}>
                      <div style={{ fontWeight: 800, color: THEME.accentDeep, fontSize: 14, marginBottom: 10 }}>
                        באיזו שעה תרצה לאסוף? ({earliestPickupTime}–{PICKUP_TIME_MAX})
                      </div>
                      <TimeWheelPicker
                        value={pickupTime || DEFAULT_PICKUP_TIME}
                        onChange={setPickupTime}
                        minTime={earliestPickupTime}
                        maxTime={PICKUP_TIME_MAX}
                        stepMinutes={15}
                      />
                    </div>
                  )}

                  {/* פרטי משלוח — מוצג רק כשנבחר משלוח */}
                  {orderType === "delivery" && (
                    <div style={{ padding: "16px", background: "#fffbeb", display: "grid", gap: 16 }}>
                      <div>
                        <div style={deliveryLabelStyle}>
                          🕐 בחרו שעת משלוח <span style={{ color: "#dc2626" }}>*</span>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: 8,
                          }}
                        >
                          {["19:00", "20:00", "21:00"].map((time) => (
                            <button
                              key={time}
                              type="button"
                              aria-pressed={deliveryTime === time}
                              onClick={() => setDeliveryTime(deliveryTime === time ? null : time)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                padding: "12px 4px",
                                borderRadius: 14,
                                border: `2px solid ${(deliveryTime === time) ? "#d97706" : "#f59e0b"}`,
                                background: (deliveryTime === time) ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : "white",
                                color: (deliveryTime === time) ? "white" : "#92400e",
                                fontWeight: 800,
                                fontSize: 16,
                                fontFamily: "inherit",
                                cursor: "pointer",
                                transition: "all 0.15s",
                                boxShadow: (deliveryTime === time) ? "0 4px 12px rgba(245,158,11,0.35)" : "0 2px 6px rgba(146,64,14,0.12)",
                              }}
                            >
                              <span>{deliveryTime === time ? "✓" : "○"}</span>
                              <span>{time}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div style={deliveryLabelStyle}>
                          📍 בחרו יישוב <span style={{ color: "#dc2626" }}>*</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                          {Object.entries(DELIVERY_FEES_BY_CITY).map(([city, fee]) => (
                            <button
                              key={city}
                              type="button"
                              aria-pressed={deliveryCity === city}
                              onClick={() => setDeliveryCity(city)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "12px 4px",
                                borderRadius: 14,
                                border: `2px solid ${(deliveryCity === city) ? "#d97706" : "#f59e0b"}`,
                                background: (deliveryCity === city) ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : "white",
                                color: (deliveryCity === city) ? "white" : "#92400e",
                                fontWeight: 800,
                                fontFamily: "inherit",
                                cursor: "pointer",
                                transition: "all 0.15s",
                                boxShadow: (deliveryCity === city) ? "0 4px 12px rgba(245,158,11,0.35)" : "0 2px 6px rgba(146,64,14,0.12)",
                                flexDirection: "column",
                                gap: 2,
                                fontSize: 14,
                              }}
                            >
                              <span>
                                {deliveryCity === city ? "✓ " : "○ "}
                                {city}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>
                                משלוח ₪{fee}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <label style={{ display: "block" }}>
                        <div style={deliveryLabelStyle}>
                          🏠 כתובת למשלוח <span style={{ color: "#dc2626" }}>*</span>
                        </div>
                        <input
                          type="text"
                          placeholder="רחוב ומספר בית"
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "14px 16px",
                            borderRadius: 14,
                            border: `2px solid ${deliveryAddress.trim() ? "#d97706" : "#f59e0b"}`,
                            fontSize: 16,
                            fontWeight: 700,
                            fontFamily: "inherit",
                            outline: "none",
                            direction: "rtl",
                            background: "white",
                            color: "#0f172a",
                            boxShadow: deliveryAddress.trim() ? "none" : "0 0 0 4px rgba(245,158,11,0.18)",
                          }}
                        />
                      </label>

                      <label style={{ display: "block" }}>
                        <div style={deliveryLabelStyle}>
                          📞 טלפון ליצירת קשר <span style={{ color: "#dc2626" }}>*</span>
                        </div>
                        <input
                          type="tel"
                          inputMode="tel"
                          placeholder="לדוגמה 050-1234567"
                          value={deliveryPhone}
                          onChange={(e) => setDeliveryPhone(e.target.value)}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "14px 16px",
                            borderRadius: 14,
                            border: `2px solid ${deliveryPhone.trim() ? "#d97706" : "#f59e0b"}`,
                            fontSize: 16,
                            fontWeight: 700,
                            fontFamily: "inherit",
                            outline: "none",
                            direction: "rtl",
                            background: "white",
                            color: "#0f172a",
                            boxShadow: deliveryPhone.trim() ? "none" : "0 0 0 4px rgba(245,158,11,0.18)",
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
                      <div style={{ fontSize: 12.5, color: KIOSK.muted, marginTop: 10, fontWeight: 600 }}>
                        🔒 השם, הטלפון והכתובת משמשים רק לטיפול בהזמנה.{" "}
                        <button
                          type="button"
                          onClick={onOpenPrivacy}
                          style={{ border: "none", background: "none", padding: 0, color: KIOSK.accentInk, fontWeight: 800, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}
                        >
                          מדיניות פרטיות
                        </button>
                      </div>
                    </>
                  )}

                  {panelTab === "pay" && (
                    <>
                      <div style={{ marginBottom: 8, fontWeight: 900, fontSize: 15 }}>
                        מהו אופן התשלום המבוקש?
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                        <PaymentChoiceButton
                          label="מזומן"
                          theme="dark"
                          active={requestedPayment === "cash"}
                          onClick={() => setRequestedPayment("cash")}
                        />
                        <PaymentChoiceButton
                          label="BIT"
                          theme="bit"
                          active={requestedPayment === "bit"}
                          onClick={() => setRequestedPayment("bit")}
                        />
                        <PaymentChoiceButton
                          label="PayBox"
                          theme="paybox"
                          active={requestedPayment === "paybox"}
                          onClick={() => setRequestedPayment("paybox")}
                        />
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          padding: 14,
                          borderRadius: 16,
                          background: KIOSK.soft,
                          textAlign: "center",
                          fontWeight: 700,
                        }}
                      >
                        {requestedPayment === "cash" ? (
                          <div>💵 משלמים במזומן בעת {orderType === "delivery" ? "המסירה" : "האיסוף"}</div>
                        ) : (
                          <>
                            <img
                              src={requestedPayment === "bit" ? "/Bit QR Code.jpeg" : "/PayBoox QR Code.jpeg"}
                              alt={requestedPayment === "bit" ? "BIT QR Code" : "PayBox QR Code"}
                              style={{
                                width: isMobile ? 190 : 200,
                                maxWidth: "100%",
                                borderRadius: 12,
                                background: "white",
                                display: "block",
                                margin: "0 auto 8px",
                              }}
                            />
                            <a
                              href={PAYMENT_LINKS[requestedPayment].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "inline-block",
                                marginBottom: 8,
                                color: requestedPayment === "bit" ? "#0f766e" : "#1d4ed8",
                                fontWeight: 900,
                                textDecoration: "underline",
                              }}
                            >
                              {PAYMENT_LINKS[requestedPayment].label}
                            </a>
                            <div>
                              סרקו ושלמו <b>₪{orderTotal}</b> ב{paymentLabels[requestedPayment]}, ואז לחצו "שליחת הזמנה"
                            </div>
                          </>
                        )}
                      </div>

                      {!deliveryDetailsComplete && (
                        <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 800, textAlign: "center" }}>
                          חסרים פרטים (שם או פרטי משלוח). השלימו אותם בטאב "איסוף/משלוח".
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div style={{ padding: "12px 14px", borderTop: `1px solid ${KIOSK.line}`, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span>סכום ביניים</span>
                    <span>₪{total}</span>
                  </div>
                  {orderType === "delivery" && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                      <span>🛵 דמי משלוח{deliveryCity ? ` (${deliveryCity})` : ""}</span>
                      <span>{deliveryCity ? `₪${deliveryFee}` : "בחרו יישוב"}</span>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontWeight: 900,
                      fontSize: 20,
                      paddingTop: 6,
                      borderTop: `2px dashed ${KIOSK.line}`,
                    }}
                  >
                    <span>סה"כ לתשלום</span>
                    <span>₪{orderTotal}</span>
                  </div>

                  {panelTab === "order" && (
                    <button
                      type="button"
                      disabled={cart.length === 0}
                      onClick={() => setPanelTab("delivery")}
                      style={kioskCtaStyle(cart.length > 0)}
                    >
                      המשך לאיסוף/משלוח ←
                    </button>
                  )}
                  {panelTab === "delivery" && (
                    <button
                      type="button"
                      disabled={!deliveryDetailsComplete}
                      onClick={() => setPanelTab("pay")}
                      style={kioskCtaStyle(deliveryDetailsComplete)}
                    >
                      המשך לתשלום ←
                    </button>
                  )}
                  {panelTab === "pay" && (
                    <button
                      type="button"
                      disabled={!canSubmitOrder}
                      onClick={handleSubmitOrder}
                      style={kioskCtaStyle(canSubmitOrder)}
                    >
                      {isSubmittingOrder ? "שולח..." : `שליחת הזמנה · ₪${orderTotal}`}
                    </button>
                  )}

                  {submitOrderError && (
                    <div style={{ color: "#b91c1c", fontWeight: 700, textAlign: "center" }}>
                      {submitOrderError}
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>

          {itemSheetModal}

          {familyConfigModal}

          {customerStatusModal}

          {reviewStageModal}

          {reviewsModal}

          {showReadyModal && (
            <div
              onClick={() => setShowReadyModal(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15,23,42,0.45)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: 16,
                paddingTop: isMobile
                  ? "calc(env(safe-area-inset-top, 0px) + 16px)"
                  : 24,
                zIndex: 25,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    maxWidth: 460,
                    background: "white",
                    borderRadius: 22,
                    border: "1px solid #bfdbfe",
                    boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
                    padding: isMobile ? "18px 16px" : "22px 20px",
                    direction: "rtl",
                    textAlign: "right",
                  }}
                >
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: isMobile ? 24 : 28,
                    color: "#1d4ed8",
                    marginBottom: 8,
                  }}
                >
                  🎉 ההזמנה שלך מוכנה!
                </div>
                <div
                  style={{
                    color: "#1f2937",
                    fontWeight: 700,
                    lineHeight: 1.6,
                    marginBottom: 14,
                  }}
                >
                  ניתן לגשת לעמדת החלוקה ולאסוף את ההזמנה
                </div>
                <button
                  onClick={() => setShowReadyModal(false)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 14,
                    border: "1px solid #d1d5db",
                    background: "white",
                    color: "#111827",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  הבנתי
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {certLightbox && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setCertLightbox(null)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.82)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 24, cursor: "zoom-out",
          }}
        >
          <img
            src={certLightbox}
            alt="תעודה"
            style={{
              maxWidth: "90vw", maxHeight: "85vh",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              objectFit: "contain",
              background: "white",
              padding: 8,
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
