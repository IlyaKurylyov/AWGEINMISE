#!/usr/bin/env node
// One-time upload of local artist photos to Supabase Storage.
// Required in .env.local: SUPABASE_URL and SUPABASE_SERVICE_ROLE.

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !serviceRole) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in .env.local.');
  process.exit(1);
}

const supabase = createClient(url, serviceRole);
const photoToArtist = {
  'artist1.jpg': 'Hahahap',
  'artist2.jpg': 'Kodik',
  'artist3.jpg': 'SHIBVRI',
  'artist4.jpg': 'Dope the producer',
  'artist5.jpg': 'Xan',
  'artist6.jpg': 'Namusorill',
  'artist7.jpg': 'Febb Tufoe'
};

async function main() {
  const sourceDir = path.join(__dirname, 'assets/images/artists');
  const { data: artists, error: artistsError } = await supabase
    .from('artists')
    .select('id,name,owner_user_id');
  if (artistsError) throw artistsError;

  const byName = new Map(artists.map((artist) => [artist.name.toLowerCase(), artist]));
  for (const [fileName, artistName] of Object.entries(photoToArtist)) {
    const artist = byName.get(artistName.toLowerCase());
    const localPath = path.join(sourceDir, fileName);
    if (!artist || !artist.owner_user_id || !fs.existsSync(localPath)) {
      console.warn(`Skipped ${fileName}: artist or local file is missing.`);
      continue;
    }

    const storagePath = `${artist.owner_user_id}/avatar-${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('artists')
      .upload(storagePath, fs.readFileSync(localPath), { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabase.storage.from('artists').getPublicUrl(storagePath);
    const { error: updateError } = await supabase
      .from('artists')
      .update({ image_url: publicUrl.publicUrl, updated_at: new Date().toISOString() })
      .eq('id', artist.id);
    if (updateError) throw updateError;
    console.log(`Uploaded ${fileName} for ${artist.name}.`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
