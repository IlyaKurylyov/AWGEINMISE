-- Бакеты `beats` и `artists` заведены ещё старым сайтом мимо миграций, поэтому в
-- 202609020001 их не трогали: политики надо было сперва прочитать. Прочитали —
-- они ключуются по папке с auth.uid(), как и остальные. Переводим их на тот же
-- private.owns_storage_folder, который принимает и папку артиста, и старый uid.
--
-- Заодно убираем переходные хвосты у битов: миграция artist_id прошла без осечек,
-- битов без карточки не осталось (0 из 16), так что владение теперь описывается
-- одним правилом вместо двух.

begin;

-- 1. Бакет `beats` -------------------------------------------------------------

drop policy if exists "artist can upload own beats" on storage.objects;
drop policy if exists "artist can update own beats" on storage.objects;
drop policy if exists "artist can delete own beats" on storage.objects;

create policy "artist can upload own beats"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'beats'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can update own beats"
on storage.objects for update
to authenticated
using (
  bucket_id = 'beats'
  and private.owns_storage_folder((storage.foldername(name))[1])
)
with check (
  bucket_id = 'beats'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can delete own beats"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'beats'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

-- 2. Бакет `artists` (аватарки) -------------------------------------------------

drop policy if exists "artist can upload own image" on storage.objects;
drop policy if exists "artist can update own image" on storage.objects;
drop policy if exists "artist can delete own image" on storage.objects;

create policy "artist can upload own image"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'artists'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can update own image"
on storage.objects for update
to authenticated
using (
  bucket_id = 'artists'
  and private.owns_storage_folder((storage.foldername(name))[1])
)
with check (
  bucket_id = 'artists'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can delete own image"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'artists'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

-- 3. Биты: владение описывается одним правилом ----------------------------------
-- Хвост «artist_id is null» был страховкой на случай, если бэкфилл кого-то не
-- найдёт. Не нашёл никого — снимаем страховку и запрещаем биты без карточки.

alter table public.beats
  alter column artist_id set not null;

drop policy if exists "authenticated can read published or own beats" on public.beats;
create policy "authenticated can read published or own beats"
on public.beats for select
to authenticated
using (
  publication_status = 'published'
  or private.owns_artist(artist_id)
);

drop policy if exists "artist can update own beats" on public.beats;
create policy "artist can update own beats"
on public.beats for update
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop policy if exists "artist can delete own beats" on public.beats;
create policy "artist can delete own beats"
on public.beats for delete
to authenticated
using (private.owns_artist(artist_id));

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
    join public.artists as artist on artist.id = beat.artist_id
    where beat.id = target_beat_id
      and artist.owner_user_id = (select auth.uid())
  );
$$;

commit;
