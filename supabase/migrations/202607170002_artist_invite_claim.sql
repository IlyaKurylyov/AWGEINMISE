-- Invite-only account migration for existing INMISE artists.
-- Existing artist and beat rows keep their ids; only owner_user_id changes.

begin;

alter table public.artist_invites
  alter column target_user_id drop not null,
  alter column intended_email set not null,
  add column if not exists previous_owner_user_id uuid
    references auth.users(id) on delete set null;

create index if not exists artist_invites_email_idx
  on public.artist_invites(lower(intended_email), created_at desc);

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

  update public.beats
  set owner_user_id = p_new_owner_user_id,
      updated_at = now()
  where owner_user_id = current_owner;

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
