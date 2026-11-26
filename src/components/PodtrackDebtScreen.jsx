import { useEffect, useState } from "react";
import { THEME, CARD_BG } from "./customer/customerConstants.js";

// Public, login-free page reached only via #/podtrack-debt. Read-only: fetches the public
// PodTrack sheet (tab "הוצאות") on every load and sums every numeric value in column H.
const SHEET_ID = "1-1DAHzfF8sz3M_HChFw8JO_UlhVs-5BsU1pj4h2nHLA";
const SHEET_TAB = "הוצאות";

const sheetUrl = () =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_TAB)}&_=${Date.now()}`;

const toNumber = (cell) => {
  const v = cell?.v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/[₪,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const text = (cell) => (cell?.f ?? cell?.v ?? "").toString().trim();

// gviz wraps the JSON in `google.visualization.Query.setResponse(...)`.
function parseDebt(body) {
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("תגובה לא צפויה מהגיליון");
  const data = JSON.parse(body.slice(start, end + 1));
  if (data.status === "error") throw new Error(data.errors?.[0]?.message || "שגיאה בקריאת הגיליון");
  const table = data.table;
  if (!table) throw new Error("הגיליון ריק");
  const col = (id) => table.cols.findIndex((c) => c.id === id);
  const [A, B, E, G, H] = ["A", "B", "E", "G", "H"].map(col);
  if (H < 0) throw new Error("עמודה H לא נמצאה בגיליון");
  const rows = [];
  for (const r of table.rows || []) {
    const c = r.c || [];
    const amount = toNumber(c[H]);
    if (amount == null) continue;
    rows.push({ item: text(c[A]), details: text(c[B]), date: text(c[E]), status: text(c[G]), amount });
  }
  const total = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
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
    document.title = "PodTrack — חייבים לליאור";
    return () => { document.title = prevTitle; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(sheetUrl(), { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`הגיליון החזיר שגיאה (${r.status})`); return r.text(); })
      .then((body) => { if (!cancelled) setState({ data: parseDebt(body), at: new Date() }); })
      .catch((e) => { if (!cancelled) setState({ error: e.message || "טעינת הנתונים נכשלה" }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => { setState({ loading: true }); setReloadKey((k) => k + 1); };
  const { loading, error, data, at } = state;

  return (
    <div dir="rtl" style={{ minHeight: "100vh", padding: "32px 16px", background: "white", color: THEME.text, textAlign: "right", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, color: THEME.text }}>מצב פיננסי PodTrack — חייבים לליאור</h1>
        <p style={{ color: THEME.textSoft, fontSize: 14, margin: "0 0 24px" }}>הנתונים נטענים ישירות מגיליון ההוצאות בכל רענון של העמוד.</p>

        <div style={{ background: CARD_BG, border: `1px solid ${THEME.border}`, borderRadius: 18, padding: "28px 24px", marginBottom: 20, textAlign: "center" }}>
          <div style={{ color: THEME.textSoft, fontSize: 15, marginBottom: 8, fontWeight: 700 }}>סה״כ חוב לליאור</div>
          {loading && <div style={{ fontSize: 18, color: THEME.textMuted }}>טוען נתונים…</div>}
          {error && (
            <div>
              <div style={{ color: THEME.danger, fontSize: 15, marginBottom: 12 }}>{error}</div>
              <button onClick={reload} style={{ background: THEME.accent, color: "white", border: 0, borderRadius: 999, padding: "8px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>נסה שוב</button>
            </div>
          )}
          {data && <div style={{ fontSize: 44, fontWeight: 900, direction: "ltr", color: THEME.accentDeep }}>{fmtIls(data.total)}</div>}
          {at && <div style={{ color: THEME.textMuted, fontSize: 12, marginTop: 10 }}>עודכן: {at.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</div>}
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
  );
}
