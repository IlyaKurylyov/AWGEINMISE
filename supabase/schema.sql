-- INMISE: initial schema for a new Supabase project.
-- Run this once in Supabase Dashboard -> SQL Editor before importing files.
-- It deliberately contains no secrets and does not create Auth users.

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default '',
  description text not null default '',
  image_url text,
  matrix_text text,
  tg_url text,
  vk_url text,
  inst_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beats (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  seller text,
  seller_link text,
  price numeric(12, 2),
  audio_url text,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists beats_owner_user_id_idx on public.beats(owner_user_id);
create index if not exists beats_created_at_idx on public.beats(created_at desc);

alter table public.artists enable row level security;
alter table public.beats enable row level security;

create policy "public can read artists" on public.artists for select using (true);
create policy "artist can create own profile" on public.artists for insert to authenticated with check (owner_user_id = auth.uid());
create policy "artist can update own profile" on public.artists for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "artist can delete own profile" on public.artists for delete to authenticated using (owner_user_id = auth.uid());

create policy "public can read beats" on public.beats for select using (true);
create policy "artist can create own beats" on public.beats for insert to authenticated with check (owner_user_id = auth.uid());
create policy "artist can update own beats" on public.beats for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "artist can delete own beats" on public.beats for delete to authenticated using (owner_user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('artists', 'artists', true), ('beats', 'beats', true)
on conflict (id) do update set public = excluded.public;

create policy "public can read artist files" on storage.objects for select using (bucket_id = 'artists');
create policy "artist can upload own image" on storage.objects for insert to authenticated
  with check (bucket_id = 'artists' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "artist can update own image" on storage.objects for update to authenticated
  using (bucket_id = 'artists' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'artists' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "artist can delete own image" on storage.objects for delete to authenticated
  using (bucket_id = 'artists' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public can read beat files" on storage.objects for select using (bucket_id = 'beats');
create policy "artist can upload own beats" on storage.objects for insert to authenticated
  with check (bucket_id = 'beats' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "artist can update own beats" on storage.objects for update to authenticated
  using (bucket_id = 'beats' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'beats' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "artist can delete own beats" on storage.objects for delete to authenticated
  using (bucket_id = 'beats' and (storage.foldername(name))[1] = auth.uid()::text);
