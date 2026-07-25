-- Autoposting: YouTube + Instagram connections, posts and per-platform targets.

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram')),
  external_account_id text not null,
  external_account_name text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, platform)
);

alter table public.social_connections enable row level security;
revoke all on public.social_connections from anon, authenticated;
grant all on public.social_connections to service_role;

drop trigger if exists social_connections_touch_updated_at on public.social_connections;
create trigger social_connections_touch_updated_at
before update on public.social_connections
for each row execute function private.touch_updated_at();

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null default '',
  caption text not null default '',
  bucket_id text not null default 'social-uploads',
  storage_path text,
  original_name text,
  mime_type text,
  size_bytes bigint,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_posts_artist_idx
  on public.social_posts(artist_id, created_at desc);

alter table public.social_posts enable row level security;
revoke all on public.social_posts from anon;
grant select, insert, update, delete on public.social_posts to authenticated;

drop policy if exists "artist owns social posts" on public.social_posts;
create policy "artist owns social posts"
on public.social_posts for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop trigger if exists social_posts_touch_updated_at on public.social_posts;
create trigger social_posts_touch_updated_at
before update on public.social_posts
for each row execute function private.touch_updated_at();

create table if not exists public.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'success', 'failed')),
  external_post_id text,
  external_post_url text,
  error_message text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, platform)
);

create index if not exists social_post_targets_post_idx
  on public.social_post_targets(post_id);

alter table public.social_post_targets enable row level security;
revoke all on public.social_post_targets from anon;
grant select on public.social_post_targets to authenticated;
grant all on public.social_post_targets to service_role;

drop policy if exists "artist reads own post targets" on public.social_post_targets;
create policy "artist reads own post targets"
on public.social_post_targets for select
to authenticated
using (private.owns_artist(artist_id));

-- Storage bucket for temporary video hosting (deleted after a post fully succeeds).
insert into storage.buckets (id, name, public)
values ('social-uploads', 'social-uploads', true)
on conflict (id) do nothing;

drop policy if exists "public can read social uploads" on storage.objects;
drop policy if exists "artist can upload own social media" on storage.objects;
drop policy if exists "artist can update own social media" on storage.objects;
drop policy if exists "artist can delete own social media" on storage.objects;

create policy "public can read social uploads"
on storage.objects for select
using (bucket_id = 'social-uploads');

create policy "artist can upload own social media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'social-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "artist can update own social media"
on storage.objects for update
to authenticated
using (bucket_id = 'social-uploads' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'social-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "artist can delete own social media"
on storage.objects for delete
to authenticated
using (bucket_id = 'social-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
