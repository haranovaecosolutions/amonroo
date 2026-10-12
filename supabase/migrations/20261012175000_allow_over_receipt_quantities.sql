create or replace function public.receive_manufacturer_delivery(
 p_job_id uuid,
 p_quantity integer,
 p_received_at date
) returns setof public.manufacturer_jobs
language plpgsql
set search_path = public
as $$
declare
 job_row public.manufacturer_jobs%rowtype;
 total_received integer;
 next_status text;
begin
 select * into job_row from public.manufacturer_jobs where id = p_job_id for update;
 if not found then raise exception 'Job not found.' using errcode = 'P0002'; end if;
 if p_quantity < 1 then
	raise exception 'Received quantity must be at least 1.' using errcode = '22023';
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

revoke all on function public.receive_manufacturer_delivery(uuid, integer, date) from public, anon, authenticated;
grant execute on function public.receive_manufacturer_delivery(uuid, integer, date) to service_role;

notify pgrst, 'reload schema';
