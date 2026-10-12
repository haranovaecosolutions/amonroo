create or replace function public.edit_manufacturer_job(
 p_job_id uuid,
 p_manufacturer_id uuid,
 p_quantity_sent integer,
 p_quantity_received integer,
 p_status text,
 p_allocation_date date,
 p_expected_return_date date,
 p_payment_status text,
 p_total_payment numeric,
 p_amount_paid numeric,
 p_reorder_number integer,
 p_remarks text
) returns setof public.manufacturer_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
 job_row public.manufacturer_jobs%rowtype;
 sent_adjustment integer;
 received_adjustment integer;
begin
 select * into job_row from public.manufacturer_jobs where id = p_job_id for update;
 if not found then raise exception 'Manufacturing record not found.' using errcode = 'P0002'; end if;
 if p_quantity_sent < 1 or p_quantity_received < 0 then
	raise exception 'Manufacturing quantities must be non-negative and quantity sent must be at least 1.' using errcode = '22023';
 end if;
 if p_status not in ('draft','sent','in_production','partially_received','received','overdue','cancelled') then
	raise exception 'Invalid manufacturing status.' using errcode = '22023';
 end if;

 sent_adjustment := job_row.quantity_sent - p_quantity_sent;
 received_adjustment := p_quantity_received - job_row.quantity_received;

 update public.manufacturer_jobs
 set manufacturer_id = p_manufacturer_id,
		 quantity_sent = p_quantity_sent,
		 quantity_received = p_quantity_received,
		 status = p_status,
		 received_at = case when p_status = 'received' then coalesce(received_at, now()) else null end,
		 allocation_date = p_allocation_date,
		 expected_return_date = p_expected_return_date,
		 payment_status = p_payment_status,
		 total_payment = p_total_payment,
		 amount_paid = p_amount_paid,
		 reorder_number = p_reorder_number,
		 remarks = p_remarks,
		 notes = p_remarks,
		 updated_at = now()
 where id = p_job_id;

 if sent_adjustment <> 0 then
	insert into public.inventory_transactions(product_id, job_id, transaction_type, quantity, reference, notes)
	values (job_row.product_id, p_job_id, 'adjustment', sent_adjustment, job_row.job_number,
		'Manufacturing edit: quantity sent changed from ' || job_row.quantity_sent || ' to ' || p_quantity_sent);
 end if;
 if received_adjustment <> 0 then
	insert into public.inventory_transactions(product_id, job_id, transaction_type, quantity, reference, notes)
	values (job_row.product_id, p_job_id, 'adjustment', received_adjustment, job_row.job_number,
		'Manufacturing edit: quantity received changed from ' || job_row.quantity_received || ' to ' || p_quantity_received);
 end if;

 return query select * from public.manufacturer_jobs where id = p_job_id;
end;
$$;

revoke all on function public.edit_manufacturer_job(uuid, uuid, integer, integer, text, date, date, text, numeric, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.edit_manufacturer_job(uuid, uuid, integer, integer, text, date, date, text, numeric, numeric, integer, text) to service_role;

notify pgrst, 'reload schema';
