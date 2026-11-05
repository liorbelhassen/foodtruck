import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

// מסמך יחיד עם מפה של מוצרים שחסרים במלאי: { soldOut: { "menu-1": true, "drink-fuzetea": false } }
const inventoryRef = doc(db, "inventory", "status");

export function subscribeToInventory(callback) {
  return onSnapshot(
    inventoryRef,
    (snap) => callback(snap.data()?.soldOut || {}),
    (error) => {
      console.error("Inventory subscription failed:", error);
      callback({});
    }
  );
}

export async function setSoldOutInFirebase(stockKey, soldOut) {
  await setDoc(inventoryRef, { soldOut: { [stockKey]: soldOut } }, { merge: true });
}
