create table if not exists public.deleted_data (
 id bigint generated always as identity primary key,
 source_table text not null,
 source_record_id text not null,
 deleted_at timestamptz not null default now(),
 record_data jsonb not null
);

create index if not exists deleted_data_deleted_at_idx on public.deleted_data(deleted_at desc);

alter table public.deleted_data enable row level security;
revoke all on table public.deleted_data from public, anon, authenticated, service_role;

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

notify pgrst, 'reload schema';
