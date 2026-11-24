-- =====================================================================================
-- RESET ATTENDANCE: deletes every check-in / check-out record so attendance starts fresh.
-- Run ONCE in the Supabase SQL Editor. This cannot be undone, so step 1 keeps a backup copy.
-- NOT touched: employees/profiles, leave requests and balances, QC grades, chat, projects, tasks, and the
-- attendance table itself (columns, rules, security and the app all stay exactly the same).
-- =====================================================================================

-- 1. Backup copy (a plain table; drop it later with:  drop table public.attendance_backup_20261122;)
create table if not exists public.attendance_backup_20261122 as table public.attendance;
alter table public.attendance_backup_20261122 enable row level security;   -- no policy = nobody can read it through the app

-- 2. Delete all attendance rows
delete from public.attendance;

-- 3. Check: attendance should be 0, the backup holds the old rows
select (select count(*) from public.attendance) as attendance_rows_now,
       (select count(*) from public.attendance_backup_20261122) as rows_saved_in_backup;
