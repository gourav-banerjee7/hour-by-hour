-- Planner board (one persistent whiteboard per user) and plan-linked actions.
-- Additive only: one new table, a relaxed constraint, two new nullable columns.

create table public.plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- [{ id, text, x (0..1 of board width), y (px), c (ink colour) }]
  blocks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;
revoke all on public.plans from anon;
create policy "own plan" on public.plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.plans;

-- Actions: an action no longer needs a date, and can point back to a plan note.
alter table public.reminders alter column due_date drop not null;
alter table public.reminders
  add column plan_block_id text,
  add column plan_text text check (plan_text is null or char_length(plan_text) <= 300);
create index reminders_plan_block_idx on public.reminders (user_id, plan_block_id) where plan_block_id is not null;
