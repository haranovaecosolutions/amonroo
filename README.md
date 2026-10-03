# Amonroo Inventory

Amonroo is a small inventory command centre for products, customer orders, manufacturer jobs, stock movements, deadlines, BaseLinker data, and operational alerts.

## What is implemented

- Customer order creation with an automatic `AM-xxxxxx` order ID.
- Design catalogue with unique design numbers, allocation/delivery/payment tracking, and reorder levels.
- Editable manufacturer job details with expected return dates and urgency colours.
- Optional unique SKU ID per design, reused across manufacturing jobs regardless of quantity.
- Confirmed deletion for unused designs and unreceived manufacturing jobs; design records with related history are protected, and deleting an unreceived job restores its sent quantity to stock.
- Automatic stock ledger entries when goods are sent to or received from a manufacturer.
- Partial receipts and remaining-quantity tracking.
- Dashboard metrics, stock health, manufacturer pipeline, and analytics charts.
- JSON export at `/api/export` for local archiving.
- Excel report downloads for designs and manufacturing by day, week, month, or year.
- Read-only BaseLinker orders and Supabase-backed designs and manufacturing records.
- Low-stock and deadline email alerts at `/api/alerts`.

## Local setup

1. Install dependencies: `npm install`.
2. Create `.env.local` from `.env.example` and fill in the values.
3. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
4. Start the app with `npm run dev`, then open `http://localhost:3000`.

## Required credentials

### Site password

- `INVENTORY_AUTH_ENABLED`: set to `true` to require the password page. It is disabled for local development unless enabled; production returns HTTP 503 until explicitly set to `true`.
- `INVENTORY_PASSWORD`: the password required to open the website.
- `INVENTORY_SESSION_SECRET`: a long, random server-only secret used to sign login sessions (with a 14-day maximum age). The browser cookie expires when the browser session ends. Generate a unique value for each environment.

To turn the password gate back on, set `INVENTORY_AUTH_ENABLED=true` and configure both password settings in the server environment. Do not use `NEXT_PUBLIC_` variables or commit these secrets.

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`: the project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key. Never expose this in browser code or commit it to GitHub.

### BaseLinker

- `BASELINKER_API_TOKEN`: server-only API token with read access. The app uses it for `getOrders` and `getOrderStatusList`.

Orders from the last 90 days are fetched directly from BaseLinker and refreshed in the app every minute. The orders page is read-only. Designs are created in the app and saved to Supabase; the manufacturing form selects from those saved Supabase designs. Keep the API token out of `NEXT_PUBLIC_` variables and source control.

### Email alerts

This project uses Resend over HTTPS, so no SMTP password is stored in the app.

- `RESEND_API_KEY`: Resend API key.
- `ALERT_FROM_EMAIL`: a verified Resend sender, for example `amonroo.update.ai@amonroo.com`.
- `ALERT_TO_EMAIL`: defaults to `shipingnvs00@gmail.com`.
- `CRON_SECRET`: a random secret used to protect scheduled endpoints.
- `ALERT_DEADLINE_DAYS`: defaults to `3`; alerts are sent for jobs due within this window or already overdue.

Important: `amonroo.update.ai@gmail.com` cannot normally be used as a Resend sender because Resend requires a verified domain. Verify `amonroo.com` in Resend and use an address such as `amonroo.update.ai@amonroo.com`. Gmail can remain the recipient. If the exact Gmail sender is mandatory, use Gmail SMTP with a Google App Password instead and replace the Resend adapter.

## Deployment

1. Run the current [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor before deploying. It enables row-level security, blocks direct access from the public Supabase API roles, and gives the server-only `service_role` the permissions the app needs. Never add a service-role/secret key to browser code.
2. Push the repository to GitHub and import it into Vercel. Use the repository root as the project root and keep the default Next.js build settings.
3. Add environment variables in Vercel **Project Settings → Environment Variables** for each environment that should run:
   - Required: `INVENTORY_AUTH_ENABLED=true`, `INVENTORY_PASSWORD`, `INVENTORY_SESSION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
   - Generate a unique, long random `INVENTORY_SESSION_SECRET` and password for production. Do not reuse the local `.env.local` values.
   - Optional BaseLinker orders: `BASELINKER_API_TOKEN`.
   - Optional email alerts: `CRON_SECRET`, `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, and `ALERT_TO_EMAIL`.
4. If Preview deployments use production data, add the same password gate and a separate, least-privilege test database where possible. Otherwise, enable the gate for Preview too or leave sensitive production credentials out of Preview.
5. Redeploy after changing Vercel environment variables. The production proxy fails closed with HTTP 503 if `INVENTORY_AUTH_ENABLED=true` is missing.
6. The configured Vercel cron calls `/api/alerts` daily at 07:00 UTC. Vercel sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is configured. Configure and verify a Resend sender before relying on alerts; if alerts are not being used, remove or disable the cron entry in [`vercel.json`](vercel.json).
7. Configure the production domain in Vercel and verify HTTPS and the password login before importing live business data.

The app uses one shared site password, not individual user accounts. Use it only for a small trusted group; for multiple staff accounts, per-user access, or audit trails, replace the shared gate with Supabase Auth and role-based authorization. Configure Vercel Firewall/rate limiting for `/api/auth/login` before exposing the login endpoint broadly.

Vercel Preview deployments should not share production secrets by default. Keep `.env.local` and all environment files out of Git; `.gitignore` already excludes them.

## Data limits and backups

The app stores data in Supabase Postgres, not in the GitHub repository. Free-tier limits can change, so check current Supabase pricing before launch. A small business catalogue and order history should fit comfortably, but transaction history, backups, and file attachments consume quota.

Use **Export JSON** or download `/api/export` regularly and store dated exports on your hard drive. The export includes products, dead-design markers, orders, order lines, manufacturers, jobs, legacy unit-SKU history, inventory transactions, and alert history. Verify that each download completes and keep it in a secure location; it contains business and customer data.

Use **Export reports** in the app navigation to download an Excel workbook with Designs and Manufacturing sheets for the selected allocation-date period. Weekly reports use Monday through Sunday.

Before launch, take a database backup, enable Supabase backups/point-in-time recovery appropriate to the business, and regularly test restoring an export or database backup. The schema script is intended to be repeatable and additive, but review and test it on a separate staging Supabase project before applying it to production. Test the login, design creation, manufacturing receipt, exports, and scheduled alerts there before production releases.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```