create extension if not exists pgcrypto;

create table if not exists public.inventory_products (
 id uuid primary key default gen_random_uuid(), sku text not null unique,
 name text not null, unit text not null default 'pcs',
 reorder_level integer not null default 0 check (reorder_level >= 0),
 target_stock integer not null default 0 check (target_stock >= 0),
 base_product_id text, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.customer_orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique,
 base_order_id text unique, customer_name text, ordered_at timestamptz not null default now(),
 deadline date, status text not null default 'open' check (status in ('open','partially_fulfilled','fulfilled','cancelled')),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.customer_order_lines (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.customer_orders(id) on delete cascade,
 product_id uuid not null references public.inventory_products(id), quantity_ordered integer not null check (quantity_ordered > 0),
 quantity_allocated integer not null default 0 check (quantity_allocated >= 0), created_at timestamptz not null default now()
);

create table if not exists public.manufacturers (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 contact_name text, email text, phone text, notes text, created_at timestamptz not null default now()
);

create table if not exists public.manufacturer_jobs (
 id uuid primary key default gen_random_uuid(), job_number text not null unique,
 order_id uuid references public.customer_orders(id), product_id uuid not null references public.inventory_products(id),
 manufacturer_id uuid not null references public.manufacturers(id), quantity_sent integer not null check (quantity_sent > 0),
 quantity_received integer not null default 0 check (quantity_received >= 0), quantity_rejected integer not null default 0 check (quantity_rejected >= 0),
 sent_at timestamptz not null default now(), expected_return_date date not null, received_at timestamptz,
 status text not null default 'sent' check (status in ('draft','sent','in_production','partially_received','received','overdue','cancelled')),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.inventory_products(id),
 job_id uuid references public.manufacturer_jobs(id), transaction_type text not null check (transaction_type in ('opening_balance','sale','sent_to_manufacturer','received_from_manufacturer','adjustment','return','damage')),
 quantity integer not null check (quantity <> 0), occurred_at timestamptz not null default now(), reference text, notes text,
 created_at timestamptz not null default now()
);

create table if not exists public.alert_log (
 id uuid primary key default gen_random_uuid(), alert_key text not null unique,
 alert_type text not null check (alert_type in ('low_stock','deadline_near','deadline_overdue')),
 product_id uuid references public.inventory_products(id), job_id uuid references public.manufacturer_jobs(id),
 recipient_email text not null, sent_at timestamptz not null default now(), provider_message_id text
);

create index if not exists jobs_deadline_idx on public.manufacturer_jobs(expected_return_date,status);
create index if not exists transactions_product_idx on public.inventory_transactions(product_id,occurred_at);

create or replace view public.inventory_stock_summary as
select p.id,p.sku,p.name,p.reorder_level,p.target_stock,
coalesce(sum(t.quantity),0)::integer as current_stock,
greatest(p.reorder_level-coalesce(sum(t.quantity),0),0)::integer as shortage
from public.inventory_products p
left join public.inventory_transactions t on t.product_id=p.id
group by p.id,p.sku,p.name,p.reorder_level,p.target_stock;

create or replace view public.manufacturer_job_summary as
select j.*,
greatest(j.quantity_sent-j.quantity_received-j.quantity_rejected,0)::integer as quantity_outstanding,
(j.expected_return_date-current_date)::integer as days_remaining,
case when j.status in ('received','cancelled') then 'complete'
when j.expected_return_date < current_date then 'red'
when j.expected_return_date <= current_date+3 then 'amber' else 'blue' end as urgency
from public.manufacturer_jobs j;
