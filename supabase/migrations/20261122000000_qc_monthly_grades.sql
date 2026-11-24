-- =====================================================================================
-- QC GRADES: from "per project" to MONTHLY
-- QC now gives every Employee and Team Lead ONE grade (A+, A, B, C) for each calendar month.
-- Run once in the Supabase SQL Editor after 20261118000000_qc_quality_role.sql. Safe to re-run.
--
-- Existing project-wise grades are converted: for each person and month the LATEST grade becomes that
-- month's grade; older duplicates are removed from qc_grades (every change stays in qc_grade_history).
-- =====================================================================================

alter table public.qc_grades        add column if not exists grade_month date;
alter table public.qc_grade_history add column if not exists grade_month date;

-- 1. Month of existing rows (Indian time)
update public.qc_grades
   set grade_month = date_trunc('month', coalesce(updated_at, created_at) at time zone 'Asia/Kolkata')::date
 where grade_month is null;
update public.qc_grade_history
   set grade_month = date_trunc('month', changed_at at time zone 'Asia/Kolkata')::date
 where grade_month is null;

-- 2. One grade per person per month: keep the newest, drop the rest (their history rows remain)
delete from public.qc_grades g
 using (
   select id, row_number() over (partition by user_id, grade_month order by updated_at desc, created_at desc, id) as rn
     from public.qc_grades
 ) d
 where g.id = d.id and d.rn > 1;

-- 3. The grade belongs to the month, not to a project
update public.qc_grades set project_id = null where project_id is not null;
drop index if exists public.qc_grades_user_project_uq;
create unique index if not exists qc_grades_user_month_uq on public.qc_grades (user_id, grade_month);
create index if not exists qc_grades_month_idx on public.qc_grades (grade_month);
create index if not exists qc_grade_history_month_idx on public.qc_grade_history (grade_month, user_id);

alter table public.qc_grades alter column grade_month set not null;
alter table public.qc_grades alter column grade_month set default (date_trunc('month', now() at time zone 'Asia/Kolkata')::date);
alter table public.qc_grade_history alter column grade_month set default (date_trunc('month', now() at time zone 'Asia/Kolkata')::date);
alter table public.qc_grades drop constraint if exists qc_grades_month_first_day;
alter table public.qc_grades add constraint qc_grades_month_first_day check (extract(day from grade_month) = 1);

-- 4. Validation: only Employees / Team Leads, month cannot be in the future, person and month never change
create or replace function public.qc_grades_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text; this_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
begin
  select role::text into r from public.profiles where id = new.user_id;
  if r is null or r not in ('employee','team_lead') then
    raise exception 'QC grades can only be given to Employees and Team Leads.';
  end if;
  new.grade_month := date_trunc('month', coalesce(new.grade_month, this_month))::date;
  if new.grade_month > this_month then
    raise exception 'You cannot grade a future month.';
  end if;
  new.project_id := null;
  new.graded_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.user_id := old.user_id; new.grade_month := old.grade_month; end if;
  return new;
end $$;

-- 5. History + activity feed now speak in months
create or replace function public.qc_grades_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'UPDATE' and old.grade is not distinct from new.grade and old.remarks is not distinct from new.remarks then return null; end if;
  insert into public.qc_grade_history(grade_id, user_id, project_id, grade_month, old_grade, new_grade, old_remarks, new_remarks, changed_by)
  values (new.id, new.user_id, null, new.grade_month,
          case when tg_op = 'UPDATE' then old.grade end, new.grade,
          case when tg_op = 'UPDATE' then old.remarks end, new.remarks, auth.uid());
  select coalesce(full_name, email) into who from public.profiles where id = new.user_id;
  insert into public.qc_activity(actor_id, project_id, target_user_id, action, detail)
  values (auth.uid(), null, new.user_id, case when tg_op = 'INSERT' then 'grade_assigned' else 'grade_updated' end,
          coalesce(who, 'User') || ' graded ' || new.grade || ' for ' || to_char(new.grade_month, 'FMMonth YYYY'));
  return null;
end $$;

drop trigger if exists qc_grades_before_trg on public.qc_grades;
create trigger qc_grades_before_trg before insert or update on public.qc_grades
  for each row execute function public.qc_grades_before();
drop trigger if exists qc_grades_after_trg on public.qc_grades;
create trigger qc_grades_after_trg after insert or update on public.qc_grades
  for each row execute function public.qc_grades_after();
