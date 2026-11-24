-- =====================================================================================
-- HR: individual monthly attendance sheets (one per employee, every calendar day)
-- Run once in the Supabase SQL Editor (after 20261122010000_hr_csv_reports.sql). Safe to re-run.
-- HR role only. Days after today are not listed. Sunday is treated as the weekly off.
-- =====================================================================================
create or replace function public.hr_report_attendance_sheets(p_from date, p_to date)
returns table (employee_id uuid, employee_code text, full_name text, role text, department text,
               attendance_date date, day_name text, check_in_time text, check_out_time text,
               hours_inside numeric, status text, remarks text)
language plpgsql stable security definer set search_path = public as $$
declare v_to date := least(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  perform public.hr_report_guard(p_from, p_to);
  if v_to < p_from then raise exception 'This period has not started yet.'; end if;
  return query
  select p.id, p.employee_code, coalesce(nullif(p.full_name, ''), p.email), p.role::text, p.department,
         d::date, trim(to_char(d, 'Day')),
         to_char(a.check_in at time zone 'Asia/Kolkata', 'HH24:MI'),
         to_char(a.check_out at time zone 'Asia/Kolkata', 'HH24:MI'),
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
   where p.is_active and p.role::text in ('employee','team_lead','project_manager','hr')
   order by coalesce(nullif(p.full_name, ''), p.email), p.id, d;
end $$;

revoke all on function public.hr_report_attendance_sheets(date, date) from public, anon;
grant execute on function public.hr_report_attendance_sheets(date, date) to authenticated;
