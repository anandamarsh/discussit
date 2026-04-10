create table if not exists public.analytics_game_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.analytics_sessions(session_id) on delete cascade,
  player_id text not null,
  game_id text not null,
  game_name text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_game_events_session_id_idx
  on public.analytics_game_events (session_id, occurred_at desc);

create index if not exists analytics_game_events_game_id_idx
  on public.analytics_game_events (game_id, occurred_at desc);

create index if not exists analytics_game_events_event_type_idx
  on public.analytics_game_events (event_type, occurred_at desc);

alter table public.analytics_game_events enable row level security;

drop policy if exists "authenticated users can read analytics game events" on public.analytics_game_events;
create policy "authenticated users can read analytics game events"
  on public.analytics_game_events
  for select
  to authenticated
  using (true);
