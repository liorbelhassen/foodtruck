// End-to-end test: real Worker runtime (wrangler dev / workerd) + local D1 +
// Firestore emulator, with Google OAuth and Telegram replaced by a local mock.
// Run: npm test   (needs Java for the Firestore emulator)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const workerDir = join(here, "..");
const repoRoot = join(workerDir, "..");
const PROJECT = "demo-foodtruck";
const EMU = "http://127.0.0.1:8080";
const MOCK_PORT = 8790;
const WORKER_PORT = 8787;
const BOT_TOKEN = "test-bot-token";
const CHAT_ID = "-100777";

const procs = [];
let persistDir;
let mock;
const logs = [];
const telegram = { delivered: [], plan: [] }; // plan: per-request behaviours
let firestoreFailing = false;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA_JSON = JSON.stringify({
  type: "service_account",
  project_id: PROJECT,
  private_key_id: "test-key-id",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  client_email: "orders-notifier@demo-foodtruck.iam.gserviceaccount.com",
  token_uri: "https://oauth2.googleapis.com/token",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function startMock() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const body = await readBody(req);
      if (req.url === "/token") {
        const params = new URLSearchParams(body.toString());
        const [h, c, s] = params.get("assertion").split(".");
        const ok = verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, "base64url"));
        const claims = JSON.parse(Buffer.from(c, "base64url").toString());
        if (!ok || claims.scope !== "https://www.googleapis.com/auth/datastore") {
          res.writeHead(400).end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ access_token: "owner", expires_in: 3600 }));
        return;
      }
      if (req.url.startsWith("/v1/")) {
        if (firestoreFailing) {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }));
          return;
        }
        const r = await fetch(`${EMU}${req.url}`, {
          method: req.method,
          headers: { authorization: req.headers.authorization, "content-type": "application/json" },
          body: req.method === "GET" ? undefined : body,
        });
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      if (req.url === `/bot${BOT_TOKEN}/sendMessage`) {
        const msg = JSON.parse(body.toString());
        assert.equal(msg.chat_id, CHAT_ID);
        const mode = telegram.plan.shift() || "ok";
        if (mode === "500") {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error_code: 500, description: "Internal Server Error" }));
        } else if (mode === "429") {
          res.writeHead(429, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error_code: 429, description: "Too Many Requests: retry after 5", parameters: { retry_after: 5 } }));
        } else if (mode === "slow") {
          // Telegram delivers, but the response never arrives in time.
          telegram.delivered.push({ text: msg.text, at: Date.now() });
          setTimeout(() => res.destroy(), 12000);
        } else {
          telegram.delivered.push({ text: msg.text, at: Date.now() });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, result: { message_id: telegram.delivered.length } }));
        }
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(MOCK_PORT, "127.0.0.1", () => resolve(server));
  });
}

function spawnLogged(cmd, args, opts, sink) {
  const p = spawn(cmd, args, { ...opts, detached: true, env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", ...(opts.env || {}) } });
  const onData = (d) => d.toString().split("\n").forEach((l) => l && sink?.push(l));
  p.stdout.on("data", onData);
  p.stderr.on("data", onData);
  procs.push(p);
  return p;
}

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await sleep(250);
  }
}

// ---- Firestore helpers (emulator, admin bypass) ----
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const docsRoot = `projects/${PROJECT}/databases/(default)/documents`;
let orderSeq = 0;
async function commit(writes) {
  const r = await fetch(`${EMU}/v1/${docsRoot}:commit`, {
    method: "POST",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  assert.equal(r.status, 200, await r.text());
}
// Same shape as createOrder() in src/services/orders.js
async function createOrder(overrides = {}) {
  orderSeq += 1;
  const id = `order${String(orderSeq).padStart(3, "0")}x${Math.random().toString(36).slice(2, 8)}`;
  const order = {
    customerName: "דנה כהן",
    paymentRequested: "bit",
    paymentActual: null,
    paymentMethod: null,
    notifiedReady: false,
    status: "new",
    total: 43,
    items: [
      { id: 1, name: "יאגנוב המבורגר + צ'יפס + קוקה קולה", price: 43, allowsToppings: true, drinkType: "coke", mods: ["noOnion", "noLettuce"] },
    ],
    orderNumber: orderSeq,
    orderDateKey: "2026-11-12",
    createdAtClient: Date.now(),
    sentToKitchenAt: null,
    readyAt: null,
    deliveryTime: null,
    deliveryAddress: null,
    deliveryCity: null,
    deliveryPhone: null,
    pickupTime: "19:30",
    deliveryFee: null,
    ...overrides,
  };
  await commit([
    {
      update: { name: `${docsRoot}/orders/${id}`, fields: enc(order).mapValue.fields },
      updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
    },
  ]);
  return id;
}
async function updateOrder(id, fields) {
  await commit([
    {
      update: { name: `${docsRoot}/orders/${id}`, fields: enc(fields).mapValue.fields },
      updateMask: { fieldPaths: Object.keys(fields) },
    },
  ]);
}

// ---- Worker helpers ----
function runCount() {
  return logs.filter((l) => l.includes('"event":"run"') || l.includes('"event":"skipped_locked"')).length;
}
function lastRuns(n) {
  return logs
    .filter((l) => l.includes('"event":"run"') || l.includes('"event":"skipped_locked"'))
    .slice(-n)
    .map((l) => JSON.parse(l.slice(l.indexOf("{"), l.lastIndexOf("}") + 1)));
}
// wrangler dev ignores ?time=, so tests wait in real time (retry base is 2s here).
async function trigger({ waitMs = 0, parallel = 1 } = {}) {
  if (waitMs) await sleep(waitMs);
  const before = runCount();
  await Promise.all(
    Array.from({ length: parallel }, () =>
      fetch(`http://127.0.0.1:${WORKER_PORT}/__scheduled?cron=*+*+*+*+*`).then((r) => r.text())
    )
  );
  await waitFor(() => runCount() >= before + parallel, 90000, "worker run");
  return lastRuns(parallel);
}
function db() {
  const dir = join(persistDir, "v3", "d1", "miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find((f) => f.endsWith(".sqlite"));
  return new DatabaseSync(join(dir, file), { readOnly: true });
}
function row(orderId) {
  const d = db();
  try {
    return d.prepare("SELECT * FROM notifications WHERE order_id = ?").get(orderId);
  } finally {
    d.close();
  }
}
function stateValue(key) {
  const d = db();
  try {
    return d.prepare("SELECT value FROM state WHERE key = ?").get(key)?.value ?? null;
  } finally {
    d.close();
  }
}

before(async () => {
  mock = await startMock();
  spawnLogged(
    "npx",
    ["firebase", "--config", "e2e/firebase.json", "emulators:start", "--only", "firestore", "--project", PROJECT],
    { cwd: repoRoot },
    []
  );
  await waitFor(() => fetch(EMU).then(() => true).catch(() => false), 90000, "firestore emulator");
  await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });

  persistDir = mkdtempSync(join(tmpdir(), "tg-worker-"));
  const vars = {
    FIREBASE_PROJECT_ID: PROJECT,
    FIRESTORE_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/v1`,
    GOOGLE_TOKEN_URL: `http://127.0.0.1:${MOCK_PORT}/token`,
    TELEGRAM_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_CHAT_ID: CHAT_ID,
    GCP_SERVICE_ACCOUNT_JSON: SA_JSON,
    RETRY_BASE_MS: "2000",
  };
  const varArgs = Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]);
  spawnLogged(
    "npx",
    ["wrangler", "dev", "--test-scheduled", "--port", String(WORKER_PORT), "--persist-to", persistDir, "--show-interactive-dev-session=false", ...varArgs],
    { cwd: workerDir },
    logs
  );
  // Wait for "Ready" without an HTTP request: any request starts the minute alarm,
  // which is only wanted in the last test.
  await waitFor(() => logs.some((l) => l.includes("Ready on")), 90000, "wrangler dev");
});

after(async () => {
  if (process.env.WORKER_LOG) writeFileSync(process.env.WORKER_LOG, logs.join("\n"));
  // Kill whole process groups (npx -> node -> workerd / java).
  for (const p of procs) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  mock?.close();
  await sleep(2000);
  if (persistDir) rmSync(persistDir, { recursive: true, force: true });
});

let orderA;

test("first run starts from now and does not send order history", async () => {
  await createOrder({ customerName: "היסטוריה ישנה" });
  const [run] = await trigger();
  assert.equal(run.initialized, true);
  await sleep(500);
  assert.equal(telegram.delivered.length, 0);
});

test("new order (payment not yet confirmed) is sent once with all details", async () => {
  orderA = await createOrder({
    customerName: "דנה כהן",
    total: 107,
    deliveryFee: 7,
    deliveryCity: "אליאב",
    deliveryAddress: "הזית 3",
    deliveryTime: "20:00",
    deliveryPhone: "050-0000000",
    pickupTime: null,
    paymentRequested: "bit",
    items: [
      { id: 1, name: "יאגנוב המבורגר + צ'יפס + קוקה קולה", price: 43, allowsToppings: true, drinkType: "coke", mods: ["noOnion", "noLettuce"] },
      { id: 1, name: "יאגנוב המבורגר + צ'יפס + קוקה קולה", price: 43, allowsToppings: true, drinkType: "coke", mods: ["noLettuce", "noOnion"] },
      { id: 5, name: "צ'יפס", price: 8, allowsToppings: false, mods: [] },
      { id: 2, name: "המבורגר", price: 35, allowsToppings: true, mods: [] },
    ],
  });
  const [run] = await trigger();
  assert.equal(run.enqueued, 1);
  assert.equal(run.sent, 1);
  assert.equal(telegram.delivered.length, 1);
  const text = telegram.delivered[0].text;
  console.log(`--- sample message ---\n${text}\n----------------------`);
  assert.match(text, /הזמנה חדשה #2/);
  assert.match(text, /לקוח: דנה כהן/);
  assert.match(text, /2× יאגנוב המבורגר \+ צ'יפס \+ קוקה קולה/);
  assert.match(text, /\+בצל, חסה · 🥤 קוקה קולה/);
  assert.match(text, /1× המבורגר\n {3}ללא תוספות/);
  assert.match(text, /1× צ'יפס/);
  assert.match(text, /משלוח: אליאב · הזית 3 · 20:00/);
  assert.match(text, /הערות: אין/);
  assert.match(text, /סכום: ₪107 \(כולל משלוח ₪7\)/);
  assert.match(text, /אמצעי תשלום שנבחר: Bit/);
  assert.match(text, /תשלום: טרם אושר/);
  assert.doesNotMatch(text, /שולם|אושר בקופה/);
  assert.doesNotMatch(text, /050-0000000/);
  const created = new Date(row(orderA).order_created_at);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(created);
  assert.ok(text.includes(`🕒 ${hhmm} · `), `expected Israel time ${hhmm}`);
  assert.ok(!text.includes("היסטוריה ישנה"));
  assert.equal(row(orderA).status, "sent");
  assert.equal(row(orderA).message, null, "PII text is cleared after sending");
});

test("status/payment changes do not trigger another notification", async () => {
  await updateOrder(orderA, { status: "paid", paymentActual: "bit", paymentMethod: "bit" });
  await trigger({ waitMs: 0 });
  await updateOrder(orderA, { status: "in_progress" });
  await trigger({ waitMs: 2500 });
  await updateOrder(orderA, { status: "ready" });
  await trigger({ waitMs: 2500 });
  assert.equal(telegram.delivered.length, 1);
});

test("repeated / overlapping cron events do not duplicate", async () => {
  const id = await createOrder({ customerName: "כפילות" });
  const runs = await trigger({ waitMs: 0, parallel: 3 });
  await trigger({ waitMs: 0 });
  await trigger({ waitMs: 0 });
  const matching = telegram.delivered.filter((m) => m.text.includes("כפילות"));
  assert.equal(matching.length, 1, JSON.stringify(runs));
  assert.equal(row(id).attempts, 1);
});

test("Telegram 5xx: order is kept and retried with backoff, not skipped", async () => {
  telegram.plan.push("500");
  const id = await createOrder({ customerName: "כשל טלגרם" });
  const [r1] = await trigger({ waitMs: 0 });
  assert.equal(r1.failed, 1);
  assert.equal(row(id).status, "pending");
  assert.match(row(id).last_error, /HTTP 500/);
  const [r2] = await trigger({ waitMs: 0 });
  assert.equal(r2.due, 0, "not retried before backoff");
  await trigger({ waitMs: 2500 });
  const matching = telegram.delivered.filter((m) => m.text.includes("כשל טלגרם"));
  assert.equal(matching.length, 1);
  assert.ok(!matching[0].text.startsWith("🔁"), "definite failure is not flagged as possible duplicate");
  assert.equal(row(id).status, "sent");
});

test("Telegram 429 pauses the whole queue for retry_after, then keeps order", async () => {
  telegram.plan.push("429");
  const c = await createOrder({ customerName: "קצב ג" });
  const d = await createOrder({ customerName: "קצב ד" });
  const [r1] = await trigger({ waitMs: 0 });
  assert.equal(r1.failed, 1);
  assert.equal(r1.sent, 0, "stops after 429");
  const [r2] = await trigger({ waitMs: 0 });
  assert.ok(r2.rateLimitedUntil, "queue paused");
  await trigger({ waitMs: 6500 });
  const names = telegram.delivered.map((m) => m.text).filter((t) => t.includes("קצב"));
  assert.equal(names.length, 2);
  assert.ok(names[0].includes("קצב ג") && names[1].includes("קצב ד"), "original order kept");
  assert.equal(row(c).status, "sent");
  assert.equal(row(d).status, "sent");
});

test("Firestore outage: cursor does not move and orders from the outage are sent after recovery", async () => {
  const cursorBefore = stateValue("cursor_ms");
  firestoreFailing = true;
  const id = await createOrder({ customerName: "בזמן תקלה" });
  const [r1] = await trigger({ waitMs: 2500 });
  assert.match(r1.ingestError, /HTTP 503/);
  await trigger({ waitMs: 2500 });
  assert.equal(stateValue("cursor_ms"), cursorBefore);
  assert.match(stateValue("last_ingest_error"), /503/);
  firestoreFailing = false;
  const [r3] = await trigger({ waitMs: 2500 });
  assert.equal(r3.enqueued, 1);
  assert.equal(telegram.delivered.filter((m) => m.text.includes("בזמן תקלה")).length, 1);
  assert.equal(row(id).status, "sent");
  assert.equal(stateValue("last_ingest_error"), null);
});

test("ambiguous Telegram timeout is retried and flagged as a possible duplicate", async () => {
  telegram.plan.push("slow");
  const id = await createOrder({ customerName: "תשובה אבדה" });
  const [r1] = await trigger({ waitMs: 0 });
  assert.equal(r1.failed, 1);
  assert.equal(row(id).maybe_delivered, 1);
  await trigger({ waitMs: 2500 });
  const matching = telegram.delivered.filter((m) => m.text.includes("תשובה אבדה"));
  assert.equal(matching.length, 2, "documented duplicate case");
  assert.ok(matching[1].text.startsWith("🔁"));
  assert.equal(row(id).status, "sent");
});

test("payment shown as confirmed only when paymentActual exists; family meal lines", async () => {
  await createOrder({
    customerName: "משפחה",
    total: 150,
    paymentRequested: "paybox",
    paymentActual: "paybox",
    status: "paid",
    items: [
      {
        id: 7,
        name: "מבצע משפחתי - x4 יאגנוב המבורגר",
        price: 150,
        allowsToppings: false,
        mods: ["family:x"],
        familyMeals: [
          { mealNumber: 1, mods: ["noOnion"], drinkKey: "sprite", drinkLabel: "ספרייט" },
          { mealNumber: 2, mods: [], drinkKey: "coke", drinkLabel: "קוקה קולה" },
        ],
      },
    ],
  });
  await createOrder({ customerName: "בלי תשלום", paymentRequested: null });
  await trigger({ waitMs: 0 });
  await trigger({ waitMs: 0 });
  const fam = telegram.delivered.find((m) => m.text.includes("משפחה")).text;
  assert.match(fam, /מנה 1: \+בצל · 🥤 ספרייט/);
  assert.match(fam, /מנה 2: ללא תוספות · 🥤 קוקה קולה/);
  assert.match(fam, /תשלום אושר בקופה \(PayBox\)/);
  assert.match(fam, /איסוף עצמי · 19:30/);
  const none = telegram.delivered.find((m) => m.text.includes("בלי תשלום")).text;
  assert.match(none, /אמצעי תשלום שנבחר: לא נבחר/);
  assert.match(none, /טרם אושר/);
});

test("burst of 17 orders: at most 15 per run, ~1/s, none lost", async () => {
  const before = telegram.delivered.length;
  for (let i = 0; i < 17; i += 1) await createOrder({ customerName: `עומס ${i}` });
  const [r1] = await trigger({ waitMs: 0 });
  assert.equal(r1.enqueued, 17);
  assert.equal(r1.sent, 15);
  const batch = telegram.delivered.slice(before);
  for (let i = 1; i < batch.length; i += 1) assert.ok(batch[i].at - batch[i - 1].at >= 1000);
  const [r2] = await trigger({ waitMs: 2500 });
  assert.equal(r2.sent, 2);
  assert.equal(telegram.delivered.filter((m) => m.text.includes("עומס")).length, 17);
});

test("closed cashier: the Durable Object alarm keeps running every minute and survives a failing run", async () => {
  // No browser and no cron: one request books the alarm, then it re-arms itself.
  const r = await fetch(`http://127.0.0.1:${WORKER_PORT}/test`);
  assert.equal(r.status, 404, "temporary /test route is gone");
  await waitFor(() => logs.some((l) => l.includes('"event":"alarm_started"')), 10000, "alarm start");
  const runsAt = () => lastRuns(1000).filter((x) => x.event === "run").map((x) => x.now);
  const base = runsAt().length;
  await waitFor(() => runsAt().length >= base + 1, 15000, "first alarm run");
  firestoreFailing = true;
  await waitFor(() => runsAt().length >= base + 2, 75000, "alarm run during outage");
  firestoreFailing = false;
  const id = await createOrder({ customerName: "קופה סגורה" });
  await waitFor(() => runsAt().length >= base + 3, 75000, "alarm run after the failed run");
  const times = runsAt().slice(base);
  assert.ok(times[2] - times[1] >= 55000 && times[2] - times[1] <= 65000, `~1 min apart: ${times}`);
  const failedRun = lastRuns(1000).filter((x) => x.event === "run")[base + 1];
  assert.match(failedRun.ingestError || "", /503/);
  await waitFor(() => row(id)?.status === "sent", 75000, "order sent by alarm");
  assert.equal(telegram.delivered.filter((m) => m.text.includes("קופה סגורה")).length, 1);
});
