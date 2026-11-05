-- In-app reminders, Google Calendar connection, and AI-suggested actions.

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 1000),
  due_date date not null,
  due_time time,
  done boolean not null default false,
  done_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  source_day date,
  source_hour smallint check (source_hour between 0 and 23),
  source_key text,
  gcal_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_user_due_idx on public.reminders (user_id, done, due_date);
-- the same AI suggestion can only be added once
create unique index reminders_source_key_idx on public.reminders (user_id, source_key) where source_key is not null;

alter table public.reminders enable row level security;
revoke all on public.reminders from anon;
create policy "own reminders" on public.reminders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger reminders_touch before update on public.reminders
  for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.reminders;

-- Display flags the app can read. The real tokens live in google_connections.
alter table public.profiles
  add column gcal_connected boolean not null default false,
  add column gcal_sync_all boolean not null default false;

-- Encrypted Google refresh tokens. No policies and no client grants:
-- only the server (service role) can read or write this table.
create table public.google_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_enc text not null,
  google_email text,
  created_at timestamptz not null default now()
);
alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;
