begin;

insert into public.deleted_data(source_table, source_record_id, record_data)
select 'customer_order_lines', line.id::text, to_jsonb(line)
from public.customer_order_lines as line
where line.product_id in (select id from public.inventory_products);

insert into public.deleted_data(source_table, source_record_id, record_data)
select 'manufacturer_unit_skus', unit_sku.id::text, to_jsonb(unit_sku)
from public.manufacturer_unit_skus as unit_sku
where unit_sku.product_id in (select id from public.inventory_products)
   or unit_sku.job_id in (select id from public.manufacturer_jobs);

insert into public.deleted_data(source_table, source_record_id, record_data)
select 'inventory_transactions', txn.id::text, to_jsonb(txn)
from public.inventory_transactions as txn
where txn.product_id in (select id from public.inventory_products)
   or txn.job_id in (select id from public.manufacturer_jobs);

insert into public.deleted_data(source_table, source_record_id, record_data)
select 'dead_designs', dead_design.design_id, to_jsonb(dead_design)
from public.dead_designs as dead_design
where dead_design.design_id in (select sku from public.inventory_products);

insert into public.deleted_data(source_table, source_record_id, record_data)
select 'manufacturer_jobs', job.id::text, to_jsonb(job)
from public.manufacturer_jobs as job;

insert into public.deleted_data(source_table, source_record_id, record_data)
select 'inventory_products', product.id::text, to_jsonb(product)
from public.inventory_products as product;

update public.alert_log
set product_id = null
where product_id in (select id from public.inventory_products);

update public.alert_log
set job_id = null
where job_id in (select id from public.manufacturer_jobs);

delete from public.customer_order_lines
where product_id in (select id from public.inventory_products);

delete from public.manufacturer_unit_skus
where product_id in (select id from public.inventory_products)
   or job_id in (select id from public.manufacturer_jobs);

delete from public.inventory_transactions
where product_id in (select id from public.inventory_products)
   or job_id in (select id from public.manufacturer_jobs);

delete from public.dead_designs
where design_id in (select sku from public.inventory_products);

delete from public.manufacturer_jobs;
delete from public.inventory_products;

commit;
