-- Run this FIRST in the Supabase SQL editor and check the output.
-- 1. Columns of the tables the migration extends
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tasks', 'attendance', 'leave_requests', 'activity_logs', 'profiles')
order by table_name, ordinal_position;

-- 2. Existing policies on those tables (broad old policies would weaken the new ones)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('tasks', 'attendance', 'leave_requests', 'profiles', 'activity_logs')
order by tablename, policyname;

-- 3. Existing check constraints (a status check without 'review' would block the new status)
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'c' and conrelid::regclass::text in ('tasks', 'attendance', 'leave_requests');

-- 4. Reporting hierarchy table (Project Manager -> Team Leads). The app expects the columns
--    project_manager_id and team_lead_id. Confirm they exist and see current rows and policies.
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'project_manager_team_leads' order by ordinal_position;
select * from public.project_manager_team_leads;
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'project_manager_team_leads';
