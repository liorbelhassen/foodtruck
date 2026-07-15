import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomerScreen from "./components/CustomerScreen.jsx";
import CashierScreen from "./components/CashierScreen.jsx";
import KitchenScreen from "./components/KitchenScreen.jsx";
import AnalyticsScreen from "./components/AnalyticsScreen.jsx";
import DeliveryScreen from "./components/DeliveryScreen.jsx";

import { auth, db, rtdb } from "./firebase";
import {
  ensureAnonymousAuth,
  signInAsAdminWithGoogle,
  signInAsAdminWithEmail,
  logout,
  subscribeToAuth,
} from "./services/auth";

import { doc, serverTimestamp as firestoreServerTimestamp, updateDoc } from "firebase/firestore";
import {
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp as rtdbServerTimestamp,
  set,
  update,
} from "firebase/database";

import { toMillis } from "./utils/timeUtils.js";

import {
  createOrder,
  subscribeToOrders,
  subscribeToMenuRatings,
  deleteOrdersInFirebase,
  payOrderInFirebase,
  sendToKitchenInFirebase,
  submitOrderReviewInFirebase,
} from "./services/orders";

const STORAGE_KEY = "foodtruck-shifts-v1";

function navBtn(active, compact = false) {
  return {
    padding: compact ? "11px 16px" : "13px 18px",
    borderRadius: "18px",
    border: active ? "none" : "1px solid #d7e3df",
    background: active
      ? "linear-gradient(135deg, #0f766e 0%, #f59e0b 100%)"
      : "rgba(255,255,255,0.92)",
    color: active ? "white" : "#0f172a",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: compact ? "14px" : "15px",
    minWidth: compact ? 96 : 110,
    boxShadow: active
      ? "0 16px 32px rgba(15,118,110,0.20)"
      : "0 10px 24px rgba(15,23,42,0.06)",
    transition: "all 0.2s ease",
    backdropFilter: "blur(8px)",
    whiteSpace: "nowrap",
  };
}

function authBtnStyle(primary = false, compact = false) {
  return {
    padding: compact ? "10px 14px" : "11px 16px",
    borderRadius: "16px",
    border: primary ? "none" : "1px solid #d7e3df",
    background: primary
      ? "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)"
      : "rgba(255,255,255,0.92)",
    color: primary ? "white" : "#0f172a",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: compact ? "13px" : "14px",
    boxShadow: primary
      ? "0 14px 28px rgba(15,118,110,0.18)"
      : "0 8px 20px rgba(15,23,42,0.05)",
    whiteSpace: "nowrap",
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [showAdminEmailLogin, setShowAdminEmailLogin] = useState(false);
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [isAdminLoggingIn, setIsAdminLoggingIn] = useState(false);

  const [screen, setScreen] = useState("customer");
  const [firebaseOrders, setFirebaseOrders] = useState([]);
  const [menuRatingsByItemId, setMenuRatingsByItemId] = useState({});

  const [customerName, setCustomerName] = useState("");
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [cart, setCart] = useState([]);
  const [selectedMods, setSelectedMods] = useState([]);


  const [customerOrderId, setCustomerOrderId] = useState(null);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [connectedCustomersCount, setConnectedCustomersCount] = useState(0);
  const presenceSessionIdRef = useRef(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const isAdmin = !!user && !user.isAnonymous;
  const isMobile = viewportWidth <= 900;
  const isDesktop = viewportWidth > 900;
  const activeCustomerOrder =
    customerOrderId ? firebaseOrders.find((order) => order.id === customerOrderId) || null : null;
  const lastCreatedOrderNumber =
    firebaseOrders.find((order) => order.id === customerOrderId)?.orderNumber ?? "-";
  const shouldTrackCustomerPresence = !!user?.isAnonymous && screen === "customer";

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      ensureAnonymousAuth().catch(console.error);
    }
  }, [authReady, user]);

  useEffect(() => {
    const unsubscribe = subscribeToOrders((orders) => {
      setFirebaseOrders(orders);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToMenuRatings((ratings) => {
      setMenuRatingsByItemId(ratings);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!shouldTrackCustomerPresence || !user?.uid) return undefined;

    const presenceRef = ref(rtdb, `activeCustomers/${user.uid}-${presenceSessionIdRef.current}`);
    const connectedRef = ref(rtdb, ".info/connected");
    let heartbeatTimer = null;

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const unsubscribeConnected = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() !== true) return;

      onDisconnect(presenceRef).remove().catch(() => {});

      set(presenceRef, {
        uid: user.uid,
        screen: "customer",
        isAdmin: false,
        lastSeen: Date.now(),
        connectedAt: rtdbServerTimestamp(),
      }).catch(() => {});

      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        update(presenceRef, { lastSeen: Date.now() }).catch(() => {});
      }, 20000);
    });

    return () => {
      unsubscribeConnected();
      stopHeartbeat();
      remove(presenceRef).catch(() => {});
    };
  }, [shouldTrackCustomerPresence, user?.uid]);

  useEffect(() => {
    if (!isAdmin) {
      return undefined;
    }

    const activeCustomersRef = ref(rtdb, "activeCustomers");
    const STALE_AFTER_MS = 70000;
    const unsubscribe = onValue(activeCustomersRef, (snapshot) => {
      const now = Date.now();
      let nextCount = 0;

      snapshot.forEach((child) => {
        const value = child.val() || {};
        const lastSeen =
          typeof value.lastSeen === "number" && Number.isFinite(value.lastSeen)
            ? value.lastSeen
            : null;

        if (value.isAdmin === true) return;
        if (value.screen !== "customer") return;
        if (lastSeen == null) return;
        if (now - lastSeen > STALE_AFTER_MS) return;
        nextCount += 1;
      });

      setConnectedCustomersCount(nextCount);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const sendOrder = async ({ requestedPayment, deliveryTime, deliveryAddress, deliveryCity, deliveryPhone } = {}) => {
    const total = cart.reduce((sum, item) => sum + item.price, 0);

    const createdOrderRef = await createOrder({
      customerName: (customerName || "").trim() || "לקוח",
      customerUid: auth.currentUser?.uid || null,
      paymentRequested: requestedPayment || null,
      deliveryTime: deliveryTime || null,
      deliveryAddress: deliveryAddress || null,
      deliveryCity: deliveryCity || null,
      deliveryPhone: deliveryPhone || null,
      total,
      items: cart,
    });

    setCustomerOrderId(createdOrderRef.id);
    setCart([]);
    setSelectedMods([]);
    setShowOrderSuccess(true);
  };

  const payOrder = async (id, method) => {
    await payOrderInFirebase(id, method);
  };

  const sendToKitchen = async (id) => {
    await sendToKitchenInFirebase(id);
  };

  const markReady = async (id) => {
    const order = firebaseOrders.find((o) => o.id === id);
    const startMs =
      toMillis(order?.kitchenStartedAt) ??
      toMillis(order?.sentToKitchenAt) ??
      toMillis(order?.createdAt);
    const prepDurationMs =
      startMs == null ? null : Math.max(0, Date.now() - startMs);

    await updateDoc(doc(db, "orders", id), {
      status: "ready",
      readyAt: firestoreServerTimestamp(),
      notifiedReady: false,
      prepDurationMs,
      prepState: "ready",
    });
  };

  const markDelivered = async (id) => {
    await updateDoc(doc(db, "orders", id), {
      status: "delivered",
      deliveredAt: firestoreServerTimestamp(),
      prepState: "delivered",
    });
  };

  const resetKitchenOrders = async (orderIds = []) => {
    await deleteOrdersInFirebase(orderIds);
  };

  const submitOrderReview = async (orderId, reviewPayload) => {
    await submitOrderReviewInFirebase(orderId, reviewPayload);
  };

  const handleAdminEmailLogin = async () => {
    if (isAdminLoggingIn) return;
    if (!adminEmailInput.trim() || !adminPasswordInput) {
      setAdminLoginError("יש להזין אימייל וסיסמה");
      return;
    }

    try {
      setIsAdminLoggingIn(true);
      setAdminLoginError("");
      await signInAsAdminWithEmail(adminEmailInput, adminPasswordInput);
      setShowAdminEmailLogin(false);
      setAdminEmailInput("");
      setAdminPasswordInput("");
    } catch (error) {
      console.error("Admin email login failed:", error);
      setAdminLoginError("ההתחברות נכשלה. בדוק אימייל וסיסמה ונסה שוב.");
    } finally {
      setIsAdminLoggingIn(false);
    }
  };

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const thirtyMinutesAgoMs = nowMs - 30 * 60 * 1000;
  const MIN_RECENT_SAMPLES = 2;

  const recentPrepDurationsMs = firebaseOrders
    .map((order) => {
      const completedAtMs = toMillis(order?.readyAt) ?? toMillis(order?.deliveredAt);
      if (completedAtMs == null || completedAtMs < thirtyMinutesAgoMs || completedAtMs > nowMs) {
        return null;
      }

      if (typeof order?.prepDurationMs === "number" && Number.isFinite(order.prepDurationMs)) {
        return Math.max(0, order.prepDurationMs);
      }

      const startMs =
        toMillis(order?.kitchenStartedAt) ??
        toMillis(order?.sentToKitchenAt) ??
        toMillis(order?.createdAt);
      if (startMs == null || startMs > completedAtMs) return null;

      return Math.max(0, completedAtMs - startMs);
    })
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  const hasReliableRecentAverage = recentPrepDurationsMs.length >= MIN_RECENT_SAMPLES;
  const averageWaitMinutes = hasReliableRecentAverage
    ? Math.max(
        1,
        Math.round(
          recentPrepDurationsMs.reduce((sum, value) => sum + value, 0) /
            recentPrepDurationsMs.length /
            60000
        )
      )
    : 7;
  const waitMessageBg = averageWaitMinutes < 10 ? "#dbeafe" : "#fee2e2";
  const waitMessageText = averageWaitMinutes < 10 ? "#1d4ed8" : "#b91c1c";
  const averageWaitMessage = `זמן ההמתנה הממוצע כרגע הוא ${averageWaitMinutes} דקות`;

  const menuItemReviewsById = useMemo(() => {
    const map = {};

    firebaseOrders.forEach((order) => {
      const rating = Number(order?.review?.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;

      const reviewedItemIds = Array.isArray(order?.review?.itemIds)
        ? [...new Set(order.review.itemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))]
        : [];

      if (!reviewedItemIds.length) return;

      const entry = {
        orderId: order.id,
        orderNumber: order?.orderNumber ?? null,
        rating,
        comment: typeof order?.review?.comment === "string" ? order.review.comment : "",
        createdAt: order?.review?.createdAt ?? null,
      };

      reviewedItemIds.forEach((itemId) => {
        if (!map[itemId]) map[itemId] = [];
        map[itemId].push(entry);
      });
    });

    return map;
  }, [firebaseOrders]);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        padding: isMobile ? "12px 12px 16px" : "10px 16px 20px",
        boxSizing: "border-box",
        position: "relative",
        overflowX: "clip",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: isDesktop ? 8 : 14,
        }}
      >
        {user?.isAnonymous && (
          <span
            style={{
              padding: isDesktop ? "8px 12px" : "9px 14px",
              borderRadius: "999px",
              background: "#ecfeff",
              border: "1px solid #bae6fd",
              color: "#0f766e",
              fontWeight: 800,
              fontSize: isDesktop ? "13px" : "14px",
              lineHeight: 1.2,
            }}
          >
            לקוח
          </span>
        )}

        {user && !user.isAnonymous && (
          <>
            <span
              style={{
                padding: isDesktop ? "8px 12px" : "9px 14px",
                borderRadius: "999px",
                background: "#f8fafc",
                border: "1px solid #dbe7e4",
                color: "#0f172a",
                fontWeight: 700,
                fontSize: isDesktop ? "13px" : "14px",
                maxWidth: "100%",
                overflowWrap: "anywhere",
                lineHeight: 1.2,
              }}
            >
              {user.email}
            </span>
            <button onClick={logout} style={authBtnStyle(false, isDesktop)}>
              התנתק
            </button>
          </>
        )}

        <button
          onClick={signInAsAdminWithGoogle}
          style={authBtnStyle(true, isDesktop)}
        >
          כניסת אדמין
        </button>

        {(!user || user.isAnonymous) && (
          <button
            onClick={() => {
              setAdminLoginError("");
              setShowAdminEmailLogin(true);
            }}
            style={authBtnStyle(false, isDesktop)}
          >
            כניסה עם אימייל
          </button>
        )}

        {isAdmin && (
          <div
            style={{
              marginInlineStart: "auto",
              padding: isDesktop ? "8px 12px" : "9px 14px",
              borderRadius: "999px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e3a8a",
              fontWeight: 800,
              fontSize: isDesktop ? "13px" : "14px",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            כמה אנשים מחוברים ברגע זה: {connectedCustomersCount}
          </div>
        )}
      </div>

      {showAdminEmailLogin &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.52)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 30,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 380,
                background: "white",
                borderRadius: 20,
                border: "1px solid #dbeafe",
                boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
                padding: 18,
                display: "grid",
                gap: 10,
                direction: "rtl",
                textAlign: "right",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 17 }}>כניסת אדמין עם אימייל</div>

              <input
                type="email"
                autoComplete="username"
                placeholder="אימייל"
                value={adminEmailInput}
                onChange={(e) => setAdminEmailInput(e.target.value)}
                disabled={isAdminLoggingIn}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                  direction: "ltr",
                  textAlign: "right",
                }}
              />

              <input
                type="password"
                autoComplete="current-password"
                placeholder="סיסמה"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                disabled={isAdminLoggingIn}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdminEmailLogin();
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                  direction: "ltr",
                  textAlign: "right",
                }}
              />

              {adminLoginError && (
                <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13 }}>
                  {adminLoginError}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleAdminEmailLogin}
                  disabled={isAdminLoggingIn}
                  style={authBtnStyle(true, isDesktop)}
                >
                  {isAdminLoggingIn ? "מתחבר..." : "התחבר"}
                </button>
                <button
                  onClick={() => {
                    setShowAdminEmailLogin(false);
                    setAdminLoginError("");
                  }}
                  disabled={isAdminLoggingIn}
                  style={authBtnStyle(false, isDesktop)}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <div
        style={{
          position: "sticky",
          top: isMobile ? 8 : 10,
          zIndex: 12,
          display: "flex",
          justifyContent: "center",
          marginBottom: isDesktop ? 10 : 12,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: isDesktop ? 8 : 10,
            flexWrap: isMobile ? "nowrap" : "wrap",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            maxWidth: isDesktop ? 700 : 760,
            padding: isDesktop ? "7px" : "9px",
            borderRadius: "18px",
            background: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(219,231,228,0.9)",
            boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
            backdropFilter: "blur(10px)",
            overflowX: isMobile ? "auto" : "visible",
          }}
        >
          <button
            onClick={() => setScreen("customer")}
            style={navBtn(screen === "customer", isDesktop)}
          >
            לקוח
          </button>
          <button
            onClick={() => setScreen("cashier")}
            style={navBtn(screen === "cashier", isDesktop)}
          >
            קופאי
          </button>
          <button
            onClick={() => setScreen("kitchen")}
            style={navBtn(screen === "kitchen", isDesktop)}
          >
            מטבח
          </button>
          <button
            onClick={() => setScreen("analytics")}
            style={navBtn(screen === "analytics", isDesktop)}
          >
            דוחות
          </button>
          <button
            onClick={() => setScreen("delivery")}
            style={navBtn(screen === "delivery", isDesktop)}
          >
            משלוחים
          </button>
        </div>
      </div>

      <div>
        {screen === "customer" && (
          <CustomerScreen
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerConfirmed={customerConfirmed}
            setCustomerConfirmed={setCustomerConfirmed}
            cart={cart}
            setCart={setCart}
            selectedMods={selectedMods}
            setSelectedMods={setSelectedMods}
            onSendOrder={sendOrder}
            customerOrder={activeCustomerOrder}
            onSubmitReview={submitOrderReview}
            menuRatingsByItemId={menuRatingsByItemId}
            menuItemReviewsById={menuItemReviewsById}
          />
        )}

        {screen === "cashier" &&
          (isAdmin ? (
            <CashierScreen
              orders={firebaseOrders}
              onPay={payOrder}
              onSendToKitchen={sendToKitchen}
            />
          ) : (
            <div
              style={{
                padding: "20px",
                borderRadius: "20px",
                background: "rgba(255,255,255,0.92)",
                border: "1px solid #dbe7e4",
                fontWeight: 700,
              }}
            >
              צריך להתחבר
            </div>
          ))}

        {screen === "kitchen" &&
          (isAdmin ? (
            <KitchenScreen
              orders={firebaseOrders}
              onMarkReady={markReady}
              onMarkDelivered={markDelivered}
              onResetAll={resetKitchenOrders}
            />
          ) : (
            <div
              style={{
                padding: "20px",
                borderRadius: "20px",
                background: "rgba(255,255,255,0.92)",
                border: "1px solid #dbe7e4",
                fontWeight: 700,
              }}
            >
              צריך להתחבר
            </div>
          ))}

        {screen === "analytics" &&
          (isAdmin ? (
            <AnalyticsScreen />
          ) : (
            <div style={{ padding: "20px", borderRadius: "20px", background: "rgba(255,255,255,0.92)", border: "1px solid #dbe7e4", fontWeight: 700 }}>
              צריך להתחבר
            </div>
          ))}

        {screen === "delivery" &&
          (isAdmin ? (
            <DeliveryScreen orders={firebaseOrders} />
          ) : (
            <div style={{ padding: "20px", borderRadius: "20px", background: "rgba(255,255,255,0.92)", border: "1px solid #dbe7e4", fontWeight: 700 }}>
              צריך להתחבר
            </div>
          ))}
      </div>

      {showOrderSuccess && (
        <div
          onClick={() => setShowOrderSuccess(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 30,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "rgba(255,255,255,0.98)",
              border: "1px solid #dbe7e4",
              borderRadius: 22,
              boxShadow: "0 22px 50px rgba(15,23,42,0.18)",
              padding: isMobile ? "18px 16px" : "20px 22px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                color: "#0f172a",
                fontWeight: 700,
                lineHeight: 1.7,
                fontSize: isMobile ? 16 : 17,
                marginBottom: 12,
              }}
            >
              הזמנתך התקבלה והועברה אל צוות המטבח. ברגע שהמנה תהיה מוכנה תקבל התרעה במסך
              ההזמנה.
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <img
                src="/in prep.png"
                alt="בהכנה"
                style={{
                  width: "100%",
                  maxWidth: 210,
                  maxHeight: 150,
                  objectFit: "contain",
                  borderRadius: 14,
                }}
              />
            </div>

            <div
              style={{
                color: "#334155",
                fontWeight: 800,
                fontSize: 15,
                marginBottom: 12,
              }}
            >
              מספר הזמנה: {lastCreatedOrderNumber}
            </div>

            <div
              style={{
                background: waitMessageBg,
                color: waitMessageText,
                borderRadius: 14,
                border: `1px solid ${averageWaitMinutes < 10 ? "#bfdbfe" : "#fecaca"}`,
                padding: isMobile ? "10px 12px" : "11px 14px",
                fontWeight: 800,
                fontSize: isMobile ? 14 : 15,
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              {averageWaitMessage}
            </div>

            <button
              onClick={() => setShowOrderSuccess(false)}
              style={{
                padding: "10px 18px",
                borderRadius: 14,
                border: "1px solid #d7e3df",
                background: "white",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 14,
                boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
              }}
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
