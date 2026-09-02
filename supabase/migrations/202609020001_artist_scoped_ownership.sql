-- Владение было расколото на два ключа. Всё, что привязано к artist_id, ездит
-- вместе с карточкой артиста; биты, папки в storage и поля авторства ключевались
-- по id пользователя. Поэтому передача карточки требовала «смести всё, чем владел
-- прежний хозяин» — неоднозначно, как только один аккаунт держит две карточки, и
-- storage это не покрывало вовсе: файлы оставались в папке старого uid, недоступные
-- новому владельцу. Здесь остаток переезжает на artist_id, и передача карточки
-- становится адресной.

begin;

-- 1. Биты принадлежат артисту, а не пользователю ------------------------------

alter table public.beats
  add column if not exists artist_id uuid references public.artists(id) on delete cascade;

update public.beats as beat
set artist_id = artist.id
from public.artists as artist
where artist.owner_user_id = beat.owner_user_id
  and beat.artist_id is null;

create index if not exists beats_artist_idx
  on public.beats(artist_id, created_at desc);

-- owner_user_id остаётся: его читает публичная витрина, и он же держит связь для
-- битов, которым карточка не нашлась. Но источником правды становится artist_id.
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
    left join public.artists as artist on artist.id = beat.artist_id
    where beat.id = target_beat_id
      and (
        artist.owner_user_id = (select auth.uid())
        or (beat.artist_id is null and beat.owner_user_id = (select auth.uid()))
      )
  );
$$;

-- Хвост «artist_id is null» — биты, которым не нашлось карточки. Они остаются
-- видны прежнему владельцу, чтобы ничего не пропало из кабинета.
drop policy if exists "authenticated can read published or own beats" on public.beats;
create policy "authenticated can read published or own beats"
on public.beats for select
to authenticated
using (
  publication_status = 'published'
  or private.owns_artist(artist_id)
  or (artist_id is null and owner_user_id = (select auth.uid()))
);

drop policy if exists "artist can create own beats" on public.beats;
create policy "artist can create own beats"
on public.beats for insert
to authenticated
with check (
  private.owns_artist(artist_id)
  and owner_user_id = (select auth.uid())
);

drop policy if exists "artist can update own beats" on public.beats;
create policy "artist can update own beats"
on public.beats for update
to authenticated
using (
  private.owns_artist(artist_id)
  or (artist_id is null and owner_user_id = (select auth.uid()))
)
with check (
  private.owns_artist(artist_id)
  or (artist_id is null and owner_user_id = (select auth.uid()))
);

drop policy if exists "artist can delete own beats" on public.beats;
create policy "artist can delete own beats"
on public.beats for delete
to authenticated
using (
  private.owns_artist(artist_id)
  or (artist_id is null and owner_user_id = (select auth.uid()))
);

-- 2. Поля авторства перестают быть собственностью -----------------------------
-- created_by отвечает на вопрос «кто это сделал». Переписывать его при передаче
-- карточки — подделывать историю: выписанные владельцем инвайты задним числом
-- становятся выписанными артистом. Поэтому поле больше не трогаем, а FK меняем
-- так, чтобы удаление служебного аккаунта не утащило за собой версии текстов
-- (было on delete cascade) и не заблокировалось насмерть (было on delete restrict).

alter table public.lyrics_versions
  drop constraint if exists lyrics_versions_created_by_fkey;
alter table public.lyrics_versions
  alter column created_by drop not null;
alter table public.lyrics_versions
  add constraint lyrics_versions_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.artist_invites
  drop constraint if exists artist_invites_created_by_fkey;
alter table public.artist_invites
  alter column created_by drop not null;
alter table public.artist_invites
  add constraint artist_invites_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- 3. Папки в storage адресуются артистом --------------------------------------
-- Новый префикс пути — artist_id, тогда файлы переезжают вместе с карточкой сами.
-- Ветка с auth.uid() оставлена переходной: пока старые объекты физически лежат в
-- папках со старым uid, их владелец должен продолжать их видеть.

create or replace function private.owns_storage_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select folder is not null
    and (
      folder = (select auth.uid())::text
      or (
        folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.artists as artist
          where artist.id = folder::uuid
            and artist.owner_user_id = (select auth.uid())
        )
      )
    );
$$;

revoke all on function private.owns_storage_folder(text) from public;
revoke all on function private.owns_storage_folder(text) from anon;
grant execute on function private.owns_storage_folder(text) to authenticated;

drop policy if exists "artist can read private files" on storage.objects;
drop policy if exists "artist can upload private files" on storage.objects;
drop policy if exists "artist can update private files" on storage.objects;
drop policy if exists "artist can delete private files" on storage.objects;

create policy "artist can read private files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'artist-private'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can upload private files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'artist-private'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can update private files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'artist-private'
  and private.owns_storage_folder((storage.foldername(name))[1])
)
with check (
  bucket_id = 'artist-private'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can delete private files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'artist-private'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

drop policy if exists "artist can upload own social media" on storage.objects;
drop policy if exists "artist can update own social media" on storage.objects;
drop policy if exists "artist can delete own social media" on storage.objects;

create policy "artist can upload own social media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'social-uploads'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can update own social media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'social-uploads'
  and private.owns_storage_folder((storage.foldername(name))[1])
)
with check (
  bucket_id = 'social-uploads'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

create policy "artist can delete own social media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'social-uploads'
  and private.owns_storage_folder((storage.foldername(name))[1])
);

-- 4. Передача карточки становится адресной ------------------------------------

create or replace function public.claim_artist_invite(
  p_token_hash text,
  p_new_owner_user_id uuid,
  p_claimed_email text
)
returns table (
  artist_id uuid,
  artist_name text,
  previous_owner_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.artist_invites%rowtype;
  current_owner uuid;
  current_artist_name text;
  auth_email text;
begin
  if p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception 'invalid invite token';
  end if;

  select invite.*
    into invite_row
  from public.artist_invites as invite
  where invite.token_hash = p_token_hash
  for update;

  if not found
    or invite_row.consumed_at is not null
    or invite_row.revoked_at is not null
    or invite_row.expires_at <= now()
  then
    raise exception 'invite is invalid or expired';
  end if;

  select lower(trim(auth_user.email))
    into auth_email
  from auth.users as auth_user
  where auth_user.id = p_new_owner_user_id;

  if auth_email is null
    or auth_email <> lower(trim(invite_row.intended_email))
    or auth_email <> lower(trim(p_claimed_email))
  then
    raise exception 'authenticated email does not match invite';
  end if;

  -- Данные теперь адресуются по artist_id, так что второй карточкой владеть уже
  -- безопасно. Ограничение остаётся, потому что кабинет читает карточку через
  -- limit(1) и показал бы владельцу двух карточек только одну из них.
  if exists (
    select 1
    from public.artists as owned_artist
    where owned_artist.owner_user_id = p_new_owner_user_id
      and owned_artist.id <> invite_row.artist_id
  ) then
    raise exception 'new account already owns another artist';
  end if;

  select artist.owner_user_id, artist.name
    into current_owner, current_artist_name
  from public.artists as artist
  where artist.id = invite_row.artist_id
  for update;

  if not found then
    raise exception 'artist no longer exists';
  end if;

  update public.artists
  set owner_user_id = p_new_owner_user_id,
      updated_at = now()
  where id = invite_row.artist_id;

  -- Раньше здесь стояло «все биты прежнего владельца». Теперь адрес точный:
  -- едут только биты этой карточки, чужие остаются на месте.
  update public.beats
  set owner_user_id = p_new_owner_user_id,
      updated_at = now()
  where beats.artist_id = invite_row.artist_id;

  -- lyrics_versions.created_by и artist_invites.created_by намеренно не трогаем:
  -- это история авторства, а не владение.

  update public.artist_invites
  set target_user_id = p_new_owner_user_id,
      previous_owner_user_id = current_owner,
      claimed_email = auth_email,
      consumed_at = now()
  where id = invite_row.id;

  return query
  select invite_row.artist_id, current_artist_name, current_owner;
end;
$$;

revoke all on function public.claim_artist_invite(text, uuid, text) from public;
revoke all on function public.claim_artist_invite(text, uuid, text) from anon;
revoke all on function public.claim_artist_invite(text, uuid, text) from authenticated;
grant execute on function public.claim_artist_invite(text, uuid, text) to service_role;

commit;
