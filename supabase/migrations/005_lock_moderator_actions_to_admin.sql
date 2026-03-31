create or replace function public.current_request_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.guard_comment_update()
returns trigger
language plpgsql
as $$
declare
  admin_email constant text := 'amarsh.anand@gmail.com';
  request_email text := public.current_request_email();
  is_admin boolean := request_email = admin_email;
begin
  if is_admin then
    return new;
  end if;

  if new.page_url is distinct from old.page_url
    or new.author_name is distinct from old.author_name
    or new.author_email is distinct from old.author_email
    or new.body is distinct from old.body
    or new.status is distinct from old.status
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only the moderator can change comment content or status';
  end if;

  if new.likes < 0
    or new.dislikes < 0
    or abs(new.likes - old.likes) > 1
    or abs(new.dislikes - old.dislikes) > 1
  then
    raise exception 'Invalid reaction update';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_update_guard on public.comments;
create trigger comments_update_guard
  before update on public.comments
  for each row
  execute function public.guard_comment_update();

drop policy if exists "public can update comments" on public.comments;
create policy "public can update reactions and moderator can manage comments"
  on public.comments
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "public can delete comments" on public.comments;
create policy "moderator can delete comments"
  on public.comments
  for delete
  to authenticated
  using (public.current_request_email() = 'amarsh.anand@gmail.com');
