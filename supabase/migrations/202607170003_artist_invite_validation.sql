-- Public invite validation returns only the destination artist and email to
-- the holder of a 256-bit one-time token. Invite creation and claim remain
-- behind authenticated Edge Function calls.

begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.validate_artist_invite(p_token text)
returns table (
  artist_id uuid,
  artist_name text,
  intended_email text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invite.artist_id,
    artist.name,
    invite.intended_email,
    invite.expires_at
  from public.artist_invites as invite
  join public.artists as artist on artist.id = invite.artist_id
  where length(p_token) = 64
    and invite.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and invite.consumed_at is null
    and invite.revoked_at is null
    and invite.expires_at > now()
  limit 1;
$$;

revoke all on function public.validate_artist_invite(text) from public;
grant execute on function public.validate_artist_invite(text) to anon, authenticated;

commit;
