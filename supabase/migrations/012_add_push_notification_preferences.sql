alter table public.push_subscriptions
  add column if not exists notify_round_events boolean not null default false;
