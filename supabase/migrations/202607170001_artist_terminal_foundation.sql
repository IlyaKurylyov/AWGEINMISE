-- INMISE Artist Terminal foundation
-- Prepared 2026-07-17. Review before running in Supabase SQL Editor.
-- This migration is additive and preserves existing artist/auth UUIDs.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

do $$
begin
  create type public.beat_publication_status as enum (
    'private',
    'draft',
    'published',
    'sold',
    'archived'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.artist_project_status as enum (
    'idea',
    'demo',
    'mix',
    'master',
    'scheduled',
    'released',
    'archived'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.release_event_status as enum (
    'planned',
    'ready',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

-- Existing marketplace beats stay visible. New beats are private by default.
alter table public.beats
  add column if not exists publication_status public.beat_publication_status,
  add column if not exists public_preview_path text,
  add column if not exists private_master_path text,
  add column if not exists cover_url text,
  add column if not exists currency text,
  add column if not exists published_at timestamptz;

update public.beats
set
  publication_status = 'published',
  published_at = coalesce(published_at, created_at),
  currency = coalesce(nullif(currency, ''), 'RUB')
where publication_status is null;

alter table public.beats
  alter column publication_status set default 'private',
  alter column publication_status set not null,
  alter column currency set default 'RUB',
  alter column currency set not null;

alter table public.beats
  drop constraint if exists beats_currency_format_check;
alter table public.beats
  add constraint beats_currency_format_check
  check (currency ~ '^[A-Z]{3}$');

create index if not exists beats_publication_status_idx
  on public.beats(publication_status, created_at desc);

-- The production tables predate the local schema and their id columns were
-- created without primary-key/unique constraints. The values are already
-- unique and non-null; these indexes make them safe FK targets without
-- replacing or rewriting any existing identifiers.
create unique index if not exists artists_id_unique_idx
  on public.artists(id);
create unique index if not exists beats_id_unique_idx
  on public.beats(id);

-- A project is the private hub for one future or released track.
create table if not exists public.artist_projects (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  beat_id uuid references public.beats(id) on delete set null,
  title text not null default 'Без названия',
  status public.artist_project_status not null default 'idea',
  description text not null default '',
  cover_storage_path text,
  release_at timestamptz,
  timezone text not null default 'Europe/Moscow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, artist_id)
);

create index if not exists artist_projects_artist_idx
  on public.artist_projects(artist_id, updated_at desc);
create index if not exists artist_projects_release_idx
  on public.artist_projects(artist_id, release_at)
  where release_at is not null;

create table if not exists public.artist_private_links (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  project_id uuid,
  label text not null,
  url text not null,
  category text not null default 'other',
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, artist_id)
    references public.artist_projects(id, artist_id)
    on delete cascade
);

create index if not exists artist_private_links_artist_idx
  on public.artist_private_links(artist_id, sort_order, created_at);

create table if not exists public.lyrics_documents (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  project_id uuid,
  title text not null default 'Без названия',
  body text not null default '',
  document_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, artist_id),
  foreign key (project_id, artist_id)
    references public.artist_projects(id, artist_id)
    on delete set null,
  constraint lyrics_document_status_check
    check (document_status in ('draft', 'ready', 'archived'))
);

create index if not exists lyrics_documents_artist_idx
  on public.lyrics_documents(artist_id, updated_at desc);
create index if not exists lyrics_documents_project_idx
  on public.lyrics_documents(project_id)
  where project_id is not null;

create table if not exists public.lyrics_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  artist_id uuid not null references public.artists(id) on delete cascade,
  version_number integer not null,
  body text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (document_id, artist_id)
    references public.lyrics_documents(id, artist_id)
    on delete cascade,
  unique (document_id, version_number)
);

create index if not exists lyrics_versions_document_idx
  on public.lyrics_versions(document_id, version_number desc);

create table if not exists public.release_events (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  event_type text not null default 'release',
  status public.release_event_status not null default 'planned',
  starts_at timestamptz not null,
  timezone text not null default 'Europe/Moscow',
  platform_data jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, artist_id)
    references public.artist_projects(id, artist_id)
    on delete cascade
);

create index if not exists release_events_artist_date_idx
  on public.release_events(artist_id, starts_at);
create index if not exists release_events_project_idx
  on public.release_events(project_id, starts_at);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  project_id uuid not null,
  file_kind text not null default 'other',
  bucket_id text not null default 'artist-private',
  storage_path text not null,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  foreign key (project_id, artist_id)
    references public.artist_projects(id, artist_id)
    on delete cascade,
  constraint project_file_kind_check
    check (file_kind in ('cover', 'demo', 'master', 'stem', 'document', 'other')),
  unique (bucket_id, storage_path)
);

create index if not exists project_files_project_idx
  on public.project_files(project_id, created_at desc);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  is_done boolean not null default false,
  due_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, artist_id)
    references public.artist_projects(id, artist_id)
    on delete cascade
);

create index if not exists project_tasks_project_idx
  on public.project_tasks(project_id, is_done, sort_order, due_at);

-- Tokens are created and consumed only by a protected Edge Function.
-- Store a SHA-256 token hash, never the raw token from the invitation URL.
create table if not exists public.artist_invites (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  intended_email text,
  claimed_email text,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint artist_invite_token_hash_check
    check (length(token_hash) = 64),
  constraint artist_invite_state_check
    check (consumed_at is null or revoked_at is null)
);

create index if not exists artist_invites_artist_idx
  on public.artist_invites(artist_id, created_at desc);
create index if not exists artist_invites_active_idx
  on public.artist_invites(expires_at)
  where consumed_at is null and revoked_at is null;

create or replace function private.owns_artist(target_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.artists as artist
    where artist.id = target_artist_id
      and artist.owner_user_id = (select auth.uid())
  );
$$;

create or replace function private.owns_beat(target_beat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.beats as beat
    where beat.id = target_beat_id
      and beat.owner_user_id = (select auth.uid())
  );
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.owns_artist(uuid) from public;
revoke all on function private.owns_beat(uuid) from public;
grant execute on function private.owns_artist(uuid) to authenticated;
grant execute on function private.owns_beat(uuid) to authenticated;

-- Replace the broad public beat policy with publication-aware access.
drop policy if exists "public can read beats" on public.beats;
drop policy if exists "artist can create own beats" on public.beats;
drop policy if exists "artist can update own beats" on public.beats;
drop policy if exists "artist can delete own beats" on public.beats;
drop policy if exists "anon can read published beats" on public.beats;
drop policy if exists "authenticated can read published or own beats" on public.beats;

create policy "anon can read published beats"
on public.beats for select
to anon
using (publication_status = 'published');

create policy "authenticated can read published or own beats"
on public.beats for select
to authenticated
using (
  publication_status = 'published'
  or owner_user_id = (select auth.uid())
);

create policy "artist can create own beats"
on public.beats for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

create policy "artist can update own beats"
on public.beats for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy "artist can delete own beats"
on public.beats for delete
to authenticated
using (owner_user_id = (select auth.uid()));

-- Public callers receive only marketplace-safe beat columns.
revoke select on public.beats from anon;
grant select (
  id,
  owner_user_id,
  title,
  seller,
  seller_link,
  price,
  audio_url,
  public_preview_path,
  cover_url,
  currency,
  publication_status,
  published_at,
  created_at,
  updated_at
) on public.beats to anon;

grant select, insert, update, delete on public.beats to authenticated;

alter table public.artist_projects enable row level security;
alter table public.artist_private_links enable row level security;
alter table public.lyrics_documents enable row level security;
alter table public.lyrics_versions enable row level security;
alter table public.release_events enable row level security;
alter table public.project_files enable row level security;
alter table public.project_tasks enable row level security;
alter table public.artist_invites enable row level security;

revoke all on public.artist_projects from anon;
revoke all on public.artist_private_links from anon;
revoke all on public.lyrics_documents from anon;
revoke all on public.lyrics_versions from anon;
revoke all on public.release_events from anon;
revoke all on public.project_files from anon;
revoke all on public.project_tasks from anon;
revoke all on public.artist_invites from anon, authenticated;

grant select, insert, update, delete on public.artist_projects to authenticated;
grant select, insert, update, delete on public.artist_private_links to authenticated;
grant select, insert, update, delete on public.lyrics_documents to authenticated;
grant select, insert, update, delete on public.lyrics_versions to authenticated;
grant select, insert, update, delete on public.release_events to authenticated;
grant select, insert, update, delete on public.project_files to authenticated;
grant select, insert, update, delete on public.project_tasks to authenticated;
grant all on public.artist_invites to service_role;

drop policy if exists "artist owns projects" on public.artist_projects;
create policy "artist owns projects"
on public.artist_projects for all
to authenticated
using (private.owns_artist(artist_id))
with check (
  private.owns_artist(artist_id)
  and (beat_id is null or private.owns_beat(beat_id))
);

drop policy if exists "artist owns private links" on public.artist_private_links;
create policy "artist owns private links"
on public.artist_private_links for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop policy if exists "artist owns lyrics" on public.lyrics_documents;
create policy "artist owns lyrics"
on public.lyrics_documents for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop policy if exists "artist owns lyrics versions" on public.lyrics_versions;
create policy "artist owns lyrics versions"
on public.lyrics_versions for all
to authenticated
using (private.owns_artist(artist_id))
with check (
  private.owns_artist(artist_id)
  and created_by = (select auth.uid())
);

drop policy if exists "artist owns release events" on public.release_events;
create policy "artist owns release events"
on public.release_events for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop policy if exists "artist owns project files" on public.project_files;
create policy "artist owns project files"
on public.project_files for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop policy if exists "artist owns project tasks" on public.project_tasks;
create policy "artist owns project tasks"
on public.project_tasks for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop trigger if exists artist_projects_touch_updated_at on public.artist_projects;
create trigger artist_projects_touch_updated_at
before update on public.artist_projects
for each row execute function private.touch_updated_at();

drop trigger if exists artist_private_links_touch_updated_at on public.artist_private_links;
create trigger artist_private_links_touch_updated_at
before update on public.artist_private_links
for each row execute function private.touch_updated_at();

drop trigger if exists lyrics_documents_touch_updated_at on public.lyrics_documents;
create trigger lyrics_documents_touch_updated_at
before update on public.lyrics_documents
for each row execute function private.touch_updated_at();

drop trigger if exists release_events_touch_updated_at on public.release_events;
create trigger release_events_touch_updated_at
before update on public.release_events
for each row execute function private.touch_updated_at();

drop trigger if exists project_tasks_touch_updated_at on public.project_tasks;
create trigger project_tasks_touch_updated_at
before update on public.project_tasks
for each row execute function private.touch_updated_at();

drop trigger if exists beats_touch_updated_at on public.beats;
create trigger beats_touch_updated_at
before update on public.beats
for each row execute function private.touch_updated_at();

-- Private masters, stems, lyrics exports and project files.
insert into storage.buckets (id, name, public)
values ('artist-private', 'artist-private', false)
on conflict (id) do update set public = false;

drop policy if exists "artist can read private files" on storage.objects;
drop policy if exists "artist can upload private files" on storage.objects;
drop policy if exists "artist can update private files" on storage.objects;
drop policy if exists "artist can delete private files" on storage.objects;

create policy "artist can read private files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'artist-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "artist can upload private files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'artist-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "artist can update private files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'artist-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'artist-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "artist can delete private files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'artist-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
