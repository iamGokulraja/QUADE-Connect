-- ============================================================
-- QUADE Connect — Update 13: Documents module
--   Projects (auto folder per project: Initial / Review 1 / Review 2 + custom sections)
--   QUADE Library (folders + files)   SOP Discipline (folders + files)
-- Internal users only (admin, hr, project_manager, team_lead, employee, qc). Clients: no access.
-- Safe to run more than once. Run AFTER 20261118000000_qc_quality_role.sql
-- ============================================================

-- 1. Tables --------------------------------------------------------------------------------
create table if not exists public.doc_folders (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('project','library','sop')),
  project_id uuid references public.projects(id) on delete cascade,   -- set when scope = 'project' (a "section")
  parent_id uuid references public.doc_folders(id) on delete cascade, -- library / sop sub-folders
  name text not null check (length(btrim(name)) between 1 and 120),
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((scope = 'project') = (project_id is not null))
);
create unique index if not exists doc_folders_project_section_uq
  on public.doc_folders (project_id, lower(name)) where scope = 'project';
create unique index if not exists doc_folders_tree_uq
  on public.doc_folders (scope, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where scope <> 'project';
create index if not exists doc_folders_scope_idx on public.doc_folders(scope, parent_id);

create table if not exists public.doc_files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.doc_folders(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,          -- path inside the private "documents" storage bucket
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists doc_files_folder_idx on public.doc_files(folder_id, created_at desc);
create index if not exists doc_files_project_idx on public.doc_files(project_id);
create index if not exists doc_files_recent_idx on public.doc_files(created_at desc);

-- 2. Default sections for every project (new + existing) ------------------------------------
create or replace function public.doc_create_default_sections() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.doc_folders(scope, project_id, name, is_default, created_by)
  select 'project', new.id, n, true, null from unnest(array['Initial','Review 1','Review 2']) n
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists doc_default_sections_trg on public.projects;
create trigger doc_default_sections_trg after insert on public.projects
  for each row execute function public.doc_create_default_sections();

insert into public.doc_folders(scope, project_id, name, is_default, created_by)
select 'project', p.id, n, true, null from public.projects p, unnest(array['Initial','Review 1','Review 2']) n
on conflict do nothing;

-- 3. Row level security (internal users only; project documents follow project visibility) ----
alter table public.doc_folders enable row level security;
alter table public.doc_files enable row level security;

-- "can the caller see this project?"  The subquery runs under the caller's own RLS on projects
-- (admin/hr/qc: all, PM: own, TL/employee: their teams' projects).
drop policy if exists doc_folders_select on public.doc_folders;
create policy doc_folders_select on public.doc_folders for select to authenticated using (
  public.qc_is_internal() and (scope <> 'project' or exists (select 1 from public.projects p where p.id = doc_folders.project_id)));
drop policy if exists doc_folders_insert on public.doc_folders;
create policy doc_folders_insert on public.doc_folders for insert to authenticated with check (
  public.qc_is_internal() and is_default = false and created_by = auth.uid()
  and (scope <> 'project' or exists (select 1 from public.projects p where p.id = doc_folders.project_id)));
drop policy if exists doc_folders_delete on public.doc_folders;
create policy doc_folders_delete on public.doc_folders for delete to authenticated using (
  is_default = false and (created_by = auth.uid() or public.qc_role() = 'admin'));
drop policy if exists doc_folders_update on public.doc_folders;
create policy doc_folders_update on public.doc_folders for update to authenticated using (
  is_default = false and (created_by = auth.uid() or public.qc_role() = 'admin'))
  with check (is_default = false);

drop policy if exists doc_files_select on public.doc_files;
create policy doc_files_select on public.doc_files for select to authenticated using (
  public.qc_is_internal() and exists (select 1 from public.doc_folders f where f.id = doc_files.folder_id));
drop policy if exists doc_files_insert on public.doc_files;
create policy doc_files_insert on public.doc_files for insert to authenticated with check (
  public.qc_is_internal() and uploaded_by = auth.uid() and exists (select 1 from public.doc_folders f where f.id = doc_files.folder_id));
drop policy if exists doc_files_delete on public.doc_files;
create policy doc_files_delete on public.doc_files for delete to authenticated using (
  uploaded_by = auth.uid() or public.qc_role() = 'admin');

grant select, insert, update, delete on public.doc_folders, public.doc_files to authenticated;

-- keep doc_files.project_id consistent with its folder
create or replace function public.doc_files_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select project_id into new.project_id from public.doc_folders where id = new.folder_id;
  new.uploaded_by := auth.uid();
  return new;
end $$;
drop trigger if exists doc_files_before_trg on public.doc_files;
create trigger doc_files_before_trg before insert on public.doc_files
  for each row execute function public.doc_files_before();

-- 4. Storage bucket (private) -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 104857600)      -- 100 MB per file
on conflict (id) do update set public = false, file_size_limit = 104857600;

drop policy if exists documents_obj_insert on storage.objects;
create policy documents_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.qc_is_internal());
-- a file can be opened only if the caller can see its record (so project access rules apply)
drop policy if exists documents_obj_select on storage.objects;
create policy documents_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.doc_files d where d.file_path = storage.objects.name));
drop policy if exists documents_obj_delete on storage.objects;
create policy documents_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (owner = auth.uid() or public.qc_role() = 'admin'));
