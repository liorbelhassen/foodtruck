import { ADMIN, EMULATORS, PROJECT_ID } from "./constants.js";

export default async function globalSetup() {
  await fetch(
    `${EMULATORS.firestore}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  await fetch(`${EMULATORS.auth}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });

  const res = await fetch(
    `${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ADMIN, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`Could not create admin user in auth emulator: ${await res.text()}`);
}
