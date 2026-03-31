create extension if not exists pgcrypto;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  page_url text not null,
  author_name text not null default 'Anonymous',
  author_email text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  likes integer not null default 0,
  dislikes integer not null default 0,
  status text not null default 'Unread' check (status in ('Unread', 'Read'))
);

create index if not exists comments_page_url_created_at_idx
  on public.comments (page_url, created_at);

alter table public.comments enable row level security;

drop policy if exists "public can read comments" on public.comments;
create policy "public can read comments"
  on public.comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public can insert comments" on public.comments;
create policy "public can insert comments"
  on public.comments
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public can update comments" on public.comments;
create policy "public can update comments"
  on public.comments
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "public can delete comments" on public.comments;
create policy "public can delete comments"
  on public.comments
  for delete
  to anon, authenticated
  using (true);
