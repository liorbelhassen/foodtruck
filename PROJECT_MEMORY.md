# PROJECT_MEMORY.md

> A complete reference for the **foodtruck-app** — a real-time food-truck ordering,
> kitchen, cashier, and analytics system. This document is the single source of
> truth for understanding the architecture, data model, and behavior of the app.
> Read this before making changes.

---

## 1. What this project is

A single-page React app (Hebrew, RTL) for running a food truck called **"הבשוניה"**
(also branded **"יאגנוב"** on combo items). It has four role-based screens that all
share one live Firestore order stream:

| Screen (Hebrew nav) | Component | Audience | Auth required |
|---|---|---|---|
| לקוח (Customer) | `CustomerScreen.jsx` | Public customers | No (anonymous) |
| קופאי (Cashier) | `CashierScreen.jsx` | Staff/admin | Yes (Google) |
| מטבח (Kitchen) | `KitchenScreen.jsx` | Staff/admin | Yes (Google) |
| דוחות (Analytics) | `AnalyticsScreen.jsx` | Staff/admin | Yes (Google) |

A separate **Cloud Functions** backend (`functions/`) generates and emails daily
PDF + XLSX reports.

---

## 2. Tech stack

- **Frontend:** React 19, Vite 8, plain inline-style CSS-in-JS (no CSS framework, no CSS modules beyond `index.css`/`App.css`).
- **Charts:** `recharts` (Analytics bar chart only).
- **Backend-as-a-service:** Firebase — Firestore (orders/counters/ratings), Auth (anonymous + Google), Realtime Database (live presence count).
- **Cloud Functions:** Node 20, ESM, `firebase-functions` v2 — scheduled + HTTP report generation.
- **Email:** Both `resend` (used in `sendTestEmail` and configured) and `nodemailer` (used in the real report email path). Note the inconsistency — see §9.
- **Reports:** `pdfkit` (PDF), `exceljs` (XLSX), `luxon` (timezone math).
- **Lint:** ESLint 9 flat config; rule `no-unused-vars` ignores `^[A-Z_]` (uppercase/constants).
- **There is no TypeScript and no test suite.**
- `@supabase/supabase-js` is in `package.json` dependencies but is **not used anywhere** in the source — likely leftover.

### Scripts
- Root: `npm run dev` (vite), `npm run build`, `npm run lint`, `npm run preview`.
- Functions: `npm run serve` (emulator), `npm run deploy`, `npm run logs`.

---

## 3. Repository layout

```
foodtruck-app/
├── index.html                 # Vite entry, mounts #root
├── vite.config.js             # minimal: react() plugin only
├── eslint.config.js
├── package.json
├── firebase.json              # hosting (public: dist) + functions config
├── .firebaserc                # default project: foodtruck-app-bd
├── .env.local                 # VITE_FIREBASE_* secrets (gitignored pattern *.local)
├── AGENTS.md                  # STRICT agent rules — see §10
├── README.md                  # stock Vite template readme (not project-specific)
├── dist/                      # build output (committed; served by Firebase Hosting)
├── .firebase/                 # Firebase hosting cache
├── public/                    # static assets: product images, QR codes, sounds
│   ├── *.png/.jpeg            # menu item & topping images, logo
│   ├── notification.mp3       # customer "order ready" sound
│   ├── kaching.mp3            # kitchen "new order" sound
│   ├── Bit QR Code.jpeg       # payment QR
│   └── PayBoox QR Code.jpeg   # payment QR
├── functions/                 # Cloud Functions (separate package)
│   ├── index.js               # report generation (scheduled + HTTP)
│   ├── package.json           # Node 20, ESM
│   ├── .env                   # RESEND_API_KEY, DAILY_REPORT_TO/FROM
│   └── README.md              # report system docs
└── src/
    ├── main.jsx               # ReactDOM root, StrictMode
    ├── App.jsx                # root component: auth, nav, order CRUD, presence
    ├── firebase.js            # Firebase init (db, auth, rtdb exports)
    ├── index.css / App.css
    ├── assets/                # hero.png, react/vite svgs
    ├── services/
    │   ├── auth.js            # anonymous + Google sign-in, logout, auth sub
    │   └── orders.js          # all Firestore order/counter/rating operations
    └── components/
        ├── CustomerScreen.jsx # 2382 lines — the big one (menu, cart, payment, status, reviews)
        ├── CashierScreen.jsx  # payment confirmation + send-to-kitchen
        ├── KitchenScreen.jsx  # active/history orders, prep timers, kaching sound
        ├── AnalyticsScreen.jsx# per-day metrics, revenue, CSV export, recharts
        ├── uiHelpers.jsx      # menu data, shared style helpers, MenuVisual, status labels
        └── customer/
            ├── customerConstants.js  # drinks, toppings, THEME colors, style tokens
            ├── customerHelpers.js    # name/drink/mod display logic, card styles
            └── customerAtoms.jsx     # reusable buttons/chips (Drink, Topping, Qty, Payment)
```

---

## 4. Firebase configuration

- **Project id:** `foodtruck-app-bd` (`.firebaserc`).
- **Client init** (`src/firebase.js`): reads all config from `import.meta.env.VITE_FIREBASE_*`.
  Exports: `db` (Firestore), `auth`, `rtdb` (Realtime Database).
- **Env (`.env.local`):** `VITE_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`,
  `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`, `DATABASE_URL`.
- **Hosting:** serves `dist/`, SPA rewrite all → `/index.html`.

---

## 5. Authentication (`src/services/auth.js`, wired in `App.jsx`)

- On load, `subscribeToAuth` listens; if no user, `ensureAnonymousAuth()` signs in **anonymously**.
- **Anonymous users = customers.** They can only use the Customer screen.
- **Admin = Google sign-in** via `signInAsAdminWithGoogle()` (popup). `isAdmin = !!user && !user.isAnonymous`.
- Cashier/Kitchen/Analytics screens render a "צריך להתחבר" (must log in) placeholder unless `isAdmin`.
- `logout()` signs out (returns to anonymous on next load).

---

## 6. Data model (Firestore)

### Collection: `orders` (the core entity)
Created in `services/orders.js → createOrder`. Fields:

| Field | Type | Meaning |
|---|---|---|
| `customerName` | string | trimmed, defaults to `"לקוח"` |
| `paymentRequested` | "cash"\|"bit"\|"paybox"\|null | what customer chose at order time |
| `paymentActual` / `paymentMethod` | string\|null | set by cashier on payment (both written) |
| `notifiedReady` | bool | false until customer device shows the "ready" notification |
| `status` | string | see lifecycle §7 |
| `total` | number | sum of item prices (₪) |
| `items` | array | cart line items (name, price, qty, mods, allowsToppings, drink config, familyMeals…) |
| `orderNumber` | number | per-day sequential, from `counters/<dateKey>` |
| `orderDateKey` | string | `YYYY-MM-DD` in **Asia/Jerusalem** |
| `createdAt` | serverTimestamp | server time |
| `createdAtClient` | number (ms) | client time — **primary sort key** |
| `sentToKitchenAt` | serverTimestamp\|null | set when cashier sends to kitchen |
| `readyAt` | serverTimestamp\|null | set when kitchen marks ready |
| `deliveredAt` | serverTimestamp | set when kitchen marks delivered |
| `kitchenStartedAt` | (read, optional) | alternate prep-start timestamp |
| `prepDurationMs` | number\|null | computed prep time, written by `markReady` in App.jsx |
| `prepState` | string | "ready"/"delivered" mirror of status |
| `review` | object\|null | `{ rating 1-5, comment ≤200 chars, itemIds[], createdAt }` |

### Collection: `counters` (doc id = `YYYY-MM-DD` Israel date)
- `{ lastOrderNumber: number }`. Incremented atomically inside a `runTransaction` in `createOrder` to produce per-day order numbers.

### Collection: `menuRatings` (doc id = stringified menu item id)
- `{ itemId, ratingCount (increment), ratingSum (increment), updatedAt }`.
- Written transactionally in `submitOrderReviewInFirebase`; read by `subscribeToMenuRatings` which computes `{ count, avg }` per item.

### Realtime Database: `activeCustomers/<uid>-<sessionId>`
- Live presence for the "how many customers connected right now" admin counter.
- Each anonymous customer on the Customer screen writes `{ uid, screen, isAdmin:false, lastSeen, connectedAt }`, heartbeats `lastSeen` every 20s, and uses `onDisconnect().remove()`.
- Admin counts entries where `isAdmin !== true`, `screen === "customer"`, and `lastSeen` within `STALE_AFTER_MS = 70000`.

---

## 7. Order status lifecycle

```
new  ──(cashier confirms payment)──>  paid  ──(cashier "send to kitchen")──>  in_progress
   └─ payOrderInFirebase                    └─ sendToKitchenInFirebase
in_progress ──(kitchen "done")──> ready ──(kitchen "delivered")──> delivered
            markReady (App.jsx)          markDelivered (App.jsx)
```

- `new`: just created. Cashier can pick/confirm payment.
- `paid`: payment recorded; cashier can send to kitchen.
- `in_progress`: in the kitchen; prep timer runs; triggers `kaching.mp3` on kitchen screen.
- `ready`: prep done; `readyAt` + `prepDurationMs` set; customer device plays `notification.mp3`, vibrates, shows modal, and writes `notifiedReady:true`.
- `delivered`: handed to customer; moves to kitchen history.

Status label/colors live in `uiHelpers.jsx` (`statusLabel`, `statusPill`). Cashier overrides some labels (`cashierStatusLabel`).

---

## 8. Key behaviors & where they live

### `App.jsx` (orchestrator)
- Holds top-level state: `user`, `screen`, `firebaseOrders`, `menuRatingsByItemId`, cart, customer name, presence count, viewport width.
- Subscribes to orders (`subscribeToOrders`) and ratings (`subscribeToMenuRatings`).
- **Order mutations live here**: `sendOrder` (create), `payOrder`, `sendToKitchen`, `markReady`, `markDelivered`, `resetKitchenOrders` (batch delete), `submitOrderReview`.
- `markReady` computes `prepDurationMs` from the best available start timestamp (`kitchenStartedAt` → `sentToKitchenAt` → `createdAt`).
- **Average wait estimate**: averages `prepDurationMs` of orders completed in the last 30 min (needs ≥2 samples, else defaults to **7 minutes**). Shown in the order-success modal.
- `menuItemReviewsById`: memoized map of itemId → reviews, derived from orders that have a `review`.
- Responsive: `isMobile = width <= 900`.
- There's a leftover `localStorage` "shifts" concept (`STORAGE_KEY = "foodtruck-shifts-v1"`, `createEmptyShift`) that is **initialized but no longer the source of truth** — orders come from Firestore. Treat shifts state as legacy/vestigial.

### `services/orders.js`
- `createOrder`: transaction increments per-day counter, writes order.
- `subscribeToOrders`: **dual-query merge** — listens to both `orderBy(createdAtClient desc)` (primary) and `orderBy(createdAt desc)` (legacy, for old orders lacking `createdAtClient`), merges by id, sorts by client time then server time. This exists for backward compatibility with older order documents.
- `payOrderInFirebase`, `sendToKitchenInFirebase`, `deleteOrdersInFirebase` (batch), `submitOrderReviewInFirebase` (transaction; rejects double-reviews, clamps rating 1-5, comment ≤200, dedupes itemIds; updates `menuRatings`).
- `subscribeToMenuRatings`: emits `{ itemId: { count, avg } }`.
- Israel timezone date key via `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" })`.

### `CustomerScreen.jsx` (2382 lines — the largest, most complex file)
Self-contained helpers at top (lines ~36-115), then sub-components, then the main export.
- **Sub-components:** `MenuItemCard` (~117), `OrderSidebar` (~432), `MobileSummaryDrawer` (~572), main `CustomerScreen` (~756).
- **Menu** comes from `uiHelpers.menu`. Items can allow toppings and/or drink choices.
- **Drink selection:** inline drink picker per item; combos ("יאגנוב") and the family deal have guided drink/topping config. Family deal = 4 burgers each independently configured (`familyMealConfigs`, `showFamilyConfig` modal).
- **Toppings** are "no-X" modifiers (`noOnion`, `noLettuce`, etc. in `ALL_TOPPINGS`); display logic strips the "ללא/בלי" prefix (`customerHelpers.js`).
- **Payment choice** (cash/bit/paybox) shows Bit/PayBox QR images when bit/paybox selected.
- **Order status modal**: live modal for new/paid/in_progress states.
- **Ready notification** (effect at ~1391): when `status === "ready"` and `notifiedReady === false`, plays `notification.mp3`, vibrates (`[300,100,300]`), shows modal, scrolls top, and persists `notifiedReady:true` directly via `updateDoc` (guarded by a `Set` ref to avoid duplicates).
- **Reviews**: after delivery, customer can rate 1-5 + comment; submitted via `onSubmitReview` → `submitOrderReviewInFirebase`. Per-item average ratings/reviews are displayed on menu cards.
- Audio unlock pattern (browsers block autoplay until a user gesture) — `audioUnlockedRef`.

### `CashierScreen.jsx`
- Lists orders (toggle: all vs. unhandled = `new`/`paid`).
- Confirm payment buttons (cash/bit/paybox) → `onPay`. Shows requested vs. actual payment.
- "שלח למטבח" (send to kitchen) appears only when `status === "paid"`.

### `KitchenScreen.jsx`
- Active orders = `in_progress` + `ready`; history = `delivered`.
- **Live prep timer** ticks every second (`forceTick`).
- **`kaching.mp3`** plays on transition into `in_progress` (tracks previous statuses in a ref Map; has full audio-unlock handling with extensive `console.log` debugging).
- "סיימתי" (✓) → `onMarkReady`; "נמסר" → `onMarkDelivered`.
- "איפוס כל המידע" (reset all) → confirm modal → `onResetAll` deletes all kitchen + history order ids (batch delete). **Destructive.**

### `AnalyticsScreen.jsx`
- Per-day view with date picker (`selectedDateKey`, defaults today, Israel TZ) and quick chips for days that have data.
- Metrics: total orders, ready/delivered count, avg prep time, peak 15-min window, revenue split (cash/bit/paybox), total revenue.
- 15-minute bucket bar chart (recharts).
- **CSV export** (`exportShiftToCsv`) → `orders-report-<date>.csv` with BOM for Excel Hebrew.

---

## 9. Cloud Functions — automated reports (`functions/index.js`)

Three exported functions (region `us-central1`):

1. **`generateDailyReportAtMidnightIl`** — scheduled `0 0 * * *` Asia/Jerusalem; builds report for **yesterday**; 540s timeout, 1GiB.
2. **`generateDailyReportNow`** — HTTP (GET/POST); manual trigger; optional `REPORTS_MANUAL_TOKEN` auth (header `x-report-token`, query/body `token`, or Bearer); params `mode=today|yesterday`, `dateKey=YYYY-MM-DD`, `to=<email>`. Defaults to today.
3. **`sendTestEmail`** — HTTP; sends a test email via **Resend** to verify config.

Pipeline (`buildAndDeliverReport`): `fetchOrdersForDate` (merges 3 queries: `orderDateKey`, `createdAt` window, `createdAtClient` window) → `computeMetrics` → build PDF (`buildPdfReportBuffer`) + XLSX (`buildXlsxReportBuffer`) → email + save to Cloud Storage (`reports/<date>/...`).

`computeMetrics` produces: revenue by payment method, status counts, items sold, **inventory consumption** (burger patties: +1/burger, +4/family deal; sausages: +2/hotdog), drinks by type, load-by-hour, busiest hour, top item/drink, avg prep duration.

### ⚠️ Known inconsistencies in functions
- **Two email libraries:** the real report path (`sendReportEmail`) uses **nodemailer** (needs `MAIL_USER`/`MAIL_PASS` + `MAIL_HOST` or `MAIL_SERVICE`), but the committed `.env` only has Resend vars (`RESEND_API_KEY`, `DAILY_REPORT_TO`, `DAILY_REPORT_FROM`). So scheduled report emails will be **skipped** ("mail_not_configured") unless MAIL_* vars are set; only `sendTestEmail` uses Resend.
- `functions/README.md` documents env vars (`REPORT_RECIPIENT`, `MAIL_FROM`) that **differ** from the code's actual names (`DAILY_REPORT_TO`, `DAILY_REPORT_FROM`). Trust the code, not the README, for env var names.

### Functions env (`functions/.env`)
`RESEND_API_KEY`, `DAILY_REPORT_TO`, `DAILY_REPORT_FROM`. Default recipient fallback in code: `lior.belhassen@gmail.com`.

---

## 10. AGENTS.md — strict working rules (IMPORTANT)

`AGENTS.md` (partly Hebrew preamble) imposes **hard constraints** on any agent working here.
Summary of what it demands:
- **Smallest possible safe change.** Edit a single file when possible.
- Do **not** refactor unrelated code, rewrite whole files/components, introduce new abstractions, or change project-wide patterns unless explicitly requested.
- Don't touch unrelated files "while you're there."
- If a referenced file doesn't exist: search for the closest match and suggest the path; **don't create new files** unless explicitly requested.
- Preserve existing behavior, structure, naming, and styling by default.
- Prefer targeted fixes over component rewrites; don't change state logic unless required.
- **Do not modify Firebase config/init/data structure/queries** unless explicitly requested.
- Run only the narrowest relevant validation; don't run the full suite unless asked.
- Output format: state which file(s) will change, make the change, return the full updated file, end with a summary (files changed / exact change / reason).
- Project stability > code elegance. No speculative improvements. Choose the safest minimal interpretation of ambiguous requests.

---

## 11. Conventions & gotchas

- **Language/direction:** UI is Hebrew, `dir="rtl"`. Keep new UI strings Hebrew and RTL-aware.
- **Styling:** all inline `style={{}}` objects; shared tokens in `customerConstants.js` `THEME` and style helpers in `uiHelpers.jsx`/`customerHelpers.js`. No Tailwind/styled-components.
- **Timezone:** all date-keying is **Asia/Jerusalem**, computed via `Intl.DateTimeFormat`/luxon — never use raw local time for order day grouping. (Note: `uiHelpers.todayKey()` uses UTC `toISOString().slice(0,10)` — legacy, not the canonical key; canonical is `getIsraelDateKey`.)
- **Timestamps:** code defensively normalizes Firestore Timestamp / Date / number via a repeated `toMillis` helper (duplicated across App.jsx, orders.js, KitchenScreen, AnalyticsScreen, functions).
- **Prep-time start fallback chain:** `kitchenStartedAt → sentToKitchenAt → createdAt` (used consistently).
- **Order sorting/back-compat:** `createdAtClient` is the primary key; `createdAt` is the legacy fallback (see dual-query merge in §8).
- **Money:** integers in ₪ (shekels), no cents on the client; functions format with `.toFixed(2)`.
- **Audio autoplay:** both customer (`notification.mp3`) and kitchen (`kaching.mp3`) implement unlock-on-first-gesture; expect `console.log`/`console.warn` noise from kitchen sound debugging.
- **`dist/` is committed** and is what Firebase Hosting serves — rebuild (`npm run build`) before deploying hosting.
- **Unused/legacy:** `@supabase/supabase-js` dependency (unused), localStorage "shifts" state in App.jsx (vestigial), stock `README.md`.

---

## 12. Quick task → file map

| I want to change… | Look in |
|---|---|
| Menu items / prices / images | `src/components/uiHelpers.jsx` (`menu`, `toppingOptions`) |
| Drink options | `src/components/customer/customerConstants.js` |
| Customer ordering flow / cart / reviews | `src/components/CustomerScreen.jsx` |
| Cashier payment / send-to-kitchen | `src/components/CashierScreen.jsx` |
| Kitchen timers / sounds / reset | `src/components/KitchenScreen.jsx` |
| Analytics charts / CSV export | `src/components/AnalyticsScreen.jsx` |
| Order creation / status writes / ratings | `src/services/orders.js` + `App.jsx` mutations |
| Auth (anon/Google) | `src/services/auth.js` |
| Firebase init / env | `src/firebase.js`, `.env.local` |
| Live "connected customers" presence | `App.jsx` (RTDB `activeCustomers`) |
| Daily PDF/XLSX email reports | `functions/index.js` |
| Theme colors / shared style tokens | `customerConstants.js` (`THEME`), `uiHelpers.jsx` |

---

_Last generated by reading the full repository on 2026-06-09._
