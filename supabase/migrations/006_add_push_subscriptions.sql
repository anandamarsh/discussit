create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  expiration_time bigint,
  keys_auth text not null,
  keys_p256dh text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_push_subscription()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.touch_push_subscription();

alter table public.push_subscriptions enable row level security;

drop policy if exists "moderator can read push subscriptions" on public.push_subscriptions;
create policy "moderator can read push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (public.current_request_email() = 'amarsh.anand@gmail.com');

drop policy if exists "moderator can insert push subscriptions" on public.push_subscriptions;
create policy "moderator can insert push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (public.current_request_email() = 'amarsh.anand@gmail.com');

drop policy if exists "moderator can update push subscriptions" on public.push_subscriptions;
create policy "moderator can update push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (public.current_request_email() = 'amarsh.anand@gmail.com')
  with check (public.current_request_email() = 'amarsh.anand@gmail.com');

drop policy if exists "moderator can delete push subscriptions" on public.push_subscriptions;
create policy "moderator can delete push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (public.current_request_email() = 'amarsh.anand@gmail.com');
