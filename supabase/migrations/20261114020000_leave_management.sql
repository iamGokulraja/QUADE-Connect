-- QUADE Connect: Leave Management (routing, approvals, balances, notifications, calendar).
-- Safe to run more than once. Reuses profiles / teams / team_members / project_manager_team_leads.

-- ============ 0. HELPER FUNCTIONS ============
create or replace function public.qc_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid() and is_active $$;

create or replace function public.qc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() = 'admin', false) $$;

create or replace function public.qc_is_hr_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.qc_role() in ('admin', 'hr'), false) $$;

-- target is a member of a team I lead
create or replace function public.qc_leads_employee(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.team_members m join public.teams t on t.id = m.team_id
    where m.employee_id = e and t.team_lead_id = auth.uid()) $$;

-- target is a Team Lead who reports to me
create or replace function public.qc_manages_lead(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.qc_role() is not null and exists (
    select 1 from public.project_manager_team_leads r
    where r.project_manager_id = auth.uid() and r.team_lead_id = e) $$;

-- people I work with (same team, my projects, my reporting line); HR/Admin see everyone
create or replace function public.qc_can_see_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    target = auth.uid()
    or public.qc_role() in ('admin', 'hr')
    or exists (
      select 1 from public.teams t
      where (t.team_lead_id = auth.uid()
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = auth.uid()))
        and (t.team_lead_id = target
             or exists (select 1 from public.team_members m2 where m2.team_id = t.id and m2.employee_id = target)))
    or exists (
      select 1 from public.projects p
      join public.project_team_assignments a on a.project_id = p.id
      join public.teams t on t.id = a.team_id
      where p.project_manager_id = auth.uid()
        and (t.team_lead_id = target
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = target)))
    or exists (
      select 1 from public.projects p
      join public.project_team_assignments a on a.project_id = p.id
      join public.teams t on t.id = a.team_id
      where p.project_manager_id = target
        and (t.team_lead_id = auth.uid()
             or exists (select 1 from public.team_members m where m.team_id = t.id and m.employee_id = auth.uid())))
    or exists (
      select 1 from public.project_manager_team_leads r
      where r.project_manager_id = auth.uid()
        and (r.team_lead_id = target
             or exists (select 1 from public.teams t join public.team_members m on m.team_id = t.id
                        where t.team_lead_id = r.team_lead_id and m.employee_id = target)))
    or exists (
      select 1 from public.project_manager_team_leads r
      where r.team_lead_id = auth.uid() and r.project_manager_id = target)
  ) $$;

drop policy if exists qc_profiles_related_select on public.profiles;
create policy qc_profiles_related_select on public.profiles
  for select to authenticated using (public.qc_can_see_profile(id));

-- ============ 1. PROFILE DETAILS used on the leave form ============
alter table public.profiles add column if not exists employee_code text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists is_hr_manager boolean not null default false;

-- ============ 2. LEAVE TYPES ============
create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  annual_limit numeric(5,1) check (annual_limit is null or annual_limit >= 0),  -- null = no yearly limit
  is_paid boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.leave_types (code, name, annual_limit, is_paid) values
  ('casual', 'Casual Leave', 12, true), ('sick', 'Sick Leave', 12, true),
  ('earned', 'Earned Leave', 15, true), ('unpaid', 'Unpaid Leave', null, false), ('other', 'Other', null, true)
on conflict (code) do nothing;

alter table public.leave_types enable row level security;
drop policy if exists qc_lt_select on public.leave_types;
create policy qc_lt_select on public.leave_types for select to authenticated using (true);
drop policy if exists qc_lt_write on public.leave_types;
create policy qc_lt_write on public.leave_types for all to authenticated
  using (public.qc_is_hr_or_admin()) with check (public.qc_is_hr_or_admin());

-- ============ 3. CONFIGURABLE APPROVAL MATRIX ============
-- requester_role: employee, team_lead, project_manager, hr, hr_manager, admin
-- approver_role : team_lead, project_manager, hr_manager, admin
create table if not exists public.leave_approval_rules (
  requester_role text primary key
    check (requester_role in ('employee','team_lead','project_manager','hr','hr_manager','admin')),
  approver_role text not null check (approver_role in ('team_lead','project_manager','hr_manager','admin')),
  fallback_role text check (fallback_role in ('team_lead','project_manager','hr_manager','admin')),
  is_active boolean not null default true
);
insert into public.leave_approval_rules (requester_role, approver_role, fallback_role) values
  ('employee','team_lead','hr_manager'), ('team_lead','project_manager','hr_manager'),
  ('project_manager','hr_manager','admin'), ('hr','hr_manager','admin'),
  ('hr_manager','admin',null), ('admin','admin',null)
on conflict (requester_role) do nothing;

-- approver is away -> use this person
create table if not exists public.leave_alternates (
  approver_id uuid primary key references public.profiles(id) on delete cascade,
  alternate_id uuid not null references public.profiles(id) on delete cascade,
  check (approver_id <> alternate_id)
);
-- explicit reporting manager for one person (overrides the matrix)
create table if not exists public.leave_approver_overrides (
  employee_id uuid primary key references public.profiles(id) on delete cascade,
  approver_id uuid not null references public.profiles(id) on delete cascade,
  check (employee_id <> approver_id)
);

alter table public.leave_approval_rules enable row level security;
alter table public.leave_alternates enable row level security;
alter table public.leave_approver_overrides enable row level security;
drop policy if exists qc_rules_select on public.leave_approval_rules;
create policy qc_rules_select on public.leave_approval_rules for select to authenticated using (true);
drop policy if exists qc_rules_write on public.leave_approval_rules;
create policy qc_rules_write on public.leave_approval_rules for all to authenticated
  using (public.qc_is_admin()) with check (public.qc_is_admin());
drop policy if exists qc_alt_select on public.leave_alternates;
create policy qc_alt_select on public.leave_alternates for select to authenticated using (public.qc_is_hr_or_admin());
drop policy if exists qc_alt_write on public.leave_alternates;
create policy qc_alt_write on public.leave_alternates for all to authenticated
  using (public.qc_is_admin()) with check (public.qc_is_admin());
drop policy if exists qc_ovr_select on public.leave_approver_overrides;
create policy qc_ovr_select on public.leave_approver_overrides for select to authenticated using (public.qc_is_hr_or_admin());
drop policy if exists qc_ovr_write on public.leave_approver_overrides;
create policy qc_ovr_write on public.leave_approver_overrides for all to authenticated
  using (public.qc_is_admin()) with check (public.qc_is_admin());

-- ============ 4. LEAVE REQUESTS (extends the existing table) ============
alter table public.leave_requests add column if not exists leave_type_id uuid references public.leave_types(id);
alter table public.leave_requests add column if not exists total_days integer;
alter table public.leave_requests add column if not exists attachment_url text;
alter table public.leave_requests add column if not exists current_approver_id uuid references public.profiles(id) on delete set null;
alter table public.leave_requests add column if not exists approver_name text;
alter table public.leave_requests add column if not exists current_stage integer not null default 1;
alter table public.leave_requests add column if not exists submitted_at timestamptz not null default now();
alter table public.leave_requests add column if not exists updated_at timestamptz not null default now();

alter table public.leave_requests drop constraint if exists leave_requests_status_check;
alter table public.leave_requests add constraint leave_requests_status_check
  check (status in ('pending','approved','rejected','cancelled'));

update public.leave_requests set total_days = end_date - start_date + 1 where total_days is null;
create index if not exists qc_leave_employee_idx on public.leave_requests(employee_id, start_date);
create index if not exists qc_leave_approver_idx on public.leave_requests(current_approver_id) where status = 'pending';
create index if not exists qc_leave_dates_idx on public.leave_requests(start_date, end_date);

create table if not exists public.leave_approvals (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  approver_id uuid references public.profiles(id) on delete set null,
  approver_name text,
  approval_level integer not null default 1,
  decision text not null check (decision in ('approved','rejected','cancelled')),
  comments text,
  action_date timestamptz not null default now()
);
create index if not exists qc_approvals_req_idx on public.leave_approvals(leave_request_id);

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year integer not null,
  total_allocated numeric(5,1) not null check (total_allocated >= 0),
  used_days numeric(5,1) not null default 0 check (used_days >= 0),
  remaining_days numeric(5,1) generated always as (total_allocated - used_days) stored,
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);

create table if not exists public.leave_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  leave_request_id uuid references public.leave_requests(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists qc_notif_recipient_idx on public.leave_notifications(recipient_id, is_read, created_at desc);

-- ============ 5. ROUTING ============
-- Who is the person of this kind for this employee?
create or replace function public.qc_leave_pick(emp uuid, kind text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare res uuid;
begin
  if kind = 'team_lead' then
    select t.team_lead_id into res from public.team_members m join public.teams t on t.id = m.team_id
      where m.employee_id = emp and t.team_lead_id is not null and t.team_lead_id <> emp
      order by m.created_at limit 1;
  elsif kind = 'project_manager' then
    select coalesce(
      (select r.project_manager_id from public.project_manager_team_leads r where r.team_lead_id = emp limit 1),
      (select r.project_manager_id from public.project_manager_team_leads r
         join public.teams t on t.team_lead_id = r.team_lead_id
         join public.team_members m on m.team_id = t.id where m.employee_id = emp limit 1)) into res;
  elsif kind = 'hr_manager' then
    select id into res from public.profiles
      where role::text = 'hr' and is_hr_manager and is_active and id <> emp order by created_at limit 1;
  elsif kind = 'admin' then
    select id into res from public.profiles
      where role::text = 'admin' and is_active and id <> emp order by created_at limit 1;
  end if;
  return case when res = emp then null else res end;
end $$;

-- If the approver is inactive or on approved leave today, use the configured alternate.
create or replace function public.qc_leave_available(a uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare alt uuid;
begin
  if a is null then return null; end if;
  if exists (select 1 from public.profiles where id = a and is_active)
     and not exists (select 1 from public.leave_requests
                     where employee_id = a and status = 'approved' and current_date between start_date and end_date)
  then return a; end if;
  select l.alternate_id into alt from public.leave_alternates l
    join public.profiles p on p.id = l.alternate_id and p.is_active where l.approver_id = a;
  return coalesce(alt, a);
end $$;

create or replace function public.qc_leave_resolve(emp uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare r record; rule record; k text; cand uuid;
begin
  select role::text as role, is_hr_manager into r from public.profiles where id = emp;
  k := case when r.role = 'hr' and r.is_hr_manager then 'hr_manager' else r.role end;
  select approver_id into cand from public.leave_approver_overrides where employee_id = emp;
  if cand is null then
    select * into rule from public.leave_approval_rules where requester_role = k and is_active;
    if found then
      cand := public.qc_leave_pick(emp, rule.approver_role);
      if cand is null and rule.fallback_role is not null then
        cand := public.qc_leave_pick(emp, rule.fallback_role);
      end if;
    end if;
  end if;
  return public.qc_leave_available(cand);
end $$;

create or replace function public.qc_notify(recipient uuid, req uuid, msg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if recipient is not null then
    insert into public.leave_notifications(recipient_id, leave_request_id, message) values (recipient, req, msg);
  end if;
end $$;

-- ============ 6. TRIGGERS ============
create or replace function public.qc_leave_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare lt public.leave_types; remaining numeric;
begin
  if auth.uid() is not null and new.employee_id is distinct from auth.uid() then
    raise exception 'You can only apply leave for yourself.';
  end if;
  new.status := 'pending'; new.reviewed_by := null; new.reviewed_at := null;
  new.total_days := new.end_date - new.start_date + 1;

  if new.leave_type_id is null then select id into new.leave_type_id from public.leave_types where code = new.leave_type; end if;
  select * into lt from public.leave_types where id = new.leave_type_id;
  if lt.id is null or not lt.is_active then raise exception 'Select a valid leave type.'; end if;
  new.leave_type := lt.code;

  if exists (select 1 from public.leave_requests where employee_id = new.employee_id
            and status in ('pending','approved') and start_date <= new.end_date and end_date >= new.start_date) then
    raise exception 'You already have a pending or approved leave request on these dates.';
  end if;

  if lt.annual_limit is not null then
    select coalesce((select total_allocated - used_days from public.leave_balances
                      where employee_id = new.employee_id and leave_type_id = lt.id
                        and year = extract(year from new.start_date)::int), lt.annual_limit)
         - coalesce((select sum(total_days) from public.leave_requests
                      where employee_id = new.employee_id and leave_type_id = lt.id and status = 'pending'
                        and extract(year from start_date) = extract(year from new.start_date)), 0)
      into remaining;
    if new.total_days > remaining then
      raise exception 'Not enough % balance. Remaining: % day(s).', lt.name, remaining;
    end if;
  end if;

  new.current_approver_id := public.qc_leave_resolve(new.employee_id);
  if new.current_approver_id is null then
    raise exception 'No approver is configured for your role. Please contact Admin.';
  end if;
  select full_name into new.approver_name from public.profiles where id = new.current_approver_id;
  new.current_stage := 1; new.submitted_at := now(); new.updated_at := now();
  return new;
end $$;

drop trigger if exists qc_leave_before_insert_trg on public.leave_requests;
create trigger qc_leave_before_insert_trg before insert on public.leave_requests
  for each row execute function public.qc_leave_before_insert();

create or replace function public.qc_leave_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(full_name, email) into who from public.profiles where id = new.employee_id;
  perform public.qc_notify(new.current_approver_id, new.id,
    who || ' requested ' || new.total_days || ' day(s) of ' || new.leave_type || ' leave ('
        || to_char(new.start_date, 'DD Mon') || ' - ' || to_char(new.end_date, 'DD Mon YYYY') || ')');
  return null;
end $$;

drop trigger if exists qc_leave_after_insert_trg on public.leave_requests;
create trigger qc_leave_after_insert_trg after insert on public.leave_requests
  for each row execute function public.qc_leave_after_insert();

-- Requests change only through leave_decide / leave_cancel (they set qc.leave_rpc).
create or replace function public.qc_leave_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('qc.leave_rpc', true) = '1' then
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Leave requests can only be changed by approving, rejecting or cancelling them.';
end $$;

drop trigger if exists qc_leave_guard_upd_trg on public.leave_requests;
create trigger qc_leave_guard_upd_trg before update or delete on public.leave_requests
  for each row execute function public.qc_leave_guard();

-- ============ 7. SECURE ACTIONS (RPC) ============
create or replace function public.leave_decide(req uuid, decision text, comments text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.leave_requests; lt public.leave_types; who text; msg text;
begin
  if decision not in ('approved','rejected') then raise exception 'Invalid decision.'; end if;
  select * into r from public.leave_requests where id = req for update;
  if r.id is null then raise exception 'Leave request not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request is no longer pending.'; end if;
  if r.employee_id = auth.uid() then raise exception 'You cannot approve your own request.'; end if;
  if r.current_approver_id is distinct from auth.uid() then raise exception 'You are not the approver for this request.'; end if;
  if decision = 'rejected' and coalesce(trim(comments), '') = '' then raise exception 'Please add a reason for rejection.'; end if;

  select coalesce(full_name, email) into who from public.profiles where id = auth.uid();
  perform set_config('qc.leave_rpc', '1', true);

  insert into public.leave_approvals(leave_request_id, approver_id, approver_name, approval_level, decision, comments)
    values (req, auth.uid(), who, r.current_stage, decision, nullif(trim(comments), ''));
  update public.leave_requests set status = decision, reviewed_by = auth.uid(), reviewed_at = now(),
    current_approver_id = null where id = req;

  select * into lt from public.leave_types where id = r.leave_type_id;
  if decision = 'approved' and lt.annual_limit is not null then
    insert into public.leave_balances(employee_id, leave_type_id, year, total_allocated, used_days)
      values (r.employee_id, lt.id, extract(year from r.start_date)::int, lt.annual_limit, r.total_days)
    on conflict (employee_id, leave_type_id, year)
    do update set used_days = leave_balances.used_days + excluded.used_days, updated_at = now();
  end if;

  msg := 'Your ' || r.leave_type || ' leave (' || to_char(r.start_date, 'DD Mon') || ' - ' || to_char(r.end_date, 'DD Mon YYYY')
         || ') was ' || decision || ' by ' || who || coalesce('. Comment: ' || nullif(trim(comments), ''), '');
  perform public.qc_notify(r.employee_id, req, msg);
  insert into public.leave_notifications(recipient_id, leave_request_id, message)
    select id, req, 'Leave ' || decision || ' by ' || who || ' for ' ||
           (select coalesce(full_name, email) from public.profiles where id = r.employee_id)
    from public.profiles where role::text = 'hr' and is_active and id not in (r.employee_id, auth.uid());
end $$;

create or replace function public.leave_cancel(req uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.leave_requests; lt public.leave_types; who text;
begin
  select * into r from public.leave_requests where id = req for update;
  if r.id is null or r.employee_id <> auth.uid() then raise exception 'Leave request not found.'; end if;
  if not (r.status = 'pending' or (r.status = 'approved' and r.start_date > current_date)) then
    raise exception 'Only pending requests or approved leave that has not started can be cancelled.';
  end if;
  select coalesce(full_name, email) into who from public.profiles where id = auth.uid();
  perform set_config('qc.leave_rpc', '1', true);

  if r.status = 'approved' then
    select * into lt from public.leave_types where id = r.leave_type_id;
    if lt.annual_limit is not null then
      update public.leave_balances set used_days = greatest(0, used_days - r.total_days), updated_at = now()
        where employee_id = r.employee_id and leave_type_id = lt.id and year = extract(year from r.start_date)::int;
    end if;
  end if;
  insert into public.leave_approvals(leave_request_id, approver_id, approver_name, approval_level, decision, comments)
    values (req, auth.uid(), who, r.current_stage, 'cancelled', 'Cancelled by requester');
  update public.leave_requests set status = 'cancelled', current_approver_id = null where id = req;

  perform public.qc_notify(r.current_approver_id, req, who || ' cancelled a leave request.');
  insert into public.leave_notifications(recipient_id, leave_request_id, message)
    select id, req, who || ' cancelled ' || r.status || ' leave (' || to_char(r.start_date, 'DD Mon') || ')'
    from public.profiles where role::text = 'hr' and is_active and id <> auth.uid() and r.status = 'approved';
end $$;

create or replace function public.leave_preview_approver() returns text
language sql stable security definer set search_path = public as $$
  select full_name from public.profiles where id = public.qc_leave_resolve(auth.uid()) $$;

create or replace function public.leave_set_profile_info(target uuid, p_code text, p_dept text, p_designation text, p_hr_manager boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.qc_is_hr_or_admin() then raise exception 'Not allowed.'; end if;
  update public.profiles set employee_code = nullif(trim(p_code), ''), department = nullif(trim(p_dept), ''),
    designation = nullif(trim(p_designation), ''),
    is_hr_manager = case when public.qc_is_admin() then coalesce(p_hr_manager, is_hr_manager) else is_hr_manager end
  where id = target;
end $$;

grant execute on function public.leave_decide(uuid, text, text) to authenticated;
grant execute on function public.leave_cancel(uuid) to authenticated;
grant execute on function public.leave_preview_approver() to authenticated;
grant execute on function public.leave_set_profile_info(uuid, text, text, text, boolean) to authenticated;

-- ============ 8. ROW LEVEL SECURITY ============
alter table public.leave_requests enable row level security;
alter table public.leave_approvals enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_notifications enable row level security;

drop policy if exists qc_leave_select on public.leave_requests;
create policy qc_leave_select on public.leave_requests for select to authenticated using (
  employee_id = auth.uid() or current_approver_id = auth.uid() or reviewed_by = auth.uid()
  or public.qc_is_hr_or_admin() or public.qc_leads_employee(employee_id) or public.qc_manages_lead(employee_id));

drop policy if exists qc_leave_insert on public.leave_requests;
create policy qc_leave_insert on public.leave_requests for insert to authenticated
  with check (employee_id = auth.uid() and public.qc_role() in ('employee','team_lead','project_manager','hr','admin'));

create or replace function public.qc_leave_can_view(req uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leave_requests r where r.id = req and (
    r.employee_id = auth.uid() or r.current_approver_id = auth.uid() or r.reviewed_by = auth.uid()
    or public.qc_is_hr_or_admin() or public.qc_leads_employee(r.employee_id) or public.qc_manages_lead(r.employee_id))) $$;

drop policy if exists qc_approvals_select on public.leave_approvals;
create policy qc_approvals_select on public.leave_approvals for select to authenticated
  using (public.qc_leave_can_view(leave_request_id));

drop policy if exists qc_balances_select on public.leave_balances;
create policy qc_balances_select on public.leave_balances for select to authenticated using (
  employee_id = auth.uid() or public.qc_is_hr_or_admin() or public.qc_leads_employee(employee_id));
drop policy if exists qc_balances_write on public.leave_balances;
create policy qc_balances_write on public.leave_balances for all to authenticated
  using (public.qc_is_hr_or_admin()) with check (public.qc_is_hr_or_admin());

drop policy if exists qc_notif_select on public.leave_notifications;
create policy qc_notif_select on public.leave_notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists qc_notif_update on public.leave_notifications;
create policy qc_notif_update on public.leave_notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Calendar: approved leave of people I work with, plus requests I own, approve or manage.
-- A view is used so that colleagues see dates and status but never the private reason.
create or replace view public.leave_calendar as
select r.id, r.employee_id, r.leave_type, r.start_date, r.end_date, r.total_days, r.status
from public.leave_requests r
where r.status in ('pending','approved','rejected') and (
  r.employee_id = auth.uid() or r.current_approver_id = auth.uid() or public.qc_is_hr_or_admin()
  or public.qc_leads_employee(r.employee_id) or public.qc_manages_lead(r.employee_id)
  or (r.status = 'approved' and public.qc_can_see_profile(r.employee_id)));
grant select on public.leave_calendar to authenticated;

-- ============ 9. SUPPORTING DOCUMENTS (private storage bucket) ============
insert into storage.buckets (id, name, public) values ('leave-documents', 'leave-documents', false)
on conflict (id) do nothing;

drop policy if exists qc_leave_docs_insert on storage.objects;
create policy qc_leave_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists qc_leave_docs_select on storage.objects;
create policy qc_leave_docs_select on storage.objects for select to authenticated using (
  bucket_id = 'leave-documents' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.qc_is_hr_or_admin()
    or exists (select 1 from public.leave_requests r
               where r.employee_id::text = (storage.foldername(name))[1]
                 and (r.current_approver_id = auth.uid() or r.reviewed_by = auth.uid()))));
