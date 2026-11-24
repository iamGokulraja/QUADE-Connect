-- =====================================================================================
-- MY PROFILE: every signed-in person can see and edit their own details.
-- Run once in the Supabase SQL Editor. Safe to re-run. Nothing existing is changed or removed.
-- Role, department, designation, employee code and joined date can NOT be changed by the person.
-- =====================================================================================
alter table public.profiles
  add column if not exists phone         text,
  add column if not exists date_of_birth date,
  add column if not exists about         text,
  add column if not exists city          text,
  add column if not exists theme         text not null default 'dark',
  add column if not exists employee_code text,        -- these three already exist in your project; listed so this script can never fail
  add column if not exists department    text,
  add column if not exists designation   text,
  add column if not exists avatar_path   text;

alter table public.profiles drop constraint if exists qc_profiles_theme_chk;
alter table public.profiles add constraint qc_profiles_theme_chk check (theme in ('dark', 'light'));

-- Read my own profile (+ joined date = when my account was created)
create or replace function public.my_profile()
returns table (id uuid, full_name text, email text, role text, phone text, date_of_birth date, about text, city text,
               theme text, employee_code text, department text, designation text, avatar_path text, joined_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.full_name, p.email, p.role::text, p.phone, p.date_of_birth, p.about, p.city, p.theme,
         p.employee_code, p.department, p.designation, p.avatar_path, u.created_at
    from public.profiles p
    left join auth.users u on u.id = p.id
   where p.id = auth.uid()
$$;

-- Edit my own bio details (only these columns, with checks)
create or replace function public.update_my_profile(p_full_name text, p_phone text, p_date_of_birth date, p_about text, p_city text)
returns void language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(p_full_name, '')); ph text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if length(n) < 2 or length(n) > 80 then raise exception 'Name must be 2 to 80 characters.'; end if;
  if ph is not null and ph !~ '^[0-9+()\- ]{7,20}$' then raise exception 'Enter a valid phone number (digits, +, spaces, brackets, dashes; 7-20 characters).'; end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date - interval '14 years' or p_date_of_birth < date '1940-01-01') then
    raise exception 'Enter a valid date of birth.'; end if;
  if length(coalesce(p_about, '')) > 300 then raise exception 'About must be 300 characters or fewer.'; end if;
  if length(coalesce(p_city, '')) > 80 then raise exception 'City must be 80 characters or fewer.'; end if;
  update public.profiles
     set full_name = n, phone = ph, date_of_birth = p_date_of_birth,
         about = nullif(btrim(coalesce(p_about, '')), ''), city = nullif(btrim(coalesce(p_city, '')), '')
   where id = auth.uid();
end $$;

create or replace function public.set_my_theme(p_theme text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_theme not in ('dark', 'light') then raise exception 'Unknown theme.'; end if;
  update public.profiles set theme = p_theme where id = auth.uid();
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('my_profile','update_my_profile','set_my_theme') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
