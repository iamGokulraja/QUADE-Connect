-- =====================================================================================
-- ATTENDANCE LOCATION: place name + coordinates saved at check-in and at check-out
-- Run once in the Supabase SQL Editor (after the HR report scripts). Safe to re-run.
-- Existing attendance data and rules stay as they are; the new columns are simply empty for old rows.
-- =====================================================================================
alter table public.attendance
  add column if not exists check_in_location  text,
  add column if not exists check_in_lat       double precision,
  add column if not exists check_in_lng       double precision,
  add column if not exists check_out_location text,
  add column if not exists check_out_lat      double precision,
  add column if not exists check_out_lng      double precision;

alter table public.attendance drop constraint if exists qc_attendance_geo_chk;
alter table public.attendance add constraint qc_attendance_geo_chk check (
  (check_in_lat  is null or check_in_lat  between -90 and 90) and (check_in_lng  is null or check_in_lng  between -180 and 180) and
  (check_out_lat is null or check_out_lat between -90 and 90) and (check_out_lng is null or check_out_lng between -180 and 180) and
  length(coalesce(check_in_location, '')) <= 300 and length(coalesce(check_out_location, '')) <= 300);

-- Staff cannot rewrite the check-in place later, nor change the check-out place once they have checked out.
create or replace function public.qc_attendance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.qc_is_hr_or_admin() then return new; end if;
  if new.employee_id is distinct from old.employee_id or new.attendance_date is distinct from old.attendance_date
     or new.check_in is distinct from old.check_in or new.status is distinct from old.status
     or new.check_in_location is distinct from old.check_in_location
     or new.check_in_lat is distinct from old.check_in_lat or new.check_in_lng is distinct from old.check_in_lng then
    raise exception 'Attendance history cannot be edited.';
  end if;
  if old.check_out is not null and (new.check_out is distinct from old.check_out
     or new.check_out_location is distinct from old.check_out_location
     or new.check_out_lat is distinct from old.check_out_lat or new.check_out_lng is distinct from old.check_out_lng) then
    raise exception 'You have already checked out for this day.';
  end if;
  return new;
end $$;

-- ---------- HR downloads: add the location columns ----------
drop function if exists public.hr_report_attendance(date, date);
create function public.hr_report_attendance(p_from date, p_to date)
returns table (employee_code text, full_name text, role text, department text, attendance_date date, day_name text,
               check_in_time text, check_in_location text, check_out_time text, check_out_location text,
               hours_inside numeric, status text, check_in_map text, check_out_map text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.hr_report_guard(p_from, p_to);
  return query
  select p.employee_code, coalesce(nullif(p.full_name, ''), p.email), p.role::text, p.department, a.attendance_date,
         trim(to_char(a.attendance_date, 'Day')),
         to_char(a.check_in at time zone 'Asia/Kolkata', 'HH24:MI'), a.check_in_location,
         to_char(a.check_out at time zone 'Asia/Kolkata', 'HH24:MI'), a.check_out_location,
         case when a.check_out is not null
              then round(coalesce(a.work_hours, extract(epoch from a.check_out - a.check_in) / 3600.0)::numeric, 2) end,
         a.status,
         case when a.check_in_lat is not null then 'https://www.google.com/maps?q=' || a.check_in_lat || ',' || a.check_in_lng end,
         case when a.check_out_lat is not null then 'https://www.google.com/maps?q=' || a.check_out_lat || ',' || a.check_out_lng end
    from public.attendance a
    join public.profiles p on p.id = a.employee_id
   where a.attendance_date between p_from and p_to
     and p.role::text in ('employee','team_lead','project_manager','hr','qc','admin')
   order by coalesce(nullif(p.full_name, ''), p.email), a.attendance_date;
end $$;

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
   where p.is_active and p.role::text in ('employee','team_lead','project_manager','hr')
   order by coalesce(nullif(p.full_name, ''), p.email), p.id, d;
end $$;

revoke all on function public.hr_report_attendance(date, date) from public, anon;
revoke all on function public.hr_report_attendance_sheets(date, date) from public, anon;
grant execute on function public.hr_report_attendance(date, date) to authenticated;
grant execute on function public.hr_report_attendance_sheets(date, date) to authenticated;
