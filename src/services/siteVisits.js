import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const ISRAEL_TIMEZONE = "Asia/Jerusalem";

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

// רושם "כניסה לאתר" ייחודית ליום (לפי תאריך ישראל) עבור המשתמש הנוכחי.
// כתיבה חוזרת של אותו uid באותו יום פשוט מעדכנת (merge) את אותה רשומה -
// כך שספירת המסמכים בטווח תאריכים = מספר המבקרים הייחודיים לכל יום, בלי
// לספור כניסות חוזרות של אותו אדם באותו יום.
export async function logSiteVisit(uid, isAnonymous = true) {
  if (!uid) return;

  const dateKey = getIsraelDateKey();
  const visitRef = doc(db, "siteVisits", `${uid}_${dateKey}`);

  await setDoc(
    visitRef,
    {
      uid,
      dateKey,
      role: isAnonymous ? "customer" : "staff",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
