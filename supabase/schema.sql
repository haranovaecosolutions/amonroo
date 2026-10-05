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
alter table public.inventory_products add column if not exists sku_id text;

create unique index if not exists inventory_products_sku_id_unique_idx
 on public.inventory_products(lower(btrim(sku_id))) where sku_id is not null;

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
revoke all on function public.prevent_dead_design_manufacturing() from public, anon, authenticated;

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

create table if not exists public.deleted_data (
 id bigint generated always as identity primary key,
 source_table text not null,
 source_record_id text not null,
 deleted_at timestamptz not null default now(),
 record_data jsonb not null
);

create index if not exists deleted_data_deleted_at_idx on public.deleted_data(deleted_at desc);

create or replace function public.delete_unused_inventory_product(p_sku text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
 product_row public.inventory_products%rowtype;
begin
 select * into product_row from public.inventory_products where sku = p_sku for update;
 if not found then raise exception 'Design ID % was not found.', p_sku using errcode = 'P0002'; end if;
 if exists (select 1 from public.manufacturer_jobs where product_id = product_row.id)
	 or exists (select 1 from public.customer_order_lines where product_id = product_row.id)
	 or exists (select 1 from public.inventory_transactions where product_id = product_row.id)
	 or exists (select 1 from public.manufacturer_unit_skus where product_id = product_row.id) then
	raise exception 'This design is already used by manufacturing, orders, or stock transactions and cannot be deleted.' using errcode = 'P0001';
 end if;
 insert into public.deleted_data(source_table, source_record_id, record_data)
 values ('inventory_products', product_row.id::text, to_jsonb(product_row));
 update public.alert_log set product_id = null where product_id = product_row.id;
 delete from public.inventory_products where id = product_row.id;
 return product_row.sku;
end;
$$;
revoke all on function public.delete_unused_inventory_product(text) from public, anon, authenticated;
grant execute on function public.delete_unused_inventory_product(text) to service_role;

create or replace function public.delete_unreceived_manufacturer_job(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
 job_row public.manufacturer_jobs%rowtype;
begin
 select * into job_row from public.manufacturer_jobs where id = p_job_id for update;
 if not found then raise exception 'Manufacturing record was not found.' using errcode = 'P0002'; end if;
 if job_row.quantity_received > 0
	 or exists (select 1 from public.manufacturer_unit_skus where job_id = p_job_id) then
	raise exception 'Manufacturing records with received units or unit SKU history cannot be deleted.' using errcode = 'P0001';
 end if;

 insert into public.deleted_data(source_table, source_record_id, record_data)
 values ('manufacturer_jobs', job_row.id::text, to_jsonb(job_row));
 update public.inventory_transactions set job_id = null where job_id = p_job_id;
 insert into public.inventory_transactions(product_id, transaction_type, quantity, reference, notes)
 values (job_row.product_id, 'adjustment', job_row.quantity_sent, job_row.job_number,
	'Restocked after deleting unreceived manufacturing record ' || job_row.job_number);
 update public.alert_log set job_id = null where job_id = p_job_id;
 delete from public.manufacturer_jobs where id = p_job_id;
 return job_row.job_number;
end;
$$;
revoke all on function public.delete_unreceived_manufacturer_job(uuid) from public, anon, authenticated;
grant execute on function public.delete_unreceived_manufacturer_job(uuid) to service_role;

create or replace function public.restore_dead_design(p_design_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
 dead_design_row public.dead_designs%rowtype;
begin
 select * into dead_design_row
 from public.dead_designs
 where design_id = p_design_id
 for update;
 if not found then raise exception 'Dead design % was not found.', p_design_id using errcode = 'P0002'; end if;

 insert into public.deleted_data(source_table, source_record_id, record_data)
 values ('dead_designs', dead_design_row.design_id, to_jsonb(dead_design_row));
 delete from public.dead_designs where design_id = dead_design_row.design_id;
 return dead_design_row.design_id;
end;
$$;
revoke all on function public.restore_dead_design(text) from public, anon, authenticated;
grant execute on function public.restore_dead_design(text) to service_role;

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
 if coalesce(cardinality(p_sku_ids), 0) > 0 and (
	 cardinality(p_sku_ids) <> p_quantity
	 or exists (select 1 from unnest(p_sku_ids) as sku(value) where nullif(btrim(sku.value), '') is null)
	 or exists (select 1 from unnest(p_sku_ids) as sku(value) group by lower(btrim(sku.value)) having count(*) > 1)
 ) then
	raise exception 'Legacy unit SKU IDs, when supplied, must include one distinct ID per received unit.' using errcode = '22023';
 end if;

 if coalesce(cardinality(p_sku_ids), 0) > 0 then
	 insert into public.manufacturer_unit_skus(job_id, product_id, sku_id, received_at)
	 select p_job_id, job_row.product_id, btrim(sku.value), p_received_at from unnest(p_sku_ids) as sku(value);
 end if;
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
revoke all on function public.receive_manufacturer_delivery(uuid, integer, text[], date) from public, anon, authenticated;
grant execute on function public.receive_manufacturer_delivery(uuid, integer, text[], date) to service_role;

create or replace view public.inventory_stock_summary with (security_invoker = true) as
select p.id,p.sku,p.name,p.reorder_level,p.target_stock,
coalesce(sum(t.quantity),0)::integer as current_stock,
greatest(p.reorder_level-coalesce(sum(t.quantity),0),0)::integer as shortage,
p.allocation_date,p.delivery_date,p.payment_date,p.payment_status,p.payment_amount,p.total_payment,p.remarks,
p.sku_id
from public.inventory_products p
left join public.inventory_transactions t on t.product_id=p.id
group by p.id,p.sku,p.name,p.reorder_level,p.target_stock,p.sku_id;

create or replace view public.manufacturer_job_summary with (security_invoker = true) as
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

alter table public.inventory_products enable row level security;
alter table public.dead_designs enable row level security;
alter table public.customer_orders enable row level security;
alter table public.customer_order_lines enable row level security;
alter table public.manufacturers enable row level security;
alter table public.manufacturer_jobs enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.manufacturer_unit_skus enable row level security;
alter table public.alert_log enable row level security;
alter table public.deleted_data enable row level security;

revoke all on table
 public.inventory_products,
 public.dead_designs,
 public.customer_orders,
 public.customer_order_lines,
 public.manufacturers,
 public.manufacturer_jobs,
 public.inventory_transactions,
 public.manufacturer_unit_skus,
 public.alert_log,
 public.inventory_stock_summary,
 public.manufacturer_job_summary
from anon, authenticated;

revoke all on table public.deleted_data from public, anon, authenticated, service_role;

grant all on table
 public.inventory_products,
 public.dead_designs,
 public.customer_orders,
 public.customer_order_lines,
 public.manufacturers,
 public.manufacturer_jobs,
 public.inventory_transactions,
 public.manufacturer_unit_skus,
 public.alert_log,
 public.inventory_stock_summary,
 public.manufacturer_job_summary
to service_role;
