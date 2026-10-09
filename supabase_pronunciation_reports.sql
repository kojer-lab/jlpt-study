-- JLPT N1 pronunciation-report inbox (separate from personal study sync).
-- One-time setup: paste into the same Supabase project's SQL Editor.
-- Designed for GitHub Pages clients using a publishable / anon key AND a signed-in
-- permanent Supabase Auth account. Never use a service_role / secret key in HTML.

create schema if not exists private;

create table if not exists public.jlpt_pronunciation_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id text not null check (char_length(word_id) between 1 and 128),
  target_kind text not null check (target_kind in ('word', 'example')),
  example_index smallint,
  word_text text not null check (char_length(word_text) between 1 and 160),
  japanese_text text not null check (char_length(japanese_text) between 1 and 1200),
  reading text not null default '' check (char_length(reading) <= 160),
  audio_path text not null default '' check (
    char_length(audio_path) <= 240
    and (audio_path = '' or
      (audio_path ~ '^audio/vocab/[A-Za-z0-9_./-]+\.mp3$'
        and position('..' in audio_path) = 0))
  ),
  error_type text not null check (error_type in (
    '한자 읽기가 다름',
    '발음·억양이 부자연스러움',
    '문장 끝에 이상한 소리',
    '다른 단어·문장을 읽음',
    '음성이 없거나 재생 실패',
    '기타'
  )),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'fixed', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jlpt_report_target_consistency check (
    (target_kind = 'word' and example_index is null)
    or (target_kind = 'example' and example_index between 0 and 9)
  )
);

create index if not exists jlpt_pron_reports_user_recent_idx
  on public.jlpt_pronunciation_reports (user_id, created_at desc);
create index if not exists jlpt_pron_reports_target_recent_idx
  on public.jlpt_pronunciation_reports (user_id, word_id, created_at desc);

alter table public.jlpt_pronunciation_reports enable row level security;

drop policy if exists "JLPT reports select own" on public.jlpt_pronunciation_reports;
create policy "JLPT reports select own" on public.jlpt_pronunciation_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "JLPT reports insert own" on public.jlpt_pronunciation_reports;
create policy "JLPT reports insert own" on public.jlpt_pronunciation_reports
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  );

-- Data API users cannot set other users' IDs, timestamps, or moderation statuses.
-- They cannot edit or delete reports, even their own.
revoke all on public.jlpt_pronunciation_reports from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select (
  id, word_id, target_kind, example_index, word_text, japanese_text,
  reading, audio_path, error_type, note, status, created_at, updated_at
) on public.jlpt_pronunciation_reports to authenticated;
grant insert (
  word_id, target_kind, example_index, word_text, japanese_text,
  reading, audio_path, error_type, note
) on public.jlpt_pronunciation_reports to authenticated;

-- Server-side abuse protection. It runs on the DB server, not in editable
-- browser JavaScript, and serializes each user's submissions.
-- Kept in an UNEXPOSED private schema, with an empty search_path.
create or replace function private.jlpt_guard_pronunciation_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  if auth.uid() is null
    or auth.uid() <> new.user_id
    or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false'
  then
    raise exception 'report_login_required' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 20261009)
  );

  if exists (
    select 1 from public.jlpt_pronunciation_reports r
    where r.user_id = new.user_id
      and r.word_id = new.word_id
      and r.target_kind = new.target_kind
      and r.example_index is not distinct from new.example_index
      and r.error_type = new.error_type
      -- A resolved report must not block reporting a persisting / recurring bug.
      and r.status in ('open', 'reviewing')
      and r.created_at > pg_catalog.now() - interval '24 hours'
  ) then
    raise exception 'duplicate_report' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.jlpt_pronunciation_reports r
    where r.user_id = new.user_id
      and r.created_at > pg_catalog.now() - interval '1 hour'
  ) >= 12 then
    raise exception 'report_rate_hour' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.jlpt_pronunciation_reports r
    where r.user_id = new.user_id
      and r.created_at > pg_catalog.now() - interval '24 hours'
  ) >= 50 then
    raise exception 'report_rate_day' using errcode = 'P0001';
  end if;

  return new;
end;
$guard$;

revoke all on function private.jlpt_guard_pronunciation_report() from public, anon, authenticated;

drop trigger if exists jlpt_guard_pronunciation_report_insert on public.jlpt_pronunciation_reports;
create trigger jlpt_guard_pronunciation_report_insert
  before insert on public.jlpt_pronunciation_reports
  for each row execute function private.jlpt_guard_pronunciation_report();

-- Refresh PostgREST's schema cache after creating the table.
notify pgrst, 'reload schema';

-- Review reports as the Supabase project administrator in SQL Editor:
-- select id, created_at, word_text, japanese_text, error_type, note, audio_path, status
-- from public.jlpt_pronunciation_reports order by created_at desc limit 100;
-- update public.jlpt_pronunciation_reports set status = 'fixed', updated_at = now()
-- where id = 123;  -- substitute an actual report ID, after verifying the MP3
