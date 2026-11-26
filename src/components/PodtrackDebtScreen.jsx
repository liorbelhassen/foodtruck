import { useEffect, useState } from "react";
import { THEME, CARD_BG } from "./customer/customerConstants.js";

// Public, login-free page reached only via #/podtrack-debt. Read-only: fetches the public
// PodTrack sheet on every load. Debt = sum of column H in "הוצאות"; cash = sum of column H in "הכנסות ומאזן".
const SHEET_ID = "1-1DAHzfF8sz3M_HChFw8JO_UlhVs-5BsU1pj4h2nHLA";
const DEBT_TAB = "הוצאות";
const CASH_TAB = "הכנסות ומאזן";

const sheetUrl = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}&_=${Date.now()}`;

const toNumber = (cell) => {
  const v = cell?.v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/[₪,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const text = (cell) => (cell?.f ?? cell?.v ?? "").toString().trim();

// gviz wraps the JSON in `google.visualization.Query.setResponse(...)`.
function parseTable(body) {
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("תגובה לא צפויה מהגיליון");
  const data = JSON.parse(body.slice(start, end + 1));
  if (data.status === "error") throw new Error(data.errors?.[0]?.message || "שגיאה בקריאת הגיליון");
  if (!data.table) throw new Error("הגיליון ריק");
  return data.table;
}

const roundCents = (n) => Math.round(n * 100) / 100;

function columnH(table) {
  const H = table.cols.findIndex((c) => c.id === "H");
  if (H < 0) throw new Error("עמודה H לא נמצאה בגיליון");
  return H;
}

async function fetchTable(tab) {
  const r = await fetch(sheetUrl(tab), { cache: "no-store" });
  if (!r.ok) throw new Error(`הגיליון החזיר שגיאה (${r.status})`);
  return parseTable(await r.text());
}

function parseCash(table) {
  const H = columnH(table);
  return roundCents((table.rows || []).reduce((s, r) => s + (toNumber(r.c?.[H]) ?? 0), 0));
}

function parseDebt(table) {
  const col = (id) => table.cols.findIndex((c) => c.id === id);
  const [A, B, E, G] = ["A", "B", "E", "G"].map(col);
  const H = columnH(table);
  const rows = [];
  for (const r of table.rows || []) {
    const c = r.c || [];
    const amount = toNumber(c[H]);
    if (amount == null) continue;
    rows.push({ item: text(c[A]), details: text(c[B]), date: text(c[E]), status: text(c[G]), amount });
  }
  const total = roundCents(rows.reduce((s, r) => s + r.amount, 0));
  return { total, rows };
}

const fmtIls = (n) => `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cell = { padding: "10px 12px", borderBottom: `1px solid ${THEME.borderSoft}`, textAlign: "right" };
const head = { ...cell, color: THEME.textMuted, fontWeight: 700, fontSize: 13, background: THEME.surfaceAlt };
const amountCell = { ...cell, textAlign: "left", direction: "ltr", whiteSpace: "nowrap", fontWeight: 700 };

export default function PodtrackDebtScreen() {
  const [state, setState] = useState({ loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "PodTrack — חוב פתוח לליאור";
    return () => { document.title = prevTitle; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const errMsg = (e) => e?.message || "טעינת הנתונים נכשלה";
    Promise.allSettled([fetchTable(DEBT_TAB).then(parseDebt), fetchTable(CASH_TAB).then(parseCash)]).then(([debt, cash]) => {
      if (cancelled) return;
      setState({
        data: debt.status === "fulfilled" ? debt.value : null,
        error: debt.status === "rejected" ? errMsg(debt.reason) : null,
        cash: cash.status === "fulfilled" ? cash.value : null,
        cashError: cash.status === "rejected" ? errMsg(cash.reason) : null,
        at: new Date(),
      });
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => { setState({ loading: true }); setReloadKey((k) => k + 1); };
  const { loading, error, data, cash, cashError, at } = state;
  const retryBtn = <button onClick={reload} style={{ background: THEME.accent, color: "white", border: 0, borderRadius: 999, padding: "8px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>נסה שוב</button>;
  const updated = at && <div style={{ color: THEME.textMuted, fontSize: 12, marginTop: 10 }}>עודכן: {at.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</div>;

  return (
    <div dir="rtl" lang="he" style={{ minHeight: "100vh", padding: "32px 16px", background: "white", color: THEME.text, textAlign: "right", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, color: THEME.text }}>מצב פיננסי PodTrack — חוב פתוח לליאור</h1>
        <p style={{ color: THEME.textSoft, fontSize: 14, margin: "0 0 24px" }}>הנתונים נטענים ישירות מהגיליון בכל רענון של העמוד.</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 240px", background: CARD_BG, border: `1px solid ${THEME.border}`, borderRadius: 18, padding: "28px 24px", textAlign: "center" }}>
          <div style={{ color: THEME.textSoft, fontSize: 15, marginBottom: 8, fontWeight: 700 }}>מזומן בפודטראק כרגע</div>
          {loading && <div style={{ fontSize: 18, color: THEME.textMuted }}>טוען נתונים…</div>}
          {cashError && (
            <div>
              <div style={{ color: THEME.danger, fontSize: 15, marginBottom: 12 }}>{cashError}</div>
              {retryBtn}
            </div>
          )}
          {cash != null && <div style={{ fontSize: 36, fontWeight: 900, direction: "ltr", color: THEME.accentDeep }}>{fmtIls(cash)}</div>}
          {updated}
        </div>

        <div style={{ flex: "3 1 520px", minWidth: 0 }}>
        <div style={{ background: CARD_BG, border: `1px solid ${THEME.border}`, borderRadius: 18, padding: "28px 24px", marginBottom: 20, textAlign: "center" }}>
          <div style={{ color: THEME.textSoft, fontSize: 15, marginBottom: 8, fontWeight: 700 }}>סה״כ חוב לליאור</div>
          {loading && <div style={{ fontSize: 18, color: THEME.textMuted }}>טוען נתונים…</div>}
          {error && (
            <div>
              <div style={{ color: THEME.danger, fontSize: 15, marginBottom: 12 }}>{error}</div>
              {retryBtn}
            </div>
          )}
          {data && <div style={{ fontSize: 44, fontWeight: 900, direction: "ltr", color: THEME.accentDeep }}>{fmtIls(data.total)}</div>}
          {updated}
        </div>

        {data?.rows.length > 0 && (
          <div style={{ background: "white", border: `1px solid ${THEME.border}`, borderRadius: 18, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={head}>תאריך</th>
                  <th style={head}>פריט</th>
                  <th style={head}>פירוט</th>
                  <th style={head}>סטטוס</th>
                  <th style={{ ...head, textAlign: "left" }}>סכום</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...cell, whiteSpace: "nowrap", color: THEME.textMuted }}>{r.date}</td>
                    <td style={cell}>{r.item}</td>
                    <td style={{ ...cell, color: THEME.textSoft }}>{r.details}</td>
                    <td style={cell}>{r.status}</td>
                    <td style={{ ...amountCell, color: r.amount < 0 ? THEME.accent : THEME.text }}>{fmtIls(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ ...cell, borderBottom: 0, fontWeight: 900 }}>סה״כ</td>
                  <td style={{ ...amountCell, borderBottom: 0, fontWeight: 900 }}>{fmtIls(data.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
