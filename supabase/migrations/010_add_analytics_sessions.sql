create table if not exists public.analytics_sessions (
  session_id text primary key,
  player_id text not null,
  game_id text not null,
  game_name text not null,
  game_url text not null default '',
  shell_url text not null default '',
  source_origin text not null default '',
  launch_mode text not null default 'embedded' check (launch_mode in ('embedded', 'new-tab')),
  started_at timestamptz not null,
  last_heartbeat_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  duration_seconds integer,
  country_code text,
  region_code text,
  region text,
  city text,
  latitude double precision,
  longitude double precision,
  timezone text,
  language text,
  platform text,
  user_agent text,
  screen_width integer,
  screen_height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_sessions_started_at_idx
  on public.analytics_sessions (started_at desc);

create index if not exists analytics_sessions_last_heartbeat_at_idx
  on public.analytics_sessions (last_heartbeat_at desc);

create index if not exists analytics_sessions_game_id_started_at_idx
  on public.analytics_sessions (game_id, started_at desc);

create index if not exists analytics_sessions_country_code_started_at_idx
  on public.analytics_sessions (country_code, started_at desc);

create or replace function public.set_analytics_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists analytics_sessions_set_updated_at on public.analytics_sessions;
create trigger analytics_sessions_set_updated_at
before update on public.analytics_sessions
for each row
execute function public.set_analytics_sessions_updated_at();

alter table public.analytics_sessions enable row level security;

drop policy if exists "authenticated users can read analytics sessions" on public.analytics_sessions;
create policy "authenticated users can read analytics sessions"
  on public.analytics_sessions
  for select
  to authenticated
  using (true);
