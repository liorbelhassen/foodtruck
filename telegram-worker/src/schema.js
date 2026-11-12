// D1 schema, applied idempotently once per isolate (no separate migration step).
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS locks (
    name TEXT PRIMARY KEY,
    holder TEXT NOT NULL,
    until INTEGER NOT NULL
  )`,
  // One row per Firestore order document id: the primary key is what prevents
  // duplicate notifications (the daily orderNumber is not unique).
  `CREATE TABLE IF NOT EXISTS notifications (
    order_id TEXT PRIMARY KEY,
    order_number INTEGER,
    order_date_key TEXT,
    order_created_at INTEGER NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    claimed_at INTEGER,
    maybe_delivered INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    telegram_message_id INTEGER,
    enqueued_at INTEGER NOT NULL,
    sent_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_due ON notifications (status, next_attempt_at)`,
];
