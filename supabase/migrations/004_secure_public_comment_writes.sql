create table if not exists public.comment_submission_log (
  id uuid primary key default gen_random_uuid(),
  request_key text not null,
  page_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists comment_submission_log_request_key_created_at_idx
  on public.comment_submission_log (request_key, created_at desc);

create index if not exists comment_submission_log_page_url_created_at_idx
  on public.comment_submission_log (page_url, created_at desc);

alter table public.comment_submission_log enable row level security;

drop policy if exists "no public access to submission log" on public.comment_submission_log;
create policy "no public access to submission log"
  on public.comment_submission_log
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "public can insert comments" on public.comments;

create or replace function public.touch_comment_submission_log()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.comment_submission_log
  where created_at < now() - interval '1 day';
  return null;
end;
$$;

drop trigger if exists comment_submission_log_cleanup on public.comment_submission_log;
create trigger comment_submission_log_cleanup
  after insert on public.comment_submission_log
  for each statement
  execute function public.touch_comment_submission_log();
