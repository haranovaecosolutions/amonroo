# Amonroo Inventory

Amonroo is a small inventory command centre for products, customer orders, manufacturer jobs, stock movements, deadlines, Base.com imports, and operational alerts.

## What is implemented

- Customer order creation with an automatic `AM-xxxxxx` order ID.
- Design catalogue with unique design numbers, allocation/delivery/payment tracking, and reorder levels.
- Manufacturer jobs with expected return dates and urgency colours.
- Automatic stock ledger entries when goods are sent to or received from a manufacturer.
- Partial receipts and remaining-quantity tracking.
- Dashboard metrics, stock health, manufacturer pipeline, and analytics charts.
- JSON export at `/api/export` for local archiving.
- Base.com order import at `/api/base/sync`.
- Low-stock and deadline email alerts at `/api/alerts`.

## Local setup

1. Install dependencies: `npm install`.
2. Create `.env.local` from `.env.example` and fill in the values.
3. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
4. Start the app with `npm run dev`, then open `http://localhost:3000`.

## Required credentials

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`: the project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key. Never expose this in browser code or commit it to GitHub.

### Base.com

- `BASE_API_ORDERS_URL`: the exact Base.com orders endpoint for your account.
- `BASE_API_TOKEN`: the Base.com API token.

Base.com APIs can return different field names depending on the account and API version. The sync endpoint imports order IDs and customer information first. To map product lines automatically, provide one sample Base.com order response so the field mapping can be matched precisely.

### Email alerts

This project uses Resend over HTTPS, so no SMTP password is stored in the app.

- `RESEND_API_KEY`: Resend API key.
- `ALERT_FROM_EMAIL`: a verified Resend sender, for example `amonroo.update.ai@amonroo.com`.
- `ALERT_TO_EMAIL`: defaults to `shipingnvs00@gmail.com`.
- `CRON_SECRET`: a random secret used to protect scheduled endpoints.
- `ALERT_DEADLINE_DAYS`: defaults to `3`; alerts are sent for jobs due within this window or already overdue.

Important: `amonroo.update.ai@gmail.com` cannot normally be used as a Resend sender because Resend requires a verified domain. Verify `amonroo.com` in Resend and use an address such as `amonroo.update.ai@amonroo.com`. Gmail can remain the recipient. If the exact Gmail sender is mandatory, use Gmail SMTP with a Google App Password instead and replace the Resend adapter.

## Deployment

1. Push the repository to GitHub.
2. Import it into Vercel.
3. Add all `.env.example` values in Vercel project settings.
4. Verify the `amonroo.com` sending domain in Resend.
5. Vercel runs `/api/alerts` every day at 07:00 UTC using [`vercel.json`](vercel.json). Adjust the schedule if needed.

## Data limits and backups

The app stores data in Supabase Postgres, not in the GitHub repository. Free-tier limits can change, so check current Supabase pricing before launch. A small business catalogue and order history should fit comfortably, but transaction history, backups, and file attachments consume quota.

Use **Export JSON** or download `/api/export` regularly and store dated exports on your hard drive. The export includes products, orders, order lines, manufacturers, jobs, inventory transactions, and alert history.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```