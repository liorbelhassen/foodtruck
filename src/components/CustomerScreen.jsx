import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  LogoHeader,
  MenuVisual,
  SectionTitle,
} from "./uiHelpers.jsx";
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
  CARD_BG,
  DRINK_OPTIONS,
  EXTRA_DRINK_OPTIONS,
  THEME,
  baseCenter,
  priceStyle,
  titleStyle,
} from "./customer/customerConstants.js";
import {
  cardStyle,
  getDisplayItemName,
  isStandaloneDrinkItem,
  itemHasDrinkChoice,
  modsKeysToDisplayLabels,
  modsToLabel,
  panelStyle,
  replaceDrinkInName,
} from "./customer/customerHelpers.js";
import { DrinkChip, PaymentChoiceButton, QtyButton, ToppingChip } from "./customer/customerAtoms.jsx";

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

function panelHeader(title, hint, action = null) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 900, color: THEME.text }}>{title}</div>
      {action ||
        (hint ? (
          <div style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 700 }}>
            {hint}
          </div>
        ) : null)}
    </div>
  );
}

function isGuidedComboDrinkItem(item) {
  const label = getDisplayItemName(String(item?.name || ""));
  return label.includes("יאגנוב נקניקיה") || label.includes("יאגנוב המבורגר");
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

function createInitialFamilyMealsConfig() {
  return Array.from({ length: 4 }, () => ({
    mods: [],
    drinkKey: null,
  }));
}

function formatFamilyMealMods(mods) {
  const labels = modsKeysToDisplayLabels(mods);
  if (!labels.length) return "ללא שינויים";
  return labels.join(", ");
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

function MenuItemCard({
  item,
  qty,
  currentMods,
  currentDrink,
  ratingStats,
  onOpenReviews,
  showInlineDrinkPicker,
  drinkPickerRef,
  isMobile,
  onToggleMod,
  onSelectStandaloneDrink,
  onChooseMealDrink,
  onCloseInlineDrinkPicker,
  onAdd,
  onRemove,
}) {
  const standaloneDrink = isStandaloneDrinkItem(item);
  const familyDeal = isFamilyDealItem(item);
  const drinkOptions = getDrinkOptionsForItem(item);

  if (standaloneDrink) {
    return (
      <div
        style={{
          ...cardStyle(),
          padding: isMobile ? 12 : 14,
          display: "grid",
          gap: 10,
          background: CARD_BG,
          border: `1px solid ${THEME.border}`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 118px",
            gap: 12,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: 3 }}>
                <div style={titleStyle}>שתיה</div>
                {ratingStats?.count > 0 && (
                  <div style={{ fontSize: 12, fontWeight: 800, color: THEME.textMuted, display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: "#f59e0b", letterSpacing: 0.5 }}>
                      {starsVisualFromFloat(ratingStats.avg)}
                    </span>
                    <span>{ratingStats.avg.toFixed(1)}</span>
                    <button
                      onClick={() => onOpenReviews(item)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#2563eb",
                        cursor: "pointer",
                        fontWeight: 800,
                        padding: 0,
                        fontSize: 12,
                      }}
                      aria-label={`הצג ביקורות עבור ${getDisplayItemName(item.name)}`}
                    >
                      ({ratingStats.count})
                    </button>
                  </div>
                )}
              </div>
              <div style={priceStyle}>₪{item.price}</div>
            </div>

            <div style={panelStyle()}>
              {panelHeader("בחר שתיה", "")}
              <div
                style={{
                  display: "grid",
                  width: "100%",
                  gridTemplateColumns: "1fr",
                  gap: 6,
                  alignItems: "stretch",
                }}
              >
                {drinkOptions.map((drink) => (
                  <DrinkChip
                    key={`${item.id}-${drink.key}`}
                    imageSrc={drink.imageSrc}
                    label={drink.label}
                    active={currentDrink === drink.key}
                    onClick={() => onSelectStandaloneDrink(item.id, drink.key)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <div
              style={{
                color: THEME.textSoft,
                fontWeight: 800,
                fontSize: 14,
                background: "#ffffff",
                borderRadius: 14,
                padding: "8px 10px",
                border: `1px solid ${THEME.borderSoft}`,
                textAlign: "center",
              }}
            >
              כמות בעגלה: {qty}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: isMobile ? "space-between" : "center",
                gap: 8,
                alignItems: "center",
              }}
            >
              <QtyButton onClick={onAdd} filled>
                +
              </QtyButton>
              <QtyButton onClick={onRemove}>-</QtyButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...cardStyle(),
        padding: isMobile ? 12 : 14,
        display: "grid",
        gap: 10,
        background: CARD_BG,
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "92px minmax(0, 1fr)"
            : "118px minmax(0, 1.15fr) minmax(210px, 0.9fr)",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <div
            style={{
              color: THEME.textSoft,
              fontWeight: 800,
              fontSize: 14,
              background: "#ffffff",
              borderRadius: 14,
              padding: "8px 10px",
              border: `1px solid ${THEME.borderSoft}`,
              textAlign: "center",
            }}
          >
            כמות בעגלה: {qty}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "center",
              gap: 8,
              alignItems: "center",
            }}
          >
            <QtyButton onClick={onAdd} filled>
              +
            </QtyButton>
            <QtyButton onClick={onRemove}>-</QtyButton>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <div style={{ textAlign: "center", display: "grid", gap: 4 }}>
            <div
              style={{
                ...titleStyle,
                fontSize: isMobile ? 19 : 22,
                lineHeight: 1.2,
              }}
            >
              {getDisplayItemName(item.name)}
            </div>
            {ratingStats?.count > 0 && (
              <div style={{ fontSize: 12, fontWeight: 800, color: THEME.textMuted, display: "flex", gap: 4, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#f59e0b", letterSpacing: 0.5 }}>
                  {starsVisualFromFloat(ratingStats.avg)}
                </span>
                <span>{ratingStats.avg.toFixed(1)}</span>
                <button
                  onClick={() => onOpenReviews(item)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#2563eb",
                    cursor: "pointer",
                    fontWeight: 800,
                    padding: 0,
                    fontSize: 12,
                  }}
                  aria-label={`הצג ביקורות עבור ${getDisplayItemName(item.name)}`}
                >
                  ({ratingStats.count})
                </button>
              </div>
            )}
            <div style={{ ...priceStyle, fontSize: isMobile ? 20 : 24 }}>₪{item.price}</div>
          </div>

          <div
            style={{
              borderRadius: 20,
              overflow: "hidden",
              background: "#fff",
              border: `1px solid ${THEME.borderSoft}`,
              minHeight: isMobile ? 150 : 188,
              padding: 0,
              ...baseCenter,
            }}
          >
            <MenuVisual parts={item.parts} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            minWidth: 0,
            gridColumn: isMobile ? "1 / -1" : "auto",
          }}
        >
          {item.allowsToppings && !familyDeal && (
            <div style={{ ...panelStyle(), padding: 8, gap: 6 }}>
              {panelHeader("תוספות", "לחיצה מוסיפה תוספת")}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "start" }}>
                {ALL_TOPPINGS.map((ing) => (
                  <ToppingChip
                    key={`${item.id}-${ing.key}`}
                    imageSrc={ing.imageSrc}
                    label={ing.label}
                    active={currentMods.includes(ing.key)}
                    onClick={() => onToggleMod(item.id, ing.key)}
                  />
                ))}
              </div>
            </div>
          )}

          {showInlineDrinkPicker && !standaloneDrink && (
            <div ref={drinkPickerRef} style={{ ...panelStyle(), padding: 8, gap: 6 }}>
              {panelHeader(
                "בחר שתיה לארוחה",
                "",
                <button
                  onClick={onCloseInlineDrinkPicker}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: THEME.textMuted,
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  סגור
                </button>
              )}
              <div
                style={{
                  display: "grid",
                  width: "100%",
                  gridTemplateColumns: "1fr",
                  gap: 6,
                  alignItems: "stretch",
                }}
              >
                {DRINK_OPTIONS.map((drink) => (
                  <DrinkChip
                    key={`inline-picker-${item.id}-${drink.key}`}
                    imageSrc={drink.imageSrc}
                    label={drink.label}
                    active={false}
                    onClick={() => onChooseMealDrink(item, drink.key)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderSidebar({
  grouped,
  total,
  clearCart,
  setShowConfirm,
  isMobile,
}) {
  return (
    <div
      style={{
        ...cardStyle(),
        padding: 16,
        position: isMobile ? "fixed" : "sticky",
        top: isMobile ? "auto" : 18,
        bottom: isMobile ? 12 : "auto",
        right: isMobile ? 10 : "auto",
        left: isMobile ? 10 : "auto",
        zIndex: isMobile ? 16 : "auto",
        width: isMobile ? "auto" : undefined,
        maxHeight: isMobile ? "min(34vh, 320px)" : undefined,
        display: isMobile ? "flex" : undefined,
        flexDirection: isMobile ? "column" : undefined,
        background:
          "linear-gradient(180deg, rgba(240,253,250,0.96) 0%, rgba(255,255,255,0.98) 100%)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          fontSize: 19,
          marginBottom: 12,
          color: THEME.text,
        }}
      >
        ההזמנה שלך
      </div>

      <div
        style={{
          maxHeight: isMobile ? "calc(34vh - 158px)" : 360,
          overflow: "auto",
          marginBottom: 12,
          paddingLeft: 4,
        }}
      >
        {grouped.length === 0 ? (
          <div style={{ color: THEME.textMuted }}>עדיין לא נבחרו פריטים</div>
        ) : (
          grouped.map(([key, item]) => (
            <div
              key={key}
              style={{
                display: "grid",
                gap: 4,
                marginBottom: 10,
                color: "#1f2937",
                fontSize: 13,
                paddingBottom: 8,
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>
                  {item.qty}x {item.name}
                </span>
                <span style={{ fontWeight: 800 }}>₪{item.qty * item.price}</span>
              </div>
              {item.allowsToppings && (
                <div style={{ color: THEME.textMuted }}>תוספות: {modsToLabel(item)}</div>
              )}
              {Array.isArray(item.familyMeals) && item.familyMeals.length === 4 && (
                <div style={{ display: "grid", gap: 3, color: THEME.textMuted }}>
                  {item.familyMeals.map((meal) => (
                    <div key={`${key}-meal-${meal.mealNumber}`} style={{ fontSize: 12 }}>
                      מנה {meal.mealNumber}: {formatFamilyMealMods(meal.mods)}, שתיה: {meal.drinkLabel || "לא נבחרה"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          fontWeight: 900,
          fontSize: 28,
          marginBottom: 12,
          color: THEME.text,
        }}
      >
        ₪{total}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <button
          onClick={clearCart}
          style={{
            padding: "12px",
            borderRadius: 18,
            border: `1px solid ${THEME.border}`,
            background: "white",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          לנקות הכל
        </button>

        <button
          disabled={total === 0}
          onClick={() => setShowConfirm(true)}
          style={{
            padding: "13px",
            borderRadius: 18,
            border: "none",
            background:
              total > 0
                ? `linear-gradient(135deg, ${THEME.accent} 0%, ${THEME.warm} 100%)`
                : "#9ca3af",
            color: "white",
            cursor: total > 0 ? "pointer" : "not-allowed",
            fontWeight: 800,
            boxShadow: total > 0 ? "0 14px 30px rgba(15,118,110,0.20)" : "none",
          }}
        >
          המשך לביצוע הזמנה
        </button>
      </div>
    </div>
  );
}

function MobileSummaryDrawer({
  grouped,
  total,
  clearCart,
  setShowConfirm,
  isOpen,
  setIsOpen,
}) {
  if (typeof document === "undefined") return null;

  const itemCount = grouped.reduce((s, [, item]) => s + item.qty, 0);

  return createPortal(
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, direction: "rtl", pointerEvents: isOpen ? "auto" : "none" }}>
      {/* backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: -1 }}
        />
      )}

      {/* sheet */}
      <div
        style={{
          background: "white",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 32px rgba(15,23,42,0.16)",
          transform: isOpen ? "translateY(0)" : "translateY(calc(100% - 64px))",
          transition: "transform 260ms ease",
          willChange: "transform",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* handle + collapsed bar */}
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "10px 16px 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "auto",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🛒</span>
            {itemCount > 0 && (
              <span style={{
                background: THEME.accent,
                color: "white",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                padding: "1px 8px",
              }}>
                {itemCount}
              </span>
            )}
            <span style={{ fontWeight: 900, fontSize: 15, color: THEME.text }}>ההזמנה שלך</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 900, fontSize: 18, color: THEME.text }}>₪{total}</span>
            <span style={{ fontSize: 12, color: THEME.textMuted }}>{isOpen ? "▼" : "▲"}</span>
          </div>
        </button>

        {/* expanded content */}
        <div style={{ overflowY: "auto", padding: "0 16px", flex: 1, pointerEvents: isOpen ? "auto" : "none" }}>
          {grouped.length === 0 ? (
            <div style={{ color: THEME.textMuted, fontSize: 14, padding: "8px 0 12px" }}>עדיין לא נבחרו פריטים</div>
          ) : (
            grouped.map(([key, item]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  paddingBottom: 10,
                  marginBottom: 10,
                  borderBottom: `1px solid ${THEME.borderSoft}`,
                  fontSize: 14,
                  color: "#1f2937",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{item.qty}× {item.name}</div>
                  {item.allowsToppings && modsToLabel(item) !== "ללא תוספות" && (
                    <div style={{ color: THEME.textMuted, fontSize: 12, marginTop: 2 }}>
                      תוספות: {modsToLabel(item)}
                    </div>
                  )}
                  {Array.isArray(item.familyMeals) && item.familyMeals.length === 4 && (
                    <div style={{ color: THEME.textMuted, fontSize: 12, marginTop: 2 }}>
                      {item.familyMeals.map((meal) => (
                        <div key={meal.mealNumber}>מנה {meal.mealNumber}: {formatFamilyMealMods(meal.mods)}, {meal.drinkLabel || "ללא שתיה"}</div>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{ fontWeight: 800, flexShrink: 0 }}>₪{item.qty * item.price}</span>
              </div>
            ))
          )}
        </div>

        {/* total + buttons */}
        <div style={{ padding: "10px 16px 20px", borderTop: `1px solid ${THEME.borderSoft}`, flexShrink: 0, pointerEvents: isOpen ? "auto" : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontWeight: 900, fontSize: 18, color: THEME.text }}>סה"כ</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: THEME.text }}>₪{total}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <button
              onClick={clearCart}
              style={{
                padding: "11px",
                borderRadius: 14,
                border: `1px solid ${THEME.border}`,
                background: "white",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              לנקות הכל
            </button>
            <button
              disabled={total === 0}
              onClick={() => { setShowConfirm(true); setIsOpen(false); }}
              style={{
                padding: "14px",
                borderRadius: 14,
                border: "none",
                background: total > 0
                  ? `linear-gradient(135deg, ${THEME.accent} 0%, ${THEME.warm} 100%)`
                  : "#9ca3af",
                color: "white",
                cursor: total > 0 ? "pointer" : "not-allowed",
                fontWeight: 900,
                fontSize: 15,
                boxShadow: total > 0 ? "0 8px 20px rgba(15,118,110,0.25)" : "none",
              }}
            >
              המשך לביצוע הזמנה
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CustomerScreen({
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
}) {
  const [showConfirm, setShowConfirm] = useState(false);
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
  const [isMobileSummaryOpen, setIsMobileSummaryOpen] = useState(false);
  const [itemMods, setItemMods] = useState({});
  const [itemDrinks, setItemDrinks] = useState({});
  const [requestedPayment, setRequestedPayment] = useState("cash");
  const [orderType, setOrderType] = useState("pickup");
  const [certLightbox, setCertLightbox] = useState(null);
  const [deliveryTime, setDeliveryTime] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [openInlineDrinkPickerId, setOpenInlineDrinkPickerId] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const modalRef = useRef(null);
  const qrSectionRef = useRef(null);
  const inlineDrinkPickerRefs = useRef({});
  const notifyingReadyOrderIdsRef = useRef(new Set());
  const readyAudioRef = useRef(null);
  const audioUnlockedRef = useRef(false);

  const isMobile = viewportWidth <= 900;
  const isDesktop = viewportWidth > 900;
  const displayCustomerName = customerName.trim() || "לקוח";
  const qrOpen = requestedPayment === "bit" || requestedPayment === "paybox";
  const total = cart.reduce((sum, item) => sum + item.price, 0);
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
    !showConfirm &&
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

  const familyConfigModal =
    showFamilyConfig && typeof document !== "undefined"
      ? createPortal(
          <div
            onClick={closeFamilyConfig}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
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
                maxWidth: 680,
                maxHeight: "88vh",
                overflow: "auto",
                background: "white",
                borderRadius: 22,
                border: `1px solid ${THEME.border}`,
                boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
                padding: isMobile ? "14px" : "16px",
                display: "grid",
                gap: 10,
                direction: "rtl",
                textAlign: "right",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: isMobile ? 20 : 22, color: THEME.text }}>
                מבצע משפחתי - x4 יאגנוב המבורגר
              </div>
              <div style={{ color: THEME.textMuted, fontWeight: 700 }}>
                הגדר תוספות ושתיה לכל אחת מ-4 המנות
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {familyMealConfigs.map((meal, index) => (
                  <div
                    key={`family-meal-${index}`}
                    style={{
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#f8fafc",
                      borderRadius: 16,
                      padding: 10,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: THEME.text }}>מנה {index + 1}</div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "start" }}>
                      {ALL_TOPPINGS.map((ing) => (
                        <ToppingChip
                          key={`family-${index}-${ing.key}`}
                          imageSrc={ing.imageSrc}
                          label={ing.label}
                          active={meal.mods.includes(ing.key)}
                          onClick={() => toggleFamilyMealMod(index, ing.key)}
                        />
                      ))}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: 6,
                      }}
                    >
                      {DRINK_OPTIONS.map((drink) => (
                        <DrinkChip
                          key={`family-drink-${index}-${drink.key}`}
                          imageSrc={drink.imageSrc}
                          label={drink.label}
                          active={meal.drinkKey === drink.key}
                          onClick={() => selectFamilyMealDrink(index, drink.key)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {familyConfigError && (
                <div style={{ color: "#b91c1c", fontWeight: 800, textAlign: "center" }}>
                  {familyConfigError}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <button
                  onClick={confirmFamilyConfig}
                  style={{
                    padding: "12px",
                    borderRadius: 16,
                    border: "none",
                    background: `linear-gradient(135deg, ${THEME.accent} 0%, ${THEME.warm} 100%)`,
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: 15,
                  }}
                >
                  הוסף מבצע לעגלה
                </button>
                <button
                  onClick={closeFamilyConfig}
                  style={{
                    padding: "12px",
                    borderRadius: 16,
                    border: "1px solid #ccc",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: 15,
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

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

  useEffect(() => {
    if (!showConfirm) return;
    const timer = setTimeout(() => {
      modalRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => clearTimeout(timer);
  }, [showConfirm]);

  useEffect(() => {
    document.body.style.overflow = showConfirm ? "hidden" : "";
    document.body.style.touchAction = showConfirm ? "none" : "";
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [showConfirm]);

  useEffect(() => {
    if (!showConfirm) return;

    const onKeyDown = (event) => {
      if (isSubmittingOrder) return;
      if (event.key === "Escape") {
        setShowConfirm(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showConfirm, isSubmittingOrder]);

  useEffect(() => {
    if (!showConfirm) return;
    if (requestedPayment !== "bit" && requestedPayment !== "paybox") return;

    const timer = setTimeout(() => {
      qrSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 40);

    return () => clearTimeout(timer);
  }, [showConfirm, requestedPayment]);

  useEffect(() => {
    if (!openInlineDrinkPickerId) return;

    const openedItem = menu.find((item) => item.id === openInlineDrinkPickerId);
    if (!isGuidedComboDrinkItem(openedItem)) return;

    const timer = setTimeout(() => {
      inlineDrinkPickerRefs.current[openInlineDrinkPickerId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 40);

    return () => clearTimeout(timer);
  }, [openInlineDrinkPickerId]);

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
      await onSendOrder({ requestedPayment, deliveryTime, deliveryAddress, deliveryCity, deliveryPhone });
      setShowConfirm(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
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

  const getModsForItem = (itemId) => itemMods[itemId] || [];
  const getDrinkForItem = (itemId) => itemDrinks[itemId] || null;

  const selectDrinkForItem = (itemId, drinkKey) => {
    setItemDrinks((prev) => ({ ...prev, [itemId]: drinkKey }));
  };

  const toggleItemMod = (itemId, modKey) => {
    setItemMods((prev) => {
      const current = prev[itemId] || [];
      const next = current.includes(modKey)
        ? current.filter((x) => x !== modKey)
        : [...current, modKey];

      setCart((prevCart) => {
        const lastIdx = prevCart.map((c) => c.id).lastIndexOf(itemId);
        if (lastIdx === -1) return prevCart;
        const updated = [...prevCart];
        updated[lastIdx] = { ...updated[lastIdx], mods: next };
        return updated;
      });

      return { ...prev, [itemId]: next };
    });
  };

  const resetItemSelections = (itemId) => {
    setItemMods((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    setItemDrinks((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    setOpenInlineDrinkPickerId((prev) => (prev === itemId ? null : prev));
  };

  const addStandaloneDrinkToCart = (item) => {
    const selectedDrinkKey = getDrinkForItem(item.id);
    if (!selectedDrinkKey) {
      alert("בחר שתיה קודם");
      return;
    }

    const selectedDrink = getDrinkOptionsForItem(item).find((d) => d.key === selectedDrinkKey);
    if (!selectedDrink) return;

    setCart([
      ...cart,
      {
        ...item,
        name: selectedDrink.label,
        drinkType: selectedDrink.key,
        imageSrc: selectedDrink.imageSrc,
        allowsToppings: false,
      },
    ]);
    resetItemSelections(item.id);
  };

  const addMealWithDrinkToCart = (item, drinkKey) => {
    const selectedDrink = DRINK_OPTIONS.find((d) => d.key === drinkKey);
    if (!selectedDrink) return;

    setCart([
      ...cart,
      {
        ...item,
        name: replaceDrinkInName(getDisplayItemName(item.name), selectedDrink.label),
        drinkType: selectedDrink.key,
        mods: item.allowsToppings ? [...getModsForItem(item.id)] : [],
      },
    ]);
    resetItemSelections(item.id);
  };

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
      const drink = DRINK_OPTIONS.find((d) => d.key === meal.drinkKey);
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
        allowsToppings: false,
        mods: [`family:${signature}`],
        familyMeals: configuredMeals,
      },
    ]);

    closeFamilyConfig();
  }

  const addToCart = (item) => {
    if (isFamilyDealItem(item)) {
      setFamilyDealItem(item);
      setFamilyMealConfigs(createInitialFamilyMealsConfig());
      setFamilyConfigError("");
      setShowFamilyConfig(true);
      return;
    }

    if (isStandaloneDrinkItem(item)) {
      addStandaloneDrinkToCart(item);
      return;
    }

    if (itemHasDrinkChoice(item)) {
      setOpenInlineDrinkPickerId((prev) => (prev === item.id ? null : item.id));
      return;
    }

    setCart([
      ...cart,
      {
        ...item,
        name: getDisplayItemName(item.name),
        mods: item.allowsToppings ? [...getModsForItem(item.id)] : [],
      },
    ]);
    resetItemSelections(item.id);
  };

  const removeOneFromCart = (itemId) => {
    const idx = cart.map((c) => c.id).lastIndexOf(itemId);
    if (idx < 0) return;

    const next = [...cart];
    next.splice(idx, 1);
    setCart(next);

    if (!next.some((item) => item.id === itemId)) {
      resetItemSelections(itemId);
    }
  };

  const clearCart = () => {
    setCart([]);
    setItemMods({});
    setItemDrinks({});
    setOpenInlineDrinkPickerId(null);
  };

  const handleNameSubmit = () => {
    if (!customerName.trim()) return;
    setCustomerConfirmed(true);
  };

  const openReviewsForItem = (item) => {
    setSelectedReviewsItem(item);
  };

  return (
    <div
      style={{
        ...screenCardStyle(),
        backgroundImage:
          "linear-gradient(rgba(245,252,250,0.88), rgba(255,255,255,0.92)), url('https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: isMobile ? "scroll" : "fixed",
        minHeight: isDesktop && !customerConfirmed ? "calc(100vh - 120px)" : "100svh",
        padding: isMobile
          ? "12px 10px 14px"
          : customerConfirmed
            ? "16px 20px 20px"
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
          <LogoHeader />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <SectionTitle
              title={`הזמנה עבור ${displayCustomerName}`}
              subtitle="בחר מנות, שנה תוספות, וסגור הזמנה בקלות"
            />

            <button
              onClick={() => setCustomerConfirmed(false)}
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                border: `1px solid ${THEME.border}`,
                background: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              שינוי שם
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "minmax(0, 1fr)"
                : "minmax(0, 1.35fr) minmax(320px, 0.72fr)",
              gap: 14,
              alignItems: "start",
              paddingBottom: isMobile ? 12 : 0,
            }}
          >
            <div style={{ display: "grid", gap: 12 }}>
              {menu.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  qty={cart.filter((c) => c.id === item.id).length}
                  currentMods={getModsForItem(item.id)}
                  currentDrink={getDrinkForItem(item.id)}
                  ratingStats={menuRatingsByItemId[item.id] || null}
                  onOpenReviews={openReviewsForItem}
                  showInlineDrinkPicker={openInlineDrinkPickerId === item.id}
                  drinkPickerRef={(el) => {
                    if (el) inlineDrinkPickerRefs.current[item.id] = el;
                    else delete inlineDrinkPickerRefs.current[item.id];
                  }}
                  isMobile={isMobile}
                  onToggleMod={toggleItemMod}
                  onSelectStandaloneDrink={selectDrinkForItem}
                  onChooseMealDrink={addMealWithDrinkToCart}
                  onCloseInlineDrinkPicker={() => setOpenInlineDrinkPickerId(null)}
                  onAdd={() => addToCart(item)}
                  onRemove={() => removeOneFromCart(item.id)}
                />
              ))}
            </div>

            {!isMobile && (
              <OrderSidebar
                grouped={grouped}
                total={total}
                clearCart={clearCart}
                setShowConfirm={setShowConfirm}
                isMobile={isMobile}
              />
            )}
          </div>

          {isMobile && (
            <MobileSummaryDrawer
              grouped={grouped}
              total={total}
              clearCart={clearCart}
              setShowConfirm={setShowConfirm}
              isOpen={isMobileSummaryOpen}
              setIsOpen={setIsMobileSummaryOpen}
            />
          )}

          {showConfirm && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15,23,42,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                zIndex: 20,
              }}
            >
              <div
                ref={modalRef}
                style={{
                  width: "100%",
                  maxWidth: 540,
                  background: "white",
                  borderRadius: 24,
                  padding: isMobile ? 16 : 18,
                  boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
                  maxHeight: qrOpen ? "90vh" : "84vh",
                  overflowY: "auto",
                  overflowX: "hidden",
                  direction: "rtl",
                  textAlign: "right",
                }}
              >
                <h3
                  style={{
                    textAlign: "center",
                    marginTop: 0,
                    fontSize: isMobile ? 26 : 28,
                    fontWeight: 900,
                    marginBottom: 12,
                  }}
                >
                  אישור הזמנה
                </h3>

                <div
                  style={{
                    border: `1px solid ${THEME.borderSoft}`,
                    borderRadius: 18,
                    padding: 12,
                    background: "#f8fafc",
                    margin: "10px 0 12px",
                  }}
                >
                  {grouped.map(([key, item]) => (
                    <div
                      key={key}
                      style={{
                        display: "grid",
                        gap: 4,
                        marginBottom: 9,
                        paddingBottom: 8,
                        borderBottom: `1px solid ${THEME.borderSoft}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span>
                          {item.qty}x {item.name}
                        </span>
                        <span style={{ fontWeight: 800 }}>
                          ₪{item.qty * item.price}
                        </span>
                      </div>

                      {item.allowsToppings && (
                        <div style={{ color: THEME.textMuted, fontSize: 13 }}>
                          תוספות: {modsToLabel(item)}
                        </div>
                      )}

                      {Array.isArray(item.familyMeals) && item.familyMeals.length === 4 && (
                        <div style={{ display: "grid", gap: 3, color: THEME.textMuted, fontSize: 13 }}>
                          {item.familyMeals.map((meal) => (
                            <div key={`${key}-confirm-meal-${meal.mealNumber}`}>
                              מנה {meal.mealNumber}: {formatFamilyMealMods(meal.mods)}, שתיה: {meal.drinkLabel || "לא נבחרה"}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 22,
                      marginTop: 8,
                      color: THEME.text,
                    }}
                  >
                    סה"כ: ₪{total}
                  </div>
                </div>

                <div
                  style={{
                    marginBottom: 18,
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

                  {/* פרטי משלוח — מוצג רק כשנבחר משלוח */}
                  {orderType === "delivery" && (
                    <div style={{ padding: "14px 16px", background: "#fffbeb" }}>
                      <div style={{ fontWeight: 800, color: "#92400e", fontSize: 14, marginBottom: 10 }}>
                        בחר שעת משלוח:
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: 8,
                          marginBottom: 12,
                        }}
                      >
                        {["19:00", "20:00", "21:00"].map((time) => (
                          <button
                            key={time}
                            onClick={() => setDeliveryTime(deliveryTime === time ? null : time)}
                            style={{
                              padding: "11px 0",
                              borderRadius: 14,
                              border: `2px solid ${deliveryTime === time ? "#f59e0b" : "#fcd34d"}`,
                              background: deliveryTime === time
                                ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                                : "white",
                              color: deliveryTime === time ? "white" : "#92400e",
                              fontWeight: 800,
                              fontSize: 16,
                              cursor: "pointer",
                              transition: "all 0.15s",
                              boxShadow: deliveryTime === time ? "0 4px 12px rgba(245,158,11,0.35)" : "none",
                            }}
                          >
                            {time}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <input
                          type="text"
                          placeholder="רחוב ומספר בית"
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1.5px solid ${deliveryAddress.trim() ? "#f59e0b" : "#fcd34d"}`,
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "inherit",
                            outline: "none",
                            direction: "rtl",
                            background: "white",
                          }}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                          {["בני דקלים", "אליאב", "כרמי קטיף"].map((city) => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => setDeliveryCity(city)}
                              style={{
                                padding: "10px 4px",
                                borderRadius: 12,
                                border: `1.5px solid ${deliveryCity === city ? "#f59e0b" : "#fcd34d"}`,
                                background: deliveryCity === city ? "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)" : "white",
                                color: deliveryCity === city ? "white" : "#92400e",
                                fontWeight: 800,
                                fontSize: 13,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                transition: "all 0.15s",
                                boxShadow: deliveryCity === city ? "0 4px 10px rgba(245,158,11,0.3)" : "none",
                              }}
                            >
                              {city}
                            </button>
                          ))}
                        </div>
                        <input
                          type="tel"
                          placeholder="מספר טלפון"
                          value={deliveryPhone}
                          onChange={(e) => setDeliveryPhone(e.target.value)}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1.5px solid ${deliveryPhone.trim() ? "#f59e0b" : "#fcd34d"}`,
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "inherit",
                            outline: "none",
                            direction: "rtl",
                            background: "white",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    marginBottom: 8,
                    fontWeight: 900,
                    color: THEME.text,
                    fontSize: 15,
                  }}
                >
                  מהו אופן התשלום המבוקש?
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
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

                {requestedPayment === "bit" && (
                  <div ref={qrSectionRef} style={{ textAlign: "center", marginBottom: 14 }}>
                    <img
                      src="/Bit QR Code.jpeg"
                      alt="BIT QR Code"
                      style={{
                        width: isMobile ? 210 : 220,
                        maxWidth: "100%",
                        borderRadius: 16,
                        border: `1px solid ${THEME.borderSoft}`,
                      }}
                    />
                  </div>
                )}

                {requestedPayment === "paybox" && (
                  <div ref={qrSectionRef} style={{ textAlign: "center", marginBottom: 14 }}>
                    <img
                      src="/PayBoox QR Code.jpeg"
                      alt="PayBox QR Code"
                      style={{
                        width: isMobile ? 210 : 220,
                        maxWidth: "100%",
                        borderRadius: 16,
                        border: `1px solid ${THEME.borderSoft}`,
                      }}
                    />
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <button
                    onClick={handleSubmitOrder}
                    disabled={isSubmittingOrder}
                    style={{
                      padding: "12px",
                      borderRadius: 16,
                      border: "none",
                      background: `linear-gradient(135deg, ${THEME.accent} 0%, ${THEME.warm} 100%)`,
                      color: "white",
                      cursor: isSubmittingOrder ? "not-allowed" : "pointer",
                      opacity: isSubmittingOrder ? 0.75 : 1,
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                  >
                    {isSubmittingOrder ? "שולח..." : "שלח לקופה"}
                  </button>

                  <button
                    onClick={() => setShowConfirm(false)}
                    disabled={isSubmittingOrder}
                    style={{
                      padding: "12px",
                      borderRadius: 16,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: isSubmittingOrder ? "not-allowed" : "pointer",
                      opacity: isSubmittingOrder ? 0.7 : 1,
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                  >
                    עדכון הזמנה
                  </button>
                </div>

                {submitOrderError && (
                  <div
                    style={{
                      marginTop: 10,
                      color: "#b91c1c",
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    {submitOrderError}
                  </div>
                )}
              </div>
            </div>
          )}

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
