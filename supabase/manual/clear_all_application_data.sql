-- DESTRUCTIVE: permanently removes all application records, including the
-- deleted-record archive. Back up the project before running this script.
-- Run in the Supabase SQL Editor for the intended project.

begin;

truncate table
  public.customer_order_lines,
  public.manufacturer_unit_skus,
  public.inventory_transactions,
  public.dead_designs,
  public.manufacturer_jobs,
  public.inventory_products,
  public.customer_orders,
  public.manufacturers,
  public.alert_log,
  public.deleted_data
restart identity;

commit;

select 'inventory_products' as table_name, count(*) as rows_remaining from public.inventory_products
union all
select 'dead_designs', count(*) from public.dead_designs
union all
select 'customer_orders', count(*) from public.customer_orders
union all
select 'customer_order_lines', count(*) from public.customer_order_lines
union all
select 'manufacturers', count(*) from public.manufacturers
union all
select 'manufacturer_jobs', count(*) from public.manufacturer_jobs
union all
select 'inventory_transactions', count(*) from public.inventory_transactions
union all
select 'manufacturer_unit_skus', count(*) from public.manufacturer_unit_skus
union all
select 'alert_log', count(*) from public.alert_log
union all
select 'deleted_data', count(*) from public.deleted_data
order by table_name;
