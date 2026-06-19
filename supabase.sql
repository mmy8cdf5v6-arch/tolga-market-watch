create table if not exists public.watchlists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  symbols text[] not null default array[]::text[],
  updated_at timestamptz not null default now(),
  constraint watchlists_max_symbols check (
    coalesce(array_length(symbols, 1), 0) <= 100
  )
);

alter table public.watchlists enable row level security;

create policy "watchlists_select_own"
  on public.watchlists
  for select
  using (auth.uid() = user_id);

create policy "watchlists_insert_own"
  on public.watchlists
  for insert
  with check (auth.uid() = user_id);

create policy "watchlists_update_own"
  on public.watchlists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "watchlists_delete_own"
  on public.watchlists
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_watchlists_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_watchlists_updated_at on public.watchlists;
create trigger trg_watchlists_updated_at
  before update on public.watchlists
  for each row
  execute function public.set_watchlists_updated_at();

alter table public.watchlists replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.watchlists;
exception
  when duplicate_object then null;
end $$;
