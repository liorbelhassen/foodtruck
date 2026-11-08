import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OrderItems, StaffPills } from "./uiHelpers.jsx";
import {
  formatDurationMs,
  orderTypeText,
  STAFF,
  staffBtn,
  staffChip,
  staffRootStyle,
  staffSubbarStyle,
  useStaffViewport,
} from "./uiHelpersUtils.jsx";
import { toMillis } from "../utils/timeUtils.js";

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

  const { ref, height, isMobile } = useStaffViewport();
  const wallRef = useRef(null);
  const [wallSize, setWallSize] = useState({ w: 1000, h: 500 });
  const [view, setView] = useState("active");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const el = wallRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setWallSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const elapsedMinutes = (order) => {
    const startMs = getOrderStartMs(order);
    if (startMs == null) return 0;
    return Math.floor(((toMillis(order.readyAt) ?? nowMs) - startMs) / 60000);
  };

  const bandColor = (order) => {
    if (order.status === "delivered") return "#94a3b8";
    if (order.status === "ready") return "#64748b";
    const minutes = elapsedMinutes(order);
    if (minutes >= 12) return STAFF.bad;
    if (minutes >= 8) return "#d97706";
    return STAFF.ok;
  };

  const cooking = orders.filter((o) => o.status === "in_progress").reverse();
  const readyOrders = orders.filter((o) => o.status === "ready").reverse();
  const viewOrders = {
    active: [...cooking, ...readyOrders],
    cooking,
    ready: readyOrders,
    done: completedOrders,
  }[view];
  const cols = Math.max(1, Math.floor((wallSize.w + 10) / (isMobile ? 300 : 260)));
  const rows = Math.max(1, Math.floor((wallSize.h + 10) / 280));
  const pageSize = cols * rows;
  const pageCount = Math.max(1, Math.ceil(viewOrders.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleOrders = viewOrders.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

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

  const pagerBtn = { ...staffBtn("ghost"), padding: "6px 12px" };

  return (
    <div ref={ref} style={staffRootStyle(height)}>
      <div style={staffSubbarStyle()}>
        <b style={{ fontSize: 16 }}>👨‍🍳 מטבח</b>
        <StaffPills
          options={[
            { key: "active", label: "פעילות", count: cooking.length + readyOrders.length },
            { key: "cooking", label: "בהכנה", count: cooking.length },
            { key: "ready", label: "מוכנות", count: readyOrders.length },
            { key: "done", label: "נמסרו", count: completedOrders.length },
          ]}
          value={view}
          onChange={(next) => {
            setView(next);
            setPage(0);
          }}
        />
        {!isMobile && (
          <div style={{ display: "flex", gap: 4 }}>
            <span style={staffChip("ok")}>עד 8 ד׳</span>
            <span style={staffChip("warn")}>8–12</span>
            <span style={staffChip("bad")}>12+</span>
          </div>
        )}
        <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" aria-label="עמוד קודם" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} style={{ ...pagerBtn, opacity: currentPage === 0 ? 0.4 : 1 }}>→</button>
          <b style={{ fontSize: 13 }}>עמוד {currentPage + 1}/{pageCount}</b>
          <button type="button" aria-label="עמוד הבא" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} style={{ ...pagerBtn, opacity: currentPage >= pageCount - 1 ? 0.4 : 1 }}>←</button>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            disabled={!kitchenOrderIds.length}
            style={{ ...staffBtn("danger"), padding: "6px 10px", fontSize: 12, opacity: kitchenOrderIds.length ? 1 : 0.5 }}
          >
            איפוס כל המידע
          </button>
        </div>
      </div>

      <div
        ref={wallRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: 10,
          padding: 10,
          overflow: "hidden",
        }}
      >
        {visibleOrders.length === 0 && (
          <div style={{ color: STAFF.muted, padding: 12, gridColumn: "1 / -1" }}>
            {view === "done" ? "אין עדיין הזמנות שנמסרו" : "אין הזמנות בהכנה"}
          </div>
        )}
        {visibleOrders.map((order) => (
          <article
            key={order.id}
            style={{
              background: "white",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(43,33,24,0.08)",
            }}
          >
            <div style={{ background: bandColor(order), color: "white", padding: "7px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontWeight: 900, fontSize: 16 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                #{order.orderNumber} {displayCustomerName(order.customerName)}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>
                {order.status === "in_progress"
                  ? `⏱ ${formatElapsed(order)}`
                  : order.status === "ready"
                  ? "🛎️ מוכנה"
                  : `⏱ ${formatDurationMs(getOrderStartMs(order), order.readyAt) || "—"}`}
              </span>
            </div>
            <div style={{ padding: "6px 10px", flex: 1, minHeight: 0, overflowY: "auto" }}>
              <div style={{ marginBottom: 4 }}>
                <span style={staffChip(order.deliveryTime ? "del" : "neutral")}>{orderTypeText(order)}</span>
              </div>
              <OrderItems items={order.items} big={order.status === "in_progress"} showPrice={false} />
            </div>
            {order.status !== "delivered" && (
              <div style={{ padding: "8px 10px", borderTop: `1px solid ${STAFF.line}` }}>
                {order.status === "in_progress" ? (
                  <button type="button" onClick={() => onMarkReady(order.id)} aria-label="סיימתי להכין" style={{ ...staffBtn("ok", true), width: "100%" }}>
                    ✓ סיימתי להכין
                  </button>
                ) : (
                  <button type="button" onClick={() => onMarkDelivered(order.id)} aria-label="נמסר" style={{ ...staffBtn("ghost"), width: "100%" }}>
                    ✓ נמסר
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      {resetConfirmModal}
    </div>
  );
}
