/* eslint-disable no-console */
import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const args = process.argv.slice(2);
const readArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};

const sourceEmail = readArg('--source').toLowerCase();
const targetEmail = readArg('--target').toLowerCase();
const expectedArtist = readArg('--artist');
const apply = args.includes('--apply');
const verify = args.includes('--verify');

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE are required in .env.local');
  process.exit(1);
}
if (!sourceEmail || !targetEmail || !expectedArtist) {
  console.error('Usage: node tools/handoff-artist-account.js --source old@example.com --target real@example.com --artist "Artist" [--apply]');
  process.exit(1);
}
if (sourceEmail === targetEmail) {
  console.error('ERROR: source and target emails must be different');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  let page = 1;
  while (page <= 100) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((user) => String(user.email || '').toLowerCase() === email);
    if (match) return match;
    if (users.length < 100) break;
    page += 1;
  }
  return null;
}

const [sourceUser, targetUser] = await Promise.all([
  findUserByEmail(sourceEmail),
  findUserByEmail(targetEmail),
]);

if (verify) {
  if (!targetUser) throw new Error(`Target Auth user not found: ${targetEmail}`);
  const { data: ownedArtists, error: ownedArtistsError } = await admin
    .from('artists')
    .select('id,name,owner_user_id')
    .eq('owner_user_id', targetUser.id);
  if (ownedArtistsError) throw ownedArtistsError;
  const { count: ownedBeatsCount, error: ownedBeatsError } = await admin
    .from('beats')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', targetUser.id);
  if (ownedBeatsError) throw ownedBeatsError;
  const { data: sellerBeats, error: sellerBeatsError } = await admin
    .from('beats')
    .select('id,title,seller,owner_user_id')
    .ilike('seller', `%${expectedArtist}%`);
  if (sellerBeatsError) throw sellerBeatsError;
  const matchingArtist = (ownedArtists || []).find((item) =>
    String(item.name || '').trim().toLowerCase() === expectedArtist.trim().toLowerCase());
  const result = {
    source_user_removed: !sourceUser,
    target_email: targetEmail,
    target_role: targetUser.app_metadata?.role || null,
    artist: matchingArtist || null,
    owned_beats: ownedBeatsCount || 0,
    matching_seller_beats: sellerBeats || [],
  };
  console.log(JSON.stringify(result, null, 2));
  if (sourceUser || targetUser.app_metadata?.role !== 'owner' || !matchingArtist) process.exit(1);
  process.exit(0);
}

if (!sourceUser) throw new Error(`Source Auth user not found: ${sourceEmail}`);
if (!targetUser) throw new Error(`Target Auth user not found: ${targetEmail}`);

const { data: sourceArtists, error: sourceArtistError } = await admin
  .from('artists')
  .select('id,name,owner_user_id')
  .eq('owner_user_id', sourceUser.id);
if (sourceArtistError) throw sourceArtistError;
if (!Array.isArray(sourceArtists) || sourceArtists.length !== 1) {
  throw new Error(`Expected exactly one source artist, found ${sourceArtists?.length || 0}`);
}

const artist = sourceArtists[0];
if (String(artist.name || '').trim().toLowerCase() !== expectedArtist.trim().toLowerCase()) {
  throw new Error(`Artist mismatch: expected "${expectedArtist}", found "${artist.name}"`);
}

const { data: targetArtists, error: targetArtistError } = await admin
  .from('artists')
  .select('id,name')
  .eq('owner_user_id', targetUser.id);
if (targetArtistError) throw targetArtistError;
if ((targetArtists || []).length > 0) {
  throw new Error(`Target account already owns artist: ${targetArtists.map((item) => item.name).join(', ')}`);
}

const preview = {
  mode: apply ? 'apply' : 'dry-run',
  source: { email: sourceEmail, id: sourceUser.id, role: sourceUser.app_metadata?.role || null },
  target: { email: targetEmail, id: targetUser.id, role: targetUser.app_metadata?.role || null },
  artist: { id: artist.id, name: artist.name },
};
console.log(JSON.stringify(preview, null, 2));

if (!apply) {
  console.log('Dry run complete. Re-run with --apply to perform the handoff.');
  process.exit(0);
}

const { error: revokeError } = await admin
  .from('artist_invites')
  .update({ revoked_at: new Date().toISOString() })
  .eq('artist_id', artist.id)
  .is('consumed_at', null)
  .is('revoked_at', null);
if (revokeError) throw revokeError;

const rawToken = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
const { error: inviteError } = await admin.from('artist_invites').insert({
  artist_id: artist.id,
  target_user_id: null,
  previous_owner_user_id: sourceUser.id,
  token_hash: tokenHash,
  intended_email: targetEmail,
  expires_at: expiresAt,
  created_by: sourceUser.id,
});
if (inviteError) throw inviteError;

const { data: claimData, error: claimError } = await admin.rpc('claim_artist_invite', {
  p_token_hash: tokenHash,
  p_new_owner_user_id: targetUser.id,
  p_claimed_email: targetEmail,
});
if (claimError) throw claimError;

const { error: roleError } = await admin.auth.admin.updateUserById(targetUser.id, {
  app_metadata: { ...(targetUser.app_metadata || {}), role: 'owner' },
});
if (roleError) throw roleError;

const { error: deleteError } = await admin.auth.admin.deleteUser(sourceUser.id);
if (deleteError) throw deleteError;

console.log(JSON.stringify({
  status: 'complete',
  artist: Array.isArray(claimData) ? claimData[0] : claimData,
  new_owner_email: targetEmail,
  inherited_role: 'owner',
  removed_legacy_email: sourceEmail,
}, null, 2));
