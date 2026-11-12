// Minimal Firestore REST client authenticated as a Google service account.
// Only the `datastore` OAuth scope is requested; the account itself should
// hold a read-only role (see README).

const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_FIRESTORE_BASE = "https://firestore.googleapis.com/v1";
const SCOPE = "https://www.googleapis.com/auth/datastore";
const FETCH_TIMEOUT_MS = 15000;

let cachedToken = null; // { token, expiresAt, keyId }
let cachedKey = null; // { pem, key }

export class FirestoreError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function parseServiceAccount(raw) {
  if (!raw) throw new FirestoreError("GCP_SERVICE_ACCOUNT_JSON secret is missing", 0);
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new FirestoreError("GCP_SERVICE_ACCOUNT_JSON is not valid JSON", 0);
  }
  if (!sa.client_email || !sa.private_key) {
    throw new FirestoreError("GCP_SERVICE_ACCOUNT_JSON lacks client_email/private_key", 0);
  }
  return {
    clientEmail: sa.client_email,
    privateKey: String(sa.private_key).replace(/\\n/g, "\n"),
    privateKeyId: sa.private_key_id || undefined,
    projectId: sa.project_id,
  };
}

function base64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem) {
  if (cachedKey?.pem === pem) return cachedKey.key;
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  cachedKey = { pem, key };
  return key;
}

export function resetAuthCache() {
  cachedToken = null;
}

async function getAccessToken(env, sa, nowMs) {
  const cacheId = `${sa.clientEmail}:${sa.privateKeyId || ""}`;
  if (cachedToken && cachedToken.cacheId === cacheId && cachedToken.expiresAt - 60000 > nowMs) {
    return cachedToken.token;
  }
  const tokenUrl = env.GOOGLE_TOKEN_URL || DEFAULT_TOKEN_URL;
  const iat = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT", ...(sa.privateKeyId ? { kid: sa.privateKeyId } : {}) };
  const claims = { iss: sa.clientEmail, scope: SCOPE, aud: DEFAULT_TOKEN_URL, iat, exp: iat + 3600 };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(sa.privateKey);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new FirestoreError(`token exchange failed: HTTP ${res.status} ${data.error || ""}`.trim(), res.status);
  }
  cachedToken = {
    cacheId,
    token: data.access_token,
    expiresAt: nowMs + (Number(data.expires_in) || 3600) * 1000,
  };
  return cachedToken.token;
}

export function decodeValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const [k, val] of Object.entries(fields || {})) out[k] = decodeValue(val);
  return out;
}

/**
 * Orders with createdAt >= fromMs (or strictly after `startAfter`), oldest first.
 * Uses only the automatic single-field index on createdAt.
 */
export async function queryOrdersCreatedSince(env, { fromMs, startAfter, limit }) {
  const sa = parseServiceAccount(env.GCP_SERVICE_ACCOUNT_JSON);
  const projectId = env.FIREBASE_PROJECT_ID || sa.projectId;
  const base = env.FIRESTORE_BASE_URL || DEFAULT_FIRESTORE_BASE;
  const docsRoot = `projects/${projectId}/databases/(default)/documents`;
  const token = await getAccessToken(env, sa, Date.now());

  const structuredQuery = {
    from: [{ collectionId: "orders" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "createdAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { timestampValue: new Date(fromMs).toISOString() },
      },
    },
    orderBy: [
      { field: { fieldPath: "createdAt" }, direction: "ASCENDING" },
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
    ],
    limit,
  };
  if (startAfter) {
    structuredQuery.startAt = {
      values: [
        { timestampValue: startAfter.createdAtIso },
        { referenceValue: startAfter.name },
      ],
      before: false,
    };
  }

  const res = await fetch(`${base}/${docsRoot}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401) resetAuthCache();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      detail = JSON.parse(text)?.error?.status || "";
    } catch {
      /* ignore */
    }
    throw new FirestoreError(`runQuery failed: HTTP ${res.status} ${detail}`.trim(), res.status);
  }
  const rows = await res.json();
  let readTimeMs = null;
  const docs = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.readTime && readTimeMs == null) readTimeMs = Date.parse(row.readTime);
    if (!row.document) continue;
    const name = row.document.name;
    const createdAtIso = row.document.fields?.createdAt?.timestampValue;
    docs.push({
      id: name.split("/").pop(),
      name,
      createdAtIso,
      createdAtMs: Date.parse(createdAtIso),
      data: decodeFields(row.document.fields),
    });
  }
  return { docs, readTimeMs };
}
