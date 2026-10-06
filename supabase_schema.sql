-- JLPT N1 Study v3.1 sync table
-- Run this once in Supabase > SQL Editor.

create table if not exists public.jlpt_study_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.jlpt_study_state enable row level security;

drop policy if exists "Users can read own JLPT state" on public.jlpt_study_state;
create policy "Users can read own JLPT state"
on public.jlpt_study_state for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own JLPT state" on public.jlpt_study_state;
create policy "Users can insert own JLPT state"
on public.jlpt_study_state for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own JLPT state" on public.jlpt_study_state;
create policy "Users can update own JLPT state"
on public.jlpt_study_state for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own JLPT state" on public.jlpt_study_state;
create policy "Users can delete own JLPT state"
on public.jlpt_study_state for delete
using (auth.uid() = user_id);

-- Allow authenticated browser clients to reach this table through the Data API.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.jlpt_study_state to authenticated;
