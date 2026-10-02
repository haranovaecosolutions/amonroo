# Amonroo Inventory

Amonroo is a small inventory command centre for products, customer orders, manufacturer jobs, stock movements, deadlines, BaseLinker data, and operational alerts.

## What is implemented

- Customer order creation with an automatic `AM-xxxxxx` order ID.
- Design catalogue with unique design numbers, allocation/delivery/payment tracking, and reorder levels.
- Manufacturer jobs with expected return dates and urgency colours.
- Automatic stock ledger entries when goods are sent to or received from a manufacturer.
- Partial receipts and remaining-quantity tracking.
- Dashboard metrics, stock health, manufacturer pipeline, and analytics charts.
- JSON export at `/api/export` for local archiving.
- Read-only BaseLinker orders and inventory with automatic refresh.
- Low-stock and deadline email alerts at `/api/alerts`.

## Local setup

1. Install dependencies: `npm install`.
2. Create `.env.local` from `.env.example` and fill in the values.
3. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
4. Start the app with `npm run dev`, then open `http://localhost:3000`.

## Required credentials

### Site password

- `INVENTORY_AUTH_ENABLED`: set to `true` to require the password page; defaults to disabled.
- `INVENTORY_PASSWORD`: the password required to open the website.
- `INVENTORY_SESSION_SECRET`: a long, random server-only secret used to sign 14-day login sessions. Generate a unique value for each environment.

To turn the password gate back on, set `INVENTORY_AUTH_ENABLED=true` and configure both password settings in the server environment. Do not use `NEXT_PUBLIC_` variables or commit these secrets.

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`: the project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key. Never expose this in browser code or commit it to GitHub.

### BaseLinker

- `BASELINKER_API_TOKEN`: server-only API token with read access. The app only calls `getOrders`, `getOrderStatusList`, `getInventories`, `getInventoryProductsList`, and `getInventoryProductsData`.
- `BASELINKER_INVENTORY_ID`: optional inventory ID. If omitted, the account's default inventory is used (or its only inventory).
- `BASELINKER_WAREHOUSE_ID`: optional warehouse ID. If omitted, the selected inventory's default warehouse is used.
- `BASELINKER_LOW_STOCK_FALLBACK`: defaults to `5` units for products without a BaseLinker stock threshold.

Orders from the last 90 days and inventory stock are fetched directly from BaseLinker and refreshed in the app every minute. The orders page and BaseLinker-backed inventory are read-only; create and edit orders or products in BaseLinker. Keep the API token out of `NEXT_PUBLIC_` variables and source control.

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