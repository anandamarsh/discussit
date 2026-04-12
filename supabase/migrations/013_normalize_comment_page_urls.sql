create or replace function public.normalize_comment_page_url(input_url text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
begin
  if input_url is null then
    return null;
  end if;

  normalized := btrim(input_url);

  if normalized = '' then
    return normalized;
  end if;

  normalized := regexp_replace(normalized, '[?#].*$', '');
  normalized := regexp_replace(normalized, '^(https?://)(www\.)?seemaths\.com(?=/|$)', '\1seemaths.com', 'i');
  normalized := regexp_replace(normalized, '^(https?://)interactive-maths\.vercel\.app(?=/|$)', '\1seemaths.com', 'i');

  if normalized ~* '^https?://[^/]+$' then
    normalized := normalized || '/';
  end if;

  return normalized;
end;
$$;

create or replace function public.normalize_comment_page_url_before_write()
returns trigger
language plpgsql
as $$
begin
  new.page_url := public.normalize_comment_page_url(new.page_url);
  return new;
end;
$$;

drop trigger if exists comments_normalize_page_url on public.comments;
create trigger comments_normalize_page_url
  before insert or update of page_url on public.comments
  for each row
  execute function public.normalize_comment_page_url_before_write();

drop trigger if exists comment_submission_log_normalize_page_url on public.comment_submission_log;
create trigger comment_submission_log_normalize_page_url
  before insert or update of page_url on public.comment_submission_log
  for each row
  execute function public.normalize_comment_page_url_before_write();

alter table public.comments disable trigger comments_update_guard;

update public.comments
set page_url = public.normalize_comment_page_url(page_url)
where page_url is distinct from public.normalize_comment_page_url(page_url);

alter table public.comments enable trigger comments_update_guard;

update public.comment_submission_log
set page_url = public.normalize_comment_page_url(page_url)
where page_url is distinct from public.normalize_comment_page_url(page_url);

create or replace function public.get_comments_for_page(requested_page_url text)
returns table (
  id uuid,
  page_url text,
  author_name text,
  body text,
  created_at timestamptz,
  likes integer,
  dislikes integer
)
language sql
stable
as $$
  select
    comments.id,
    comments.page_url,
    comments.author_name,
    comments.body,
    comments.created_at,
    comments.likes,
    comments.dislikes
  from public.comments
  where comments.page_url = public.normalize_comment_page_url(requested_page_url)
  order by comments.created_at desc;
$$;

grant execute on function public.get_comments_for_page(text) to anon, authenticated;
