-- =====================================================================================
-- 1) FEED / ACCESS FIX: accounts whose "is_active" was left empty (NULL) were treated as switched off,
--    so they saw an empty Spotlight and other empty lists. Empty now counts as active; only a real FALSE blocks.
-- 2) QC people appear in HR's attendance sheets.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =====================================================================================

-- Make the stored data clean
update public.profiles set is_active = true where is_active is null;

-- The one helper every security rule uses: empty is_active no longer locks a person out
create or replace function public.qc_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid() and coalesce(is_active, true)
$$;

-- HR sheets: add QC to the list of staff
drop function if exists public.hr_report_attendance_sheets(date, date);
create function public.hr_report_attendance_sheets(p_from date, p_to date)
returns table (employee_id uuid, employee_code text, full_name text, role text, department text,
               attendance_date date, day_name text, check_in_time text, check_in_location text,
               check_out_time text, check_out_location text, hours_inside numeric, status text, remarks text)
language plpgsql stable security definer set search_path = public as $$
declare v_to date := least(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  perform public.hr_report_guard(p_from, p_to);
  if v_to < p_from then raise exception 'This period has not started yet.'; end if;
  return query
  select p.id, p.employee_code, coalesce(nullif(p.full_name, ''), p.email), p.role::text, p.department,
         d::date, trim(to_char(d, 'Day')),
         to_char(a.check_in at time zone 'Asia/Kolkata', 'HH24:MI'), a.check_in_location,
         to_char(a.check_out at time zone 'Asia/Kolkata', 'HH24:MI'), a.check_out_location,
         case when a.check_out is not null
              then round(coalesce(a.work_hours, extract(epoch from a.check_out - a.check_in) / 3600.0)::numeric, 2) end,
         case when a.id is not null then initcap(a.status)
              when lv.id is not null then 'Leave'
              when extract(dow from d) = 0 then 'Weekly off'
              else 'Absent' end,
         case when a.id is not null and a.check_out is null then 'No check-out recorded'
              when a.id is null and lv.id is not null then coalesce(t.name, 'Leave') || coalesce(' - ' || lv.reason, '') end
    from public.profiles p
    cross join generate_series(p_from::timestamp, v_to::timestamp, interval '1 day') as d
    left join public.attendance a on a.employee_id = p.id and a.attendance_date = d::date
    left join lateral (select l.* from public.leave_requests l
                        where l.employee_id = p.id and l.status = 'approved'
                          and d::date between l.start_date and l.end_date limit 1) lv on true
    left join public.leave_types t on t.id = lv.leave_type_id
   where coalesce(p.is_active, true) and p.role::text in ('employee','team_lead','project_manager','hr','qc')
   order by coalesce(nullif(p.full_name, ''), p.email), p.id, d;
end $$;
revoke all on function public.hr_report_attendance_sheets(date, date) from public, anon;
grant execute on function public.hr_report_attendance_sheets(date, date) to authenticated;

-- Check: anyone still switched off on purpose (is_active = false) cannot see the feed until HR re-activates them.
select full_name, email, role, is_active from public.profiles where is_active is not true order by full_name;
