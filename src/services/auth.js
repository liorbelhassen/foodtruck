import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { auth } from "../firebase";

const googleProvider = new GoogleAuthProvider();

export async function ensureAnonymousAuth() {
  // אם כבר יש משתמש — לא עושים כלום
  if (auth.currentUser) return auth.currentUser;

  const result = await signInAnonymously(auth);
  return result.user;
}

export async function signInAsAdminWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// כניסת אדמין/סגן מנהל עם אימייל וסיסמה (המשתמש נוצר מראש בקונסולת Firebase).
export async function signInAsAdminWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function logout() {
  await signOut(auth);
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}