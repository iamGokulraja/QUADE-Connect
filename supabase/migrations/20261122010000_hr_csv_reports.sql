-- =====================================================================================
-- HR REPORTS (CSV downloads): attendance, QC grades, leaves
-- Run once in the Supabase SQL Editor (after the leave + QC monthly grade scripts). Safe to re-run.
-- These functions are for the HR role ONLY (they refuse everyone else, including Admin).
-- Times are shown in Indian time (Asia/Kolkata).
-- =====================================================================================

create or replace function public.hr_report_guard(p_from date, p_to date, p_max_days int default 130) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.qc_role(), '') <> 'hr' then raise exception 'Only HR can download these reports.'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid date range.'; end if;
  if p_to - p_from > p_max_days then raise exception 'Choose a shorter period (up to % days).', p_max_days; end if;
end $$;

-- 1. Attendance: one row per person per day with check-in, check-out and hours inside
create or replace function public.hr_report_attendance(p_from date, p_to date)
returns table (employee_code text, full_name text, role text, department text, attendance_date date, day_name text,
               check_in_time text, check_out_time text, hours_inside numeric, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.hr_report_guard(p_from, p_to);
  return query
  select p.employee_code, coalesce(nullif(p.full_name, ''), p.email), p.role::text, p.department, a.attendance_date,
         trim(to_char(a.attendance_date, 'Day')),
         to_char(a.check_in at time zone 'Asia/Kolkata', 'HH24:MI'),
         to_char(a.check_out at time zone 'Asia/Kolkata', 'HH24:MI'),
         case when a.check_out is not null
              then round(coalesce(a.work_hours, extract(epoch from a.check_out - a.check_in) / 3600.0)::numeric, 2) end,
         a.status
    from public.attendance a
    join public.profiles p on p.id = a.employee_id
   where a.attendance_date between p_from and p_to
     and p.role::text in ('employee','team_lead','project_manager','hr','qc','admin')
   order by coalesce(nullif(p.full_name, ''), p.email), a.attendance_date;
end $$;

-- 2. QC grades: every Employee / Team Lead for every month in the range (blank grade = not graded yet)
create or replace function public.hr_report_grades(p_from date, p_to date)
returns table (employee_code text, full_name text, role text, department text, grade_month date,
               grade text, remarks text, graded_by text, graded_on date)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.hr_report_guard(p_from, p_to, 400);
  return query
  select p.employee_code, coalesce(nullif(p.full_name, ''), p.email), p.role::text, p.department, m.month_start::date,
         g.grade, g.remarks, (select coalesce(nullif(x.full_name, ''), x.email) from public.profiles x where x.id = g.graded_by),
         (g.updated_at at time zone 'Asia/Kolkata')::date
    from public.profiles p
    cross join generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') as m(month_start)
    left join public.qc_grades g on g.user_id = p.id and g.grade_month = m.month_start::date
   where p.role::text in ('employee','team_lead') and p.is_active
   order by m.month_start, coalesce(nullif(p.full_name, ''), p.email);
end $$;

-- 3. Leaves taken in the range (p_status 'approved' or 'all'). Leaves that overlap the range are included.
create or replace function public.hr_report_leaves(p_from date, p_to date, p_status text default 'approved')
returns table (employee_code text, full_name text, role text, department text, leave_type text,
               start_date date, end_date date, days_in_period int, total_days int, status text, reason text,
               applied_on date, approver text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.hr_report_guard(p_from, p_to);
  return query
  select p.employee_code, coalesce(nullif(p.full_name, ''), p.email), p.role::text, p.department,
         coalesce(t.name, 'Leave'), l.start_date, l.end_date,
         (least(l.end_date, p_to) - greatest(l.start_date, p_from) + 1)::int,
         coalesce(l.total_days, l.end_date - l.start_date + 1)::int, l.status, l.reason,
         (l.submitted_at at time zone 'Asia/Kolkata')::date, l.approver_name
    from public.leave_requests l
    join public.profiles p on p.id = l.employee_id
    left join public.leave_types t on t.id = l.leave_type_id
   where l.start_date <= p_to and l.end_date >= p_from
     and (p_status = 'all' or l.status = p_status)
   order by l.start_date, coalesce(nullif(p.full_name, ''), p.email);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('hr_report_guard','hr_report_attendance','hr_report_grades','hr_report_leaves') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
