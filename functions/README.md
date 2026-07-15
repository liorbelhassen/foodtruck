# Foodtruck Automated Daily Reports (Cloud Functions)

## What this does
- Scheduled report every day at `00:00` Israel time (`Asia/Jerusalem`).
- Scheduled run generates report for the **previous day**.
- Generates:
  - PDF report
  - XLSX report
- Sends both by email (when SMTP is configured).
- Saves both files to Cloud Storage under:
  - `reports/<YYYY-MM-DD>/foodtruck-report-<YYYY-MM-DD>.pdf`
  - `reports/<YYYY-MM-DD>/foodtruck-report-<YYYY-MM-DD>.xlsx`
- Includes manual HTTP trigger for immediate testing (defaults to **today**).

## Required environment variables
- `REPORT_RECIPIENT` (optional, default: `lior.belhassen@gmail.com`)
- `REPORTS_MANUAL_TOKEN` (recommended for manual endpoint protection)

Email transport (choose one):

### Option A: Generic SMTP
- `MAIL_HOST`
- `MAIL_PORT` (example: `587`)
- `MAIL_SECURE` (`true` or `false`)
- `MAIL_USER`
- `MAIL_PASS`
- `MAIL_FROM` (optional)

### Option B: Service-based (for example Gmail)
- `MAIL_SERVICE` (for example `gmail`)
- `MAIL_USER`
- `MAIL_PASS`
- `MAIL_FROM` (optional)

## Manual test trigger
Function name: `generateDailyReportNow`

Example request:

```bash
curl -X POST "https://<region>-<project-id>.cloudfunctions.net/generateDailyReportNow?mode=today" \
  -H "x-report-token: <REPORTS_MANUAL_TOKEN>"
```

Optional query params:
- `mode=today|yesterday`
- `dateKey=YYYY-MM-DD` (overrides mode)
- `to=<email>`

## Deploy
From project root:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```
