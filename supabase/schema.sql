create extension if not exists pgcrypto;

create table if not exists public.inventory_products (
 id uuid primary key default gen_random_uuid(), sku text not null unique,
 name text not null, unit text not null default 'pcs',
 reorder_level integer not null default 0 check (reorder_level >= 0),
 target_stock integer not null default 0 check (target_stock >= 0),
 allocation_date date not null default current_date, delivery_date date, payment_date date,
 payment_status text not null default 'pending' check (payment_status in ('pending','partial','paid')),
 total_payment numeric(12,2) not null default 0 check (total_payment >= 0),
 payment_amount numeric(12,2) not null default 0 check (payment_amount >= 0),
 remarks text not null default '',
 base_product_id text, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.inventory_products add column if not exists allocation_date date not null default current_date;
alter table public.inventory_products add column if not exists delivery_date date;
alter table public.inventory_products add column if not exists payment_date date;
alter table public.inventory_products add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending','partial','paid'));
alter table public.inventory_products add column if not exists total_payment numeric(12,2) not null default 0 check (total_payment >= 0);
alter table public.inventory_products add column if not exists payment_amount numeric(12,2) not null default 0 check (payment_amount >= 0);
alter table public.inventory_products add column if not exists remarks text not null default '';

create table if not exists public.dead_designs (
 design_id text primary key references public.inventory_products(sku) on update cascade on delete cascade,
 created_at timestamptz not null default now()
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
 sent_at timestamptz not null default now(), allocation_date date not null default current_date,
 expected_return_date date not null, received_at timestamptz,
 payment_status text not null default 'pending' check (payment_status in ('pending','partial','paid')),
 total_payment numeric(12,2) not null default 0 check (total_payment >= 0),
 amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
 reorder_number integer not null default 0 check (reorder_number >= 0), remarks text not null default '',
 status text not null default 'sent' check (status in ('draft','sent','in_production','partially_received','received','overdue','cancelled')),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.manufacturer_jobs add column if not exists allocation_date date not null default current_date;
alter table public.manufacturer_jobs add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending','partial','paid'));
alter table public.manufacturer_jobs add column if not exists total_payment numeric(12,2) not null default 0 check (total_payment >= 0);
alter table public.manufacturer_jobs add column if not exists amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0);
alter table public.manufacturer_jobs add column if not exists reorder_number integer not null default 0 check (reorder_number >= 0);
alter table public.manufacturer_jobs add column if not exists remarks text not null default '';

create or replace function public.prevent_dead_design_manufacturing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
 design_sku text;
begin
 select sku into design_sku from public.inventory_products where id = new.product_id;
 if exists (select 1 from public.dead_designs where dead_designs.design_id = design_sku) then
  raise exception 'Design ID % is marked as dead and cannot be used for manufacturing.', design_sku using errcode = 'P0001';
 end if;
 return new;
end;
$$;

drop trigger if exists prevent_dead_design_manufacturing_trigger on public.manufacturer_jobs;
create trigger prevent_dead_design_manufacturing_trigger
before insert or update of product_id on public.manufacturer_jobs
for each row execute function public.prevent_dead_design_manufacturing();

create table if not exists public.inventory_transactions (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.inventory_products(id),
 job_id uuid references public.manufacturer_jobs(id), transaction_type text not null check (transaction_type in ('opening_balance','sale','sent_to_manufacturer','received_from_manufacturer','adjustment','return','damage')),
 quantity integer not null check (quantity <> 0), occurred_at timestamptz not null default now(), reference text, notes text,
 created_at timestamptz not null default now()
);

create table if not exists public.manufacturer_unit_skus (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.manufacturer_jobs(id) on delete cascade,
 product_id uuid not null references public.inventory_products(id),
 sku_id text not null,
 received_at date not null default current_date,
 created_at timestamptz not null default now()
);

create unique index if not exists manufacturer_unit_skus_sku_id_unique_idx on public.manufacturer_unit_skus(lower(sku_id));
create index if not exists manufacturer_unit_skus_job_idx on public.manufacturer_unit_skus(job_id,received_at);

create table if not exists public.alert_log (
 id uuid primary key default gen_random_uuid(), alert_key text not null unique,
 alert_type text not null check (alert_type in ('low_stock','deadline_near','deadline_overdue')),
 product_id uuid references public.inventory_products(id), job_id uuid references public.manufacturer_jobs(id),
 recipient_email text not null, sent_at timestamptz not null default now(), provider_message_id text
);

create index if not exists jobs_deadline_idx on public.manufacturer_jobs(expected_return_date,status);
create index if not exists transactions_product_idx on public.inventory_transactions(product_id,occurred_at);

create or replace function public.receive_manufacturer_delivery(
 p_job_id uuid,
 p_quantity integer,
 p_sku_ids text[],
 p_received_at date
) returns setof public.manufacturer_jobs
language plpgsql
set search_path = public
as $$
declare
 job_row public.manufacturer_jobs%rowtype;
 outstanding integer;
 total_received integer;
 next_status text;
begin
 select * into job_row from public.manufacturer_jobs where id = p_job_id for update;
 if not found then raise exception 'Job not found.' using errcode = 'P0002'; end if;
 outstanding := greatest(job_row.quantity_sent - job_row.quantity_received - job_row.quantity_rejected, 0);
 if p_quantity < 1 or p_quantity > outstanding then
	raise exception 'Received quantity must be from 1 to %.', outstanding using errcode = '22023';
 end if;
 if coalesce(cardinality(p_sku_ids), 0) <> p_quantity
	 or exists (select 1 from unnest(p_sku_ids) as sku(value) where nullif(btrim(sku.value), '') is null)
	 or exists (select 1 from unnest(p_sku_ids) as sku(value) group by lower(btrim(sku.value)) having count(*) > 1) then
	raise exception 'Provide one distinct SKU ID for every received unit.' using errcode = '22023';
 end if;

 insert into public.manufacturer_unit_skus(job_id, product_id, sku_id, received_at)
 select p_job_id, job_row.product_id, btrim(sku.value), p_received_at from unnest(p_sku_ids) as sku(value);
 insert into public.inventory_transactions(product_id, job_id, transaction_type, quantity, reference, notes, occurred_at)
 values (job_row.product_id, p_job_id, 'received_from_manufacturer', p_quantity, job_row.job_number, 'Received from manufacturer', p_received_at::timestamptz);

 total_received := job_row.quantity_received + p_quantity;
 next_status := case when total_received + job_row.quantity_rejected >= job_row.quantity_sent then 'received' else 'partially_received' end;
 update public.manufacturer_jobs
 set quantity_received = total_received,
		 received_at = case when next_status = 'received' then p_received_at::timestamptz else null end,
		 status = next_status,
		 updated_at = now()
 where id = p_job_id;
 return query select * from public.manufacturer_jobs where id = p_job_id;
end;
$$;

create or replace view public.inventory_stock_summary as
select p.id,p.sku,p.name,p.reorder_level,p.target_stock,
coalesce(sum(t.quantity),0)::integer as current_stock,
greatest(p.reorder_level-coalesce(sum(t.quantity),0),0)::integer as shortage,
p.allocation_date,p.delivery_date,p.payment_date,p.payment_status,p.payment_amount,p.total_payment,p.remarks
from public.inventory_products p
left join public.inventory_transactions t on t.product_id=p.id
group by p.id,p.sku,p.name,p.reorder_level,p.target_stock;

create or replace view public.manufacturer_job_summary as
select j.id,j.job_number,j.order_id,j.product_id,j.manufacturer_id,
j.quantity_sent,j.quantity_received,j.quantity_rejected,j.sent_at,j.expected_return_date,
j.received_at,j.status,j.notes,j.created_at,j.updated_at,
greatest(j.quantity_sent-j.quantity_received-j.quantity_rejected,0)::integer as quantity_outstanding,
(j.expected_return_date-current_date)::integer as days_remaining,
case when j.status in ('received','cancelled') then 'complete'
when j.expected_return_date < current_date then 'red'
when j.expected_return_date <= current_date+3 then 'amber' else 'blue' end as urgency,
j.allocation_date,j.payment_status,j.total_payment,j.amount_paid,j.reorder_number,j.remarks
from public.manufacturer_jobs j;
