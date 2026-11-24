-- ============================================================
-- QUADE Connect — FRESH START: delete all projects, boards, tasks and related data.
-- !! PERMANENT. Take a backup first (Supabase -> Database -> Backups). !!
-- KEEPS: users/profiles & roles, teams & team members, Project Manager -> Team Lead links,
--        leave, attendance, Spotlight, client project requests, QC grades of people without a project.
-- DELETES: projects, project-team assignments, boards (PM / Team Lead / Employee / personal),
--          board owners, groups, columns, discussion messages, tasks, task owners, comments,
--          timers, work logs, task activity, attachments (database rows),
--          work notifications, QC project reviews, QC grades given on projects, QC activity.
-- ============================================================
begin;

-- Projects first: this cascades to team assignments, boards, board owners, groups, columns,
-- messages, tasks, owners, comments, timers, work logs, activity, attachments, QC reviews, project QC grades.
delete from public.projects;

-- Then anything still left over (personal boards/tasks of employees that have no project)
do $$
declare t text;
begin
  foreach t in array array[
    'task_activity','task_worklogs','task_timers','task_comments','task_attachments','task_assignees',
    'board_messages','board_columns','task_groups','board_owners','tasks','task_boards',
    'work_notifications','qc_project_reviews','qc_activity'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('truncate table public.%I restart identity cascade', t);
    end if;
  end loop;
end $$;

-- Optional: also remove the client project requests so clients/admin start empty too.
-- Uncomment the next line if you want that:
-- delete from public.client_project_requests;

-- Check: every count below must be 0
select 'projects' as t, count(*) from public.projects
union all select 'task_boards', count(*) from public.task_boards
union all select 'board_owners', count(*) from public.board_owners
union all select 'tasks', count(*) from public.tasks
union all select 'task_attachments', count(*) from public.task_attachments
union all select 'work_notifications', count(*) from public.work_notifications;

commit;

-- ------------------------------------------------------------
-- Uploaded files (Storage) are NOT removed by SQL. To free them:
-- Supabase dashboard -> Storage -> bucket "task-files" -> select all -> Delete.
-- ------------------------------------------------------------
