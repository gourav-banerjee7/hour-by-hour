-- Hierarchical tags (a tag can have sub-tags, and so on) and per-hour pointers.

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.tags (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text,
  created_at timestamptz not null default now()
);
create unique index tags_unique_name on public.tags
  (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index tags_user_idx on public.tags (user_id);

alter table public.tags enable row level security;
revoke all on public.tags from anon;
create policy "own tags" on public.tags
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Each hour holds a list of pointers: [{id, text, tags: [tag ids], manual?: bool}]
alter table public.hour_logs add column items jsonb not null default '[]'::jsonb;

alter publication supabase_realtime add table public.tags;
