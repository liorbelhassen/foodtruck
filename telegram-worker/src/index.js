import { SCHEMA } from "./schema.js";
import { queryOrdersCreatedSince } from "./firestore.js";
import { formatOrderMessage } from "./format.js";
import { sendTelegramMessage } from "./telegram.js";

// Cron runs every minute. Each run: (1) pull new orders from Firestore into the
// D1 queue, (2) send due queue rows to Telegram. Both steps are idempotent.
//
// Dedup is by Firestore document id (notifications.order_id). A duplicate
// Telegram message is still possible only when Telegram may have accepted a
// message but we never learned it: a network error/timeout on sendMessage, or
// the run dying between sendMessage and the D1 "sent" update. Those rows get
// maybe_delivered = 1 and the retry is prefixed with DUPLICATE_NOTE.
const PAGE_SIZE = 50;
const MAX_PAGES_PER_RUN = 4;
// Firestore sets createdAt (request time) slightly before the write becomes
// visible, so each query re-reads this window; duplicates are dropped by doc id.
const SAFETY_WINDOW_MS = 60 * 1000;
const LOCK_MS = 4 * 60 * 1000;
const MAX_SENDS_PER_RUN = 15; // Telegram groups allow ~20 messages/minute
const SEND_GAP_MS = 1100; // ~1 message/second per chat
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;
const KEEP_SENT_MS = 30 * 24 * 60 * 60 * 1000;
const DUPLICATE_NOTE = "🔁 ייתכן שהודעה זו כבר נשלחה (שליחה חוזרת אחרי תקלה)\n\n";

let schemaReady = false;

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  schemaReady = true;
}

async function getState(db, key) {
  const row = await db.prepare("SELECT value FROM state WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

function setStateStmt(db, key, value, now) {
  return db
    .prepare(
      "INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(key, value == null ? null : String(value), now);
}

async function acquireLock(db, holder, now) {
  const res = await db
    .prepare(
      "INSERT INTO locks (name, holder, until) VALUES ('run', ?1, ?2) ON CONFLICT(name) DO UPDATE SET holder = ?1, until = ?2 WHERE locks.until < ?3"
    )
    .bind(holder, now + LOCK_MS, now)
    .run();
  return (res.meta?.changes || 0) > 0;
}

async function releaseLock(db, holder) {
  await db.prepare("UPDATE locks SET until = 0 WHERE name = 'run' AND holder = ?").bind(holder).run();
}

function backoffMs(attempts, baseMs = BACKOFF_BASE_MS) {
  return Math.min(BACKOFF_MAX_MS, baseMs * 2 ** Math.max(0, attempts - 1));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ingestNewOrders(env, now) {
  const db = env.DB;
  const cursorRaw = await getState(db, "cursor_ms");
  if (cursorRaw == null) {
    // First run: start from now, do not replay order history.
    await setStateStmt(db, "cursor_ms", now, now).run();
    console.log(JSON.stringify({ event: "initialized", cursorMs: now }));
    return { initialized: true, enqueued: 0 };
  }
  const cursor = Number(cursorRaw);
  let startAfter = null;
  let enqueued = 0;
  let newCursor = cursor;

  for (let page = 0; page < MAX_PAGES_PER_RUN; page += 1) {
    const { docs, readTimeMs } = await queryOrdersCreatedSince(env, {
      fromMs: cursor,
      startAfter,
      limit: PAGE_SIZE,
    });
    const valid = docs.filter((d) => Number.isFinite(d.createdAtMs));
    if (valid.length) {
      const stmts = valid.map((d) =>
        db
          .prepare(
            `INSERT INTO notifications (order_id, order_number, order_date_key, order_created_at, message, status, attempts, next_attempt_at, enqueued_at)
             VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?) ON CONFLICT(order_id) DO NOTHING`
          )
          .bind(
            d.id,
            Number.isFinite(d.data.orderNumber) ? d.data.orderNumber : null,
            d.data.orderDateKey || null,
            d.createdAtMs,
            formatOrderMessage(d.data, d.createdAtMs),
            now,
            now
          )
      );
      const results = await db.batch(stmts);
      enqueued += results.reduce((n, r) => n + (r.meta?.changes || 0), 0);
    }

    if (docs.length < PAGE_SIZE) {
      // Everything created before (readTime - window) has been seen.
      const safe = (readTimeMs ?? now) - SAFETY_WINDOW_MS;
      newCursor = Math.max(newCursor, safe);
      break;
    }
    const last = docs[docs.length - 1];
    startAfter = { createdAtIso: last.createdAtIso, name: last.name };
    // More pages remain; resume from the last seen createdAt next run if we stop here.
    newCursor = Math.max(newCursor, last.createdAtMs);
  }

  if (newCursor !== cursor) await setStateStmt(db, "cursor_ms", Math.floor(newCursor), now).run();
  return { initialized: false, enqueued };
}

export async function sendDueNotifications(env, now) {
  const db = env.DB;
  const startedAt = Date.now();
  const clock = () => now + (Date.now() - startedAt);
  // After a Telegram 429 the whole chat is rate limited, not just one message.
  const blockedUntil = Number(await getState(db, "telegram_retry_at")) || 0;
  if (blockedUntil > now) return { due: 0, sent: 0, failed: 0, rateLimitedUntil: blockedUntil };
  const { results: due } = await db
    .prepare(
      `SELECT order_id, message, status, attempts, maybe_delivered FROM notifications
       WHERE status IN ('pending', 'sending') AND next_attempt_at <= ?
       ORDER BY order_created_at, order_id LIMIT ?`
    )
    .bind(now, MAX_SENDS_PER_RUN)
    .all();

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < due.length; i += 1) {
    const row = due[i];
    if (i > 0) await sleep(SEND_GAP_MS);
    // A row still 'sending' means an earlier run died after (maybe) calling Telegram.
    const maybeDelivered = row.maybe_delivered === 1 || row.status === "sending";
    const attempts = row.attempts + 1;
    const claimedAt = clock();
    await db
      .prepare(
        "UPDATE notifications SET status = 'sending', attempts = ?, claimed_at = ?, maybe_delivered = ? WHERE order_id = ?"
      )
      .bind(attempts, claimedAt, maybeDelivered ? 1 : 0, row.order_id)
      .run();

    const text = (maybeDelivered ? DUPLICATE_NOTE : "") + (row.message || "");
    const result = await sendTelegramMessage(env, text);
    const doneAt = clock();

    if (result.ok) {
      await db
        .prepare(
          "UPDATE notifications SET status = 'sent', sent_at = ?, telegram_message_id = ?, message = NULL, last_error = NULL WHERE order_id = ?"
        )
        .bind(doneAt, result.messageId, row.order_id)
        .run();
      sent += 1;
      continue;
    }

    failed += 1;
    const delay = result.retryAfterMs != null ? result.retryAfterMs + 1000 : backoffMs(attempts, Number(env.RETRY_BASE_MS) || BACKOFF_BASE_MS);
    await db
      .prepare(
        "UPDATE notifications SET status = 'pending', next_attempt_at = ?, last_error = ?, maybe_delivered = ? WHERE order_id = ?"
      )
      .bind(doneAt + delay, result.error, maybeDelivered || !result.definite ? 1 : 0, row.order_id)
      .run();
    if (result.retryAfterMs != null) await setStateStmt(db, "telegram_retry_at", doneAt + delay, doneAt).run();
    console.warn(JSON.stringify({ event: "send_failed", orderId: row.order_id, attempts, error: result.error }));
    // 400 is specific to this message; anything else (429, auth, 5xx, network)
    // would fail for the rest too, so stop for this run.
    if (result.status !== 400) break;
  }
  return { due: due.length, sent, failed };
}

export async function runOnce(env, now = Date.now()) {
  const db = env.DB;
  await ensureSchema(db);
  const holder = crypto.randomUUID();
  if (!(await acquireLock(db, holder, now))) {
    console.log(JSON.stringify({ event: "skipped_locked" }));
    return { skipped: true };
  }
  const summary = { skipped: false };
  try {
    try {
      Object.assign(summary, await ingestNewOrders(env, now));
      await setStateStmt(db, "last_ingest_error", null, now).run();
    } catch (err) {
      // Cursor was not advanced, so nothing is skipped; next run retries.
      summary.ingestError = String(err?.message || err);
      await setStateStmt(db, "last_ingest_error", summary.ingestError, now).run();
      console.error(JSON.stringify({ event: "ingest_failed", error: summary.ingestError }));
    }
    Object.assign(summary, await sendDueNotifications(env, now));
    if (new Date(now).getUTCMinutes() === 0) {
      await db
        .prepare("DELETE FROM notifications WHERE status = 'sent' AND sent_at < ?")
        .bind(now - KEEP_SENT_MS)
        .run();
    }
    await setStateStmt(db, "last_run_at", now, now).run();
  } finally {
    await releaseLock(db, holder);
  }
  console.log(JSON.stringify({ event: "run", now, ...summary }));
  return summary;
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runOnce(env));
  },
  async fetch() {
    // The temporary /test route was removed; the Worker is driven by its Cron Trigger.
    return new Response("Not found", { status: 404 });
  },
};
