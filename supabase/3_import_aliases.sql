-- ============================================================
--  موازنات — أسماء المشاريع في شيت «موقف المقايسات المتوقفة»
--  لما المدير يربط اسم من الشيت بمشروع في الموقع، الربط بيتحفظ هنا
--  عشان المرة الجاية يتطابق لوحده.
-- ============================================================
create table if not exists public.mz_aliases (
  alias       text primary key,            -- اسم المشروع في الشيت بعد التوحيد (normalize)
  project_id  bigint references public.mz_projects(id) on delete cascade,  -- null = تجاهل الاسم ده
  created_at  timestamptz not null default now()
);

alter table public.mz_aliases enable row level security;
drop policy if exists "mz aliases read"  on public.mz_aliases;
drop policy if exists "mz aliases admin" on public.mz_aliases;
create policy "mz aliases read" on public.mz_aliases for select to authenticated
  using ((select public.mz_role()) is not null);
create policy "mz aliases admin" on public.mz_aliases for all to authenticated
  using ((select public.mz_role()) = 'admin') with check ((select public.mz_role()) = 'admin');
