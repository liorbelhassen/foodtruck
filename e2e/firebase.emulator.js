// Drop-in replacement for src/firebase.js used only by the E2E build:
// talks to local Firebase emulators (demo project), never to production.
import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";

export const firebaseConfig = {
  apiKey: "demo-key",
  authDomain: "demo-foodtruck.firebaseapp.com",
  projectId: "demo-foodtruck",
  storageBucket: "demo-foodtruck.appspot.com",
  messagingSenderId: "0",
  appId: "demo-app",
  databaseURL: "http://127.0.0.1:9000/?ns=demo-foodtruck",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectDatabaseEmulator(rtdb, "127.0.0.1", 9000);
