-- Hour by Hour: schema. Every table is locked to its owner with row-level security.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC',
  active_start smallint not null default 8 check (active_start between 0 and 23),
  active_end smallint not null default 22 check (active_end between 0 and 23),
  reminders_enabled boolean not null default true,
  custom_activities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hour_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  activities jsonb not null default '{}'::jsonb,
  note text not null default '' check (char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, hour)
);
create index hour_logs_user_day_idx on public.hour_logs (user_id, day desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.profiles enable row level security;
alter table public.hour_logs enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.profiles, public.hour_logs, public.push_subscriptions from anon;

create policy "own profile" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own hours" on public.hour_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own devices" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A profile row appears the moment someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger hour_logs_touch before update on public.hour_logs
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Live updates between phone and laptop.
alter publication supabase_realtime add table public.hour_logs;
