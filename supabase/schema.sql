-- ============================================================
--  موازنات — قاعدة البيانات
--  بتتحط في نفس مشروع Supabase بتاع «متابعة المقايسات» (Mo2ysaaaat).
--  كل الجداول والدوال بتبدأ بـ mz_ عشان ما تتلخبطش مع جداول المقايسات،
--  ومش بتعدّل أي حاجة من بتاعة المقايسات.
--
--  الحسابات مشتركة: نفس اسم المستخدم وكلمة المرور بتوع المقايسات.
--  الصلاحية في «موازنات» منفصلة ومتسجّلة في mz_members.
-- ============================================================

-- ---------- الأعضاء والصلاحيات ----------
-- admin  : كل حاجة + إدارة الصلاحيات والمراجعين + الحذف
-- editor : إضافة وتعديل المشاريع
-- viewer : عرض فقط
-- اللي مش موجود هنا مالوش دخول على «موازنات» حتى لو عنده حساب في المقايسات
create table if not exists public.mz_members (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'viewer' check (role in ('admin','editor','viewer')),
  created_at  timestamptz not null default now()
);

create or replace function public.mz_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.mz_members where user_id = (select auth.uid())
$$;

-- اسم المستخدم = الجزء اللي قبل @ في الإيميل (زي المقايسات: ahmed@mo2ysaat.app → ahmed)
create or replace function public.mz_me()
returns table (user_id uuid, username text, role text)
language sql stable security definer set search_path = '' as $$
  select u.id, split_part(u.email, '@', 1), m.role
  from auth.users u left join public.mz_members m on m.user_id = u.id
  where u.id = (select auth.uid())
$$;

-- قائمة كل الحسابات (للمدير بس) عشان يدّيهم صلاحية على «موازنات»
create or replace function public.mz_list_users()
returns table (user_id uuid, username text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.mz_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  return query
    select u.id, split_part(u.email, '@', 1)::text, m.role
    from auth.users u left join public.mz_members m on m.user_id = u.id
    where u.email_confirmed_at is not null
    order by m.role nulls last, u.created_at;
end $$;

-- تغيير الصلاحية: role = null يعني يشيل الدخول
create or replace function public.mz_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.mz_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  if p_user = (select auth.uid()) then raise exception 'مينفعش تغيّر صلاحية حسابك'; end if;
  if p_role is null then
    delete from public.mz_members where user_id = p_user;
  else
    insert into public.mz_members (user_id, role) values (p_user, p_role)
    on conflict (user_id) do update set role = excluded.role;
  end if;
end $$;

-- ---------- المراجعين (القائمة المنسدلة X1:AD1 في الشيت) ----------
create table if not exists public.mz_reviewers (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int not null default 0,
  active      boolean not null default true
);

-- ---------- المشاريع (شيت «موقف المشاريع») ----------
create table if not exists public.mz_projects (
  id                  bigint generated always as identity primary key,
  sort_order          int not null default 0,                 -- م
  name                text not null,                          -- بيان الاعمال
  sector              text,                                   -- القطاع (مثل: مصرف الحارس)
  stopped_count       int,                                    -- عدد المقايسات المتوقفة
  delivered_count     int,                                    -- مقايسات تم تسليمها
  battalion           text,                                   -- الكتيبة (92 / 71-44 / الفوج ...)
  reviewer            text,                                   -- المراجع
  pricing_by          text,                                   -- تسعير
  contracts_reviewer  text,                                   -- مراجعة العقود
  self_reviewer       text,                                   -- مراجعة الذاتي
  date_drawings       date,                                   -- تاريخ مراجعة اللوحات
  date_pricing        date,                                   -- تاريخ تسعير
  date_contracts      date,                                   -- تاريخ مراجعة العقود
  date_self           date,                                   -- تاريخ مراجعة الذاتي
  st_drawings         text check (st_drawings  in ('✓','✗')), -- لوحات
  st_budget           text check (st_budget    in ('✓','✗')), -- موازنة
  st_self             text check (st_self      in ('✓','✗')), -- ذاتي
  st_contracts        text check (st_contracts in ('✓','✗')), -- عقود
  blocked_on          text,                                   -- متوقف على
  action_taken        text,                                   -- ما تم اجراؤه
  total_incl          numeric,                                -- شامل (مليون)
  total_excl          numeric,                                -- غير شامل (مليون)
  budget_status       text,                                   -- موقف الموازنة
  file_path           text,                                   -- مكان المشروع
  notes               text,                                   -- ملاحظات مكتب التصميمات
  colors              jsonb not null default '{}'::jsonb,     -- لون كل خانة زي الشيت
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null
);
create index if not exists mz_projects_sort_idx on public.mz_projects (sort_order);

-- ---------- سجل التعديلات ----------
create table if not exists public.mz_history (
  id            bigint generated always as identity primary key,
  project_id    bigint,
  project_name  text,
  action        text not null,          -- insert / update / delete
  changes       jsonb,                  -- {field: [old, new]}
  user_id       uuid,
  user_email    text,                   -- اسم المستخدم
  created_at    timestamptz not null default now()
);
create index if not exists mz_history_project_idx on public.mz_history (project_id, created_at desc);

create or replace function public.mz_log_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  diff jsonb := '{}'::jsonb;
  k text;
  o jsonb; n jsonb;
  uname text;
begin
  select split_part(u.email, '@', 1) into uname from auth.users u where u.id = (select auth.uid());
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := (select auth.uid());
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at','updated_by','created_at') and (o->k) is distinct from (n->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(o->k, n->k));
      end if;
    end loop;
    if diff <> '{}'::jsonb then
      insert into public.mz_history (project_id, project_name, action, changes, user_id, user_email)
      values (new.id, new.name, 'update', diff, (select auth.uid()), uname);
    end if;
    return new;
  elsif tg_op = 'INSERT' then
    new.updated_by := (select auth.uid());
    return new;
  else
    insert into public.mz_history (project_id, project_name, action, changes, user_id, user_email)
    values (old.id, old.name, 'delete', to_jsonb(old), (select auth.uid()), uname);
    return old;
  end if;
end $$;

create or replace function public.mz_log_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    insert into public.mz_history (project_id, project_name, action, user_id, user_email)
    values (new.id, new.name, 'insert', (select auth.uid()),
            (select split_part(u.email, '@', 1) from auth.users u where u.id = (select auth.uid())));
  end if;
  return new;
end $$;

drop trigger if exists mz_projects_change on public.mz_projects;
create trigger mz_projects_change before insert or update or delete on public.mz_projects
  for each row execute function public.mz_log_change();
drop trigger if exists mz_projects_insert_log on public.mz_projects;
create trigger mz_projects_insert_log after insert on public.mz_projects
  for each row execute function public.mz_log_insert();

-- ---------- الصلاحيات (RLS) ----------
alter table public.mz_members   enable row level security;
alter table public.mz_reviewers enable row level security;
alter table public.mz_projects  enable row level security;
alter table public.mz_history   enable row level security;

drop policy if exists "mz members self" on public.mz_members;
create policy "mz members self" on public.mz_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.mz_role()) = 'admin');

drop policy if exists "mz reviewers read"  on public.mz_reviewers;
drop policy if exists "mz reviewers admin" on public.mz_reviewers;
create policy "mz reviewers read"  on public.mz_reviewers for select to authenticated
  using ((select public.mz_role()) is not null);
create policy "mz reviewers admin" on public.mz_reviewers for all to authenticated
  using ((select public.mz_role()) = 'admin') with check ((select public.mz_role()) = 'admin');

drop policy if exists "mz projects read"   on public.mz_projects;
drop policy if exists "mz projects insert" on public.mz_projects;
drop policy if exists "mz projects update" on public.mz_projects;
drop policy if exists "mz projects delete" on public.mz_projects;
create policy "mz projects read"   on public.mz_projects for select to authenticated
  using ((select public.mz_role()) is not null);
create policy "mz projects insert" on public.mz_projects for insert to authenticated
  with check ((select public.mz_role()) in ('admin','editor'));
create policy "mz projects update" on public.mz_projects for update to authenticated
  using ((select public.mz_role()) in ('admin','editor')) with check ((select public.mz_role()) in ('admin','editor'));
create policy "mz projects delete" on public.mz_projects for delete to authenticated
  using ((select public.mz_role()) = 'admin');

drop policy if exists "mz history read" on public.mz_history;
create policy "mz history read" on public.mz_history for select to authenticated
  using ((select public.mz_role()) is not null);

-- الدوال الداخلية مش للاستدعاء من برّه
revoke execute on function public.mz_log_change() from public, anon, authenticated;
revoke execute on function public.mz_log_insert() from public, anon, authenticated;
revoke execute on function public.mz_list_users() from public, anon;
revoke execute on function public.mz_set_role(uuid, text) from public, anon;
revoke execute on function public.mz_me() from public, anon;
grant execute on function public.mz_list_users() to authenticated;
grant execute on function public.mz_set_role(uuid, text) to authenticated;
grant execute on function public.mz_me() to authenticated;

-- تحديث لحظي: أي تعديل يظهر عند الكل من غير ريفريش
do $$ begin
  alter publication supabase_realtime add table public.mz_projects;
exception when others then null; end $$;

-- ---------- أول مرة: مديرين المقايسات بيبقوا مديرين في «موازنات» ----------
insert into public.mz_members (user_id, role)
select user_id, 'admin' from public.app_users where role = 'admin'
on conflict (user_id) do nothing;

revoke execute on function public.mz_role() from public, anon;
grant execute on function public.mz_role() to authenticated;
