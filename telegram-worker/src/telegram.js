const DEFAULT_API = "https://api.telegram.org";
const FETCH_TIMEOUT_MS = 10000;

/**
 * Returns { ok: true, messageId } or
 * { ok: false, definite, status, retryAfterMs, error }.
 * `definite: false` means the request may have reached Telegram (network
 * error / timeout), so a retry can produce a duplicate message.
 */
export async function sendTelegramMessage(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, definite: true, status: 0, error: "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing" };
  }
  const base = env.TELEGRAM_API_BASE || DEFAULT_API;
  let res;
  try {
    res = await fetch(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    // Never include the request URL: it contains the bot token.
    return { ok: false, definite: false, status: 0, error: `network: ${err?.name || "error"}` };
  }
  const data = await res.json().catch(() => null);
  if (res.ok && data?.ok) return { ok: true, messageId: data.result?.message_id ?? null };
  const retryAfterSec = Number(data?.parameters?.retry_after);
  return {
    ok: false,
    // A 5xx without a Telegram JSON body could come from a proxy after delivery.
    definite: !!data,
    status: res.status,
    retryAfterMs: Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : null,
    error: `HTTP ${res.status} ${String(data?.description || "").slice(0, 200)}`.trim(),
  };
}
