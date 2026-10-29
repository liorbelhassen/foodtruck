import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LogoHeader,
  SectionTitle,
} from "./uiHelpers.jsx";
import {
  formatDurationMs,
  getIncludedToppings,
  screenCardStyle,
} from "./uiHelpersUtils.jsx";
import { DRINK_OPTIONS, EXTRA_DRINK_OPTIONS } from "./customer/customerConstants.js";
import { toMillis } from "../utils/timeUtils.js";

const ALL_DRINKS = [...DRINK_OPTIONS, ...EXTRA_DRINK_OPTIONS];
const drinkLabelMap = Object.fromEntries(ALL_DRINKS.map((d) => [d.key, d.label]));

function displayCustomerName(name) {
  return (name || "").trim() || "לקוח";
}

export default function KitchenScreen({
  orders = [],
  onMarkReady = () => {},
  onMarkDelivered = () => {},
  onResetAll = () => {},
}) {
  const [, forceTick] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showOnlyUnhandled, setShowOnlyUnhandled] = useState(false);
  const kachingAudioRef = useRef(null);
  const kitchenAudioUnlockedRef = useRef(false);
  const pendingKachingRef = useRef(false);
  const previousKitchenStatusByIdRef = useRef(new Map());
  const hasInitializedKitchenStatusRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeOrders = orders.filter(
    (o) => o.status === "in_progress" || o.status === "ready"
  );
  const completedOrders = orders.filter((o) => o.status === "delivered");
  const displayedActiveOrders = showOnlyUnhandled
    ? activeOrders.filter((o) => o.status === "in_progress")
    : activeOrders;
  const kitchenOrderIds = [...activeOrders, ...completedOrders].map((o) => o.id).filter(Boolean);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const audio = new Audio("/kaching.mp3");
    audio.preload = "auto";
    audio.volume = 1;
    kachingAudioRef.current = audio;

    const onAudioLoadError = (event) => {
      console.error("[KitchenSound] audio failed to load", event);
    };
    audio.addEventListener("error", onAudioLoadError);

    const tryPlayKaching = (reason = "unknown") => {
      const kachingAudio = kachingAudioRef.current;
      if (!kachingAudio) return;

      try {
        kachingAudio.currentTime = 0;
        const playPromise = kachingAudio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(() => {
              pendingKachingRef.current = false;
            })
            .catch((error) => {
              pendingKachingRef.current = true;
              console.warn(`[KitchenSound] play blocked/error (${reason})`, error);
            });
        }
      } catch (error) {
        pendingKachingRef.current = true;
        console.warn(`[KitchenSound] play threw (${reason})`, error);
      }
    };

    const removeUnlockListeners = () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };

    const unlockAudio = () => {
      if (kitchenAudioUnlockedRef.current) return;

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
              kitchenAudioUnlockedRef.current = true;
              removeUnlockListeners();
              if (pendingKachingRef.current) {
                tryPlayKaching("pending-after-unlock");
              }
            })
            .catch((error) => {
              audio.muted = wasMuted;
              console.warn("[KitchenSound] unlock blocked/error", error);
            });
        } else {
          audio.muted = wasMuted;
          kitchenAudioUnlockedRef.current = true;
          removeUnlockListeners();
          if (pendingKachingRef.current) {
            tryPlayKaching("pending-after-unlock");
          }
        }
      } catch (error) {
        console.warn("[KitchenSound] unlock threw", error);
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("touchstart", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    return () => {
      removeUnlockListeners();
      audio.removeEventListener("error", onAudioLoadError);
      if (kachingAudioRef.current) {
        kachingAudioRef.current.pause();
        kachingAudioRef.current.currentTime = 0;
      }
    };
  }, []);

  useEffect(() => {
    const currentStatusById = new Map(
      orders.filter((order) => order?.id).map((order) => [order.id, order.status])
    );

    if (!hasInitializedKitchenStatusRef.current) {
      previousKitchenStatusByIdRef.current = currentStatusById;
      hasInitializedKitchenStatusRef.current = true;
      return;
    }

    const previousStatusById = previousKitchenStatusByIdRef.current;
    const transitionedIntoKitchenIds = [];

    currentStatusById.forEach((status, id) => {
      const previousStatus = previousStatusById.get(id);
      if (previousStatus !== "in_progress" && status === "in_progress") {
        transitionedIntoKitchenIds.push(id);
      }
    });

    if (transitionedIntoKitchenIds.length > 0) {
      const kachingAudio = kachingAudioRef.current;
      if (kachingAudio && kitchenAudioUnlockedRef.current) {
        try {
          kachingAudio.currentTime = 0;
          const playPromise = kachingAudio.play();
          if (playPromise && typeof playPromise.then === "function") {
            playPromise
              .then(() => {
                pendingKachingRef.current = false;
              })
              .catch((error) => {
                pendingKachingRef.current = true;
                console.warn(
                  "[KitchenSound] play blocked/error (kitchen-transition)",
                  error
                );
              });
          }
        } catch (error) {
          pendingKachingRef.current = true;
          console.warn("[KitchenSound] play threw (kitchen-transition)", error);
        }
      } else {
        pendingKachingRef.current = true;
      }
    }

    previousKitchenStatusByIdRef.current = currentStatusById;
  }, [orders]);

  const getOrderStartMs = (order) =>
    toMillis(order.kitchenStartedAt) ??
    toMillis(order.sentToKitchenAt) ??
    toMillis(order.createdAt);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (order) => {
    const startMs = getOrderStartMs(order);
    if (startMs == null) return "00:00";

    const endMs = toMillis(order.readyAt) ?? nowMs;
    const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const confirmResetAll = async () => {
    if (!kitchenOrderIds.length) {
      setShowResetConfirm(false);
      return;
    }
    await onResetAll(kitchenOrderIds);
    setShowResetConfirm(false);
  };

  const resetConfirmModal =
    showResetConfirm && typeof document !== "undefined"
      ? createPortal(
          <div
            onClick={() => setShowResetConfirm(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 430,
                background: "white",
                borderRadius: 22,
                border: "1px solid #fecaca",
                boxShadow: "0 20px 50px rgba(15,23,42,0.22)",
                padding: "20px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: "#b91c1c",
                  fontWeight: 900,
                  fontSize: "22px",
                  marginBottom: "12px",
                }}
              >
                שים לב! אתה עומד למחוק את כל ההזמנות!
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={confirmResetAll}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "16px",
                    border: "none",
                    background: "linear-gradient(135deg, #dc2626 0%, #f97316 100%)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  מחק הכל
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "16px",
                    border: "1px solid #d1d5db",
                    background: "white",
                    color: "#111827",
                    cursor: "pointer",
                    fontWeight: 700,
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

  return (
    <div style={screenCardStyle()}>
      <LogoHeader compact />

      <style>{`
        @keyframes kitchenPrepPulse {
          0% { transform: scale(0.92); opacity: 0.55; }
          50% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(0.92); opacity: 0.55; }
        }
        @keyframes kitchenSpinnerSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
        <SectionTitle title="מסך מטבח" subtitle="רק הזמנות ששולמו ונשלחו להכנה" />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
              padding: "6px",
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

          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={!kitchenOrderIds.length}
            style={{
              padding: "12px 16px",
              borderRadius: "16px",
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#b91c1c",
              cursor: kitchenOrderIds.length ? "pointer" : "not-allowed",
              fontWeight: 700,
              opacity: kitchenOrderIds.length ? 1 : 0.6,
            }}
          >
            איפוס כל המידע
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        {/* header bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#111827", borderRadius: "10px 10px 0 0", padding: "8px 14px",
        }}>
          <span style={{ color: "white", fontWeight: 900, fontSize: 16 }}>🍳 הזמנות פעילות</span>
          <span style={{ background: "#22c55e", color: "white", borderRadius: 999, fontSize: 12, fontWeight: 900, padding: "1px 8px" }}>
            {displayedActiveOrders.length}
          </span>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
          {/* header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "64px 1fr 2fr 1fr 90px 120px",
            background: "#f8fafc",
            borderBottom: "1px solid #e5e7eb",
            padding: "6px 12px",
            fontSize: 12, fontWeight: 800, color: "#6b7280",
            direction: "rtl",
          }}>
            <span>#</span>
            <span>שם</span>
            <span>מנות</span>
            <span>משלוח</span>
            <span style={{ textAlign: "center" }}>טיימר</span>
            <span style={{ textAlign: "center" }}>פעולה</span>
          </div>

          {displayedActiveOrders.length === 0 ? (
            <div style={{ color: "#6b7280", padding: "12px 14px", fontSize: 13 }}>אין הזמנות בהכנה</div>
          ) : (
            displayedActiveOrders.map((order) => (
              <div key={order.id} style={{
                display: "grid",
                gridTemplateColumns: "64px 1fr 2fr 1fr 90px 120px",
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: "1px solid #f1f5f9",
                background: order.status === "ready" ? "#f0fdf4" : "white",
                fontSize: 13,
                direction: "rtl",
                gap: 4,
              }}>
                <span style={{ fontWeight: 900, color: "#111827", fontSize: 14 }}>#{order.orderNumber}</span>
                <span style={{ fontWeight: 700, color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayCustomerName(order.customerName)}
                </span>
                <div>
                  {order.items.map((i, idx) => (
                    <div key={idx} style={{ color: "#374151", lineHeight: 1.5, marginBottom: 2 }}>
                      <span style={{ fontWeight: 700 }}>{i.name}{i.qty && i.qty > 1 ? ` ×${i.qty}` : ""}</span>
                      {i.drinkKey && drinkLabelMap[i.drinkKey] && (
                        <span style={{ color: "#2563eb", fontSize: 11, marginRight: 4 }}>🥤 {drinkLabelMap[i.drinkKey]}</span>
                      )}
                      {getIncludedToppings(i).length > 0 && (
                        <span style={{ color: "#059669", fontSize: 11, marginRight: 4 }}>
                          +{getIncludedToppings(i).join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  {order.deliveryTime ? (
                    <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "4px 8px", fontSize: 12 }}>
                      <div style={{ color: "#92400e", fontWeight: 900 }}>🛵 {order.deliveryTime}</div>
                      {order.deliveryCity && <div style={{ color: "#78350f", fontWeight: 700 }}>{order.deliveryCity}</div>}
                    </div>
                  ) : (
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>איסוף</span>
                  )}
                </div>
                <div style={{ textAlign: "center", background: "#111827", color: "#fff", borderRadius: 10, padding: "6px 4px" }}>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>זמן</div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>{formatElapsed(order)}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  {order.status === "in_progress" ? (
                    <button
                      onClick={() => onMarkReady(order.id)}
                      style={{
                        padding: "8px 12px", borderRadius: 8, border: "none",
                        background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                        color: "white", fontWeight: 800, fontSize: 20, cursor: "pointer", width: "100%",
                      }}
                      aria-label="סיימתי להכין"
                      title="סיימתי להכין"
                    >✓</button>
                  ) : (
                    <button
                      onClick={() => onMarkDelivered(order.id)}
                      style={{
                        padding: "6px 8px", borderRadius: 8, border: "none",
                        background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                        color: "white", fontWeight: 800, fontSize: 11, cursor: "pointer", width: "100%",
                      }}
                    >נמסר</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {!showOnlyUnhandled && (
        <div style={{ marginTop: "8px" }}>
          {/* header bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#374151", borderRadius: "10px 10px 0 0", padding: "8px 14px",
          }}>
            <span style={{ color: "white", fontWeight: 900, fontSize: 16 }}>📋 היסטוריית הזמנות</span>
            <span style={{ background: "#6b7280", color: "white", borderRadius: 999, fontSize: 12, fontWeight: 900, padding: "1px 8px" }}>
              {completedOrders.length}
            </span>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
            {/* header row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "64px 1fr 2fr 1fr 100px",
              background: "#f8fafc",
              borderBottom: "1px solid #e5e7eb",
              padding: "6px 12px",
              fontSize: 12, fontWeight: 800, color: "#6b7280",
              direction: "rtl",
            }}>
              <span>#</span>
              <span>שם</span>
              <span>מנות</span>
              <span>משלוח</span>
              <span style={{ textAlign: "center" }}>זמן הכנה</span>
            </div>

            {completedOrders.length === 0 ? (
              <div style={{ color: "#6b7280", padding: "12px 14px", fontSize: 13 }}>אין עדיין הזמנות שנמסרו</div>
            ) : (
              completedOrders.map((order) => (
                <div key={order.id} style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr 2fr 1fr 100px",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f1f5f9",
                  background: "#f8fafc",
                  fontSize: 13,
                  direction: "rtl",
                  gap: 4,
                }}>
                  <span style={{ fontWeight: 900, color: "#374151", fontSize: 14 }}>#{order.orderNumber}</span>
                  <span style={{ fontWeight: 700, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayCustomerName(order.customerName)}
                  </span>
                  <div>
                    {order.items.map((i, idx) => (
                      <div key={idx} style={{ color: "#374151", lineHeight: 1.5, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700 }}>{i.name}{i.qty && i.qty > 1 ? ` ×${i.qty}` : ""}</span>
                        {i.drinkKey && drinkLabelMap[i.drinkKey] && (
                          <span style={{ color: "#2563eb", fontSize: 11, marginRight: 4 }}>🥤 {drinkLabelMap[i.drinkKey]}</span>
                        )}
                        {getIncludedToppings(i).length > 0 && (
                          <span style={{ color: "#059669", fontSize: 11, marginRight: 4 }}>
                            +{getIncludedToppings(i).join(", ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div>
                    {order.deliveryTime ? (
                      <div style={{ fontSize: 12 }}>
                        <div style={{ color: "#92400e", fontWeight: 900 }}>🛵 {order.deliveryTime}</div>
                        {order.deliveryCity && <div style={{ color: "#78350f", fontWeight: 700 }}>{order.deliveryCity}</div>}
                      </div>
                    ) : (
                      <span style={{ color: "#9ca3af", fontSize: 12 }}>איסוף</span>
                    )}
                  </div>
                  <div style={{ textAlign: "center", fontWeight: 800, color: "#374151", fontSize: 14 }}>
                    {formatDurationMs(getOrderStartMs(order), order.readyAt) || "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {resetConfirmModal}
    </div>
  );
}
