alter table public.push_subscriptions
  add column if not exists app_id text,
  add column if not exists app_name text,
  add column if not exists app_origin text,
  add column if not exists app_scope text;

update public.push_subscriptions
set
  app_id = coalesce(app_id, 'discussit-moderator'),
  app_name = coalesce(app_name, 'DiscussIt Moderator'),
  app_origin = coalesce(app_origin, 'https://discussit-portal.vercel.app'),
  app_scope = coalesce(app_scope, 'https://discussit-portal.vercel.app/')
where
  app_id is null
  or app_name is null
  or app_origin is null
  or app_scope is null;
