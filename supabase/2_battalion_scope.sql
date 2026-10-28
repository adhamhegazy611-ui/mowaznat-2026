-- ============================================================
--  موازنات — كل حساب يشوف مشاريع كتيبته بس
--  بيتشغّل بعد schema.sql. مش بيلمس أي حاجة من جداول المقايسات.
--
--  mz_members.battalions:
--    null          → يشوف كل المشاريع
--    {'92','44'}   → يشوف مشاريع ك92 وك44 بس
--  المدير (admin) بيشوف كل حاجة دايماً.
--  مشروع كتيبته «71-44» بيظهر لحساب 71 ولحساب 44.
-- ============================================================

alter table public.mz_members add column if not exists battalions text[];

-- «71-44» → {71,44} ، «ك91-97» → {91,97} ، «الفوج» → {الفوج}
create or replace function public.mz_bat_tokens(b text)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array(
    select trim(x) from unnest(regexp_split_to_array(replace(coalesce(b, ''), 'ك', ''), '[-–,/+]')) as x
    where trim(x) <> ''
  ), '{}'::text[])
$$;

-- الكتايب المسموحة للحساب الحالي (null = كله)
create or replace function public.mz_my_bats()
returns text[] language sql stable security definer set search_path = '' as $$
  select case when m.role = 'admin' then null else m.battalions end
  from public.mz_members m where m.user_id = (select auth.uid())
$$;

create or replace function public.mz_can_see(b text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mz_members m
    where m.user_id = (select auth.uid())
      and (m.role = 'admin' or m.battalions is null or public.mz_bat_tokens(b) && m.battalions)
  )
$$;

-- ---------- الدوال اللي بترجع الكتايب كمان ----------
drop function if exists public.mz_me();
create function public.mz_me()
returns table (user_id uuid, username text, role text, battalions text[])
language sql stable security definer set search_path = '' as $$
  select u.id, split_part(u.email, '@', 1), m.role, case when m.role = 'admin' then null else m.battalions end
  from auth.users u left join public.mz_members m on m.user_id = u.id
  where u.id = (select auth.uid())
$$;

drop function if exists public.mz_list_users();
create function public.mz_list_users()
returns table (user_id uuid, username text, role text, battalions text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.mz_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  return query
    select u.id, split_part(u.email, '@', 1)::text, m.role, m.battalions
    from auth.users u left join public.mz_members m on m.user_id = u.id
    where u.email_confirmed_at is not null
    order by m.role nulls last, u.created_at;
end $$;

drop function if exists public.mz_set_role(uuid, text);
create function public.mz_set_role(p_user uuid, p_role text, p_battalions text[] default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.mz_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  if p_user = (select auth.uid()) then raise exception 'مينفعش تغيّر صلاحية حسابك'; end if;
  if p_role is null then
    delete from public.mz_members where user_id = p_user;
  else
    insert into public.mz_members (user_id, role, battalions)
    values (p_user, p_role, case when p_battalions = '{}' then null else p_battalions end)
    on conflict (user_id) do update set role = excluded.role, battalions = excluded.battalions;
  end if;
end $$;

-- ---------- الصلاحيات على المشاريع حسب الكتيبة ----------
drop policy if exists "mz projects read"   on public.mz_projects;
drop policy if exists "mz projects insert" on public.mz_projects;
drop policy if exists "mz projects update" on public.mz_projects;
create policy "mz projects read" on public.mz_projects for select to authenticated
  using (public.mz_can_see(battalion));
create policy "mz projects insert" on public.mz_projects for insert to authenticated
  with check ((select public.mz_role()) in ('admin','editor') and public.mz_can_see(battalion));
create policy "mz projects update" on public.mz_projects for update to authenticated
  using ((select public.mz_role()) in ('admin','editor') and public.mz_can_see(battalion))
  with check ((select public.mz_role()) in ('admin','editor') and public.mz_can_see(battalion));

-- سجل التعديلات: كل واحد يشوف سجل المشاريع اللي يقدر يشوفها، والمدير يشوف كله
drop policy if exists "mz history read" on public.mz_history;
create policy "mz history read" on public.mz_history for select to authenticated
  using (
    (select public.mz_role()) = 'admin'
    or exists (select 1 from public.mz_projects p where p.id = mz_history.project_id)
  );

revoke execute on function public.mz_my_bats() from public, anon;
revoke execute on function public.mz_can_see(text) from public, anon;
revoke execute on function public.mz_me() from public, anon;
revoke execute on function public.mz_list_users() from public, anon;
revoke execute on function public.mz_set_role(uuid, text, text[]) from public, anon;
grant execute on function public.mz_my_bats() to authenticated;
grant execute on function public.mz_can_see(text) to authenticated;
grant execute on function public.mz_me() to authenticated;
grant execute on function public.mz_list_users() to authenticated;
grant execute on function public.mz_set_role(uuid, text, text[]) to authenticated;
