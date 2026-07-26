-- Text posts (VK / Telegram) with image & audio attachments.
-- Extends the social_* tables that were video-only (YouTube/Instagram).

do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where conrelid in ('public.social_connections'::regclass, 'public.social_post_targets'::regclass)
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%platform%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.social_connections
  add constraint social_connections_platform_check
  check (platform in ('youtube', 'instagram', 'telegram', 'vk'));

alter table public.social_post_targets
  add constraint social_post_targets_platform_check
  check (platform in ('youtube', 'instagram', 'telegram', 'vk'));

-- A social_post is now either a video ('video') or a text post ('text').
-- Text posts carry a body and a list of attachments (images/audio staged in R2).
alter table public.social_posts
  add column if not exists post_type text not null default 'video',
  add column if not exists body text not null default '',
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.social_posts drop constraint if exists social_posts_post_type_check;
alter table public.social_posts
  add constraint social_posts_post_type_check
  check (post_type in ('video', 'text'));
