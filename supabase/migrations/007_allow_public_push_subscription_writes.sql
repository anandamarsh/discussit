drop policy if exists "moderator can insert push subscriptions" on public.push_subscriptions;
create policy "public can insert push subscriptions"
  on public.push_subscriptions
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "moderator can update push subscriptions" on public.push_subscriptions;
create policy "public can update push subscriptions"
  on public.push_subscriptions
  for update
  to anon, authenticated
  using (true)
  with check (true);
