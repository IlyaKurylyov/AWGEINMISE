// Импорт локальных mp3 из assets/beats → Supabase Storage bucket 'beats/<uid>/'
// и создание записей в таблице public.beats, привязанных к владельцам.
// Требуется .env.local (в корне проекта):
//   SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE=...

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fg = require('fast-glob');
const mime = require('mime');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// Нормализация отображаемого имени артиста по продавцу из имени файла, если нужно
const SELLER_ALIAS = {
  '@DopeTheProduce': 'Dope the producer',
  '@DopeTheProducer': 'Dope the producer',
  '@SHIBVRI': 'SHIBVRI',
  '@Namusorill': 'Namusorill',
  '@Kodik': 'Kodik',
  '@Hahahap': 'Hahahap',
  '@Febb Tufoe': 'Febb Tufoe',
};

function parseFromBasename(basename) {
  // Ожидаем формат: "@Handle - Title.ext" (дефис может быть разным)
  const m = basename.match(/^([^–—-]+)[–—-]\s*(.+)\.(mp3|wav)$/i);
  if (!m) {
    return { sellerKey: null, title: basename.replace(/\.[^.]+$/, '') };
  }
  return { sellerKey: m[1].trim(), title: m[2].trim() };
}

function sanitizeForStorage(basename) {
  // Разрешим только безопасные ASCII-символы для ключей в storage
  // 1) заменим музыкальный знак '♯' на 'sharp'
  let safe = basename.replace(/♯/g, 'sharp');
  // 2) уберём квадратные скобки и прочие спорные знаки
  safe = safe.replace(/[\[\]#]/g, '');
  // 3) нормализуем и выпилим не-ASCII
  safe = safe.normalize('NFKD').replace(/[^\x20-\x7E]/g, '');
  // 4) подчистим запрещённые в ключах символы
  safe = safe.replace(/[^A-Za-z0-9@._()\- ]+/g, '_');
  // 5) нормализуем пробелы (но не схлопываем, чтобы сохранить идемпотентность путей)
  safe = safe.replace(/\s/g, ' ').replace(/_+/g, '_').trim();
  return safe;
}

async function main() {
  // ensure bucket 'beats' exists (public)
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = Array.isArray(buckets) && buckets.some(b => b.name === 'beats');
    if (!exists) {
      await supabase.storage.createBucket('beats', { public: true });
      console.log('Created bucket: beats');
    }
  } catch (e) {
    console.warn('Bucket check/create failed (will try upload anyway):', e.message || e);
  }
  const files = await fg(['assets/beats/**/*.{mp3,wav}'], { dot: false });
  if (!files.length) {
    console.log('No local audio files found in assets/beats');
    return;
  }

  // artists map: name(lower) -> {name, uid}
  const { data: artists, error: aErr } = await supabase
    .from('artists')
    .select('name, owner_user_id')
    .not('owner_user_id', 'is', null);
  if (aErr) throw aErr;
  const byName = new Map();
  const byNorm = new Map();
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const a of artists) {
    const lc = String(a.name).toLowerCase();
    byName.set(lc, { name: a.name, uid: a.owner_user_id });
    byNorm.set(norm(a.name), { name: a.name, uid: a.owner_user_id });
  }

  console.log(`Found ${files.length} files; loaded ${artists.length} artists with owner_user_id.`);

  let created = 0;
  let skipped = 0;
  let uploadErrors = 0;

  for (const file of files) {
    const basename = path.basename(file);
    const { sellerKey, title } = parseFromBasename(basename);
    if (!sellerKey) {
      console.warn('Skip (cannot parse seller):', basename);
      skipped++;
      continue;
    }
    const artistName = SELLER_ALIAS[sellerKey] || sellerKey.replace(/^@/, '');
    let artist = byName.get(String(artistName).toLowerCase());
    if (!artist) {
      artist = byNorm.get(norm(artistName));
    }
    if (!artist) {
      console.warn(`Skip (no artist match): seller="${sellerKey}" → name="${artistName}" for ${basename}`);
      skipped++;
      continue;
    }

    const uid = artist.uid;
    const safeBase = sanitizeForStorage(basename);
    const storagePath = `${uid}/${safeBase}`;

    // idempotent: если запись с таким audio_url уже есть — пропускаем
    // Получаем корректный public URL через SDK (правильное кодирование)
    const { data: pubUrlData } = supabase.storage.from('beats').getPublicUrl(storagePath);
    const audioUrl = pubUrlData.publicUrl;

    // Пытаемся найти существующую строку (сначала по URL, затем по владельцу+title)
    let existingRow = null;
    let { data: exists, error: selErr } = await supabase
      .from('beats')
      .select('id,audio_url')
      .eq('audio_url', audioUrl)
      .maybeSingle();
    if (selErr) {
      console.warn('Select failed, skip row:', selErr.message);
      skipped++;
      continue;
    }
    if (!exists || !exists.id) {
      const byTitle = await supabase
        .from('beats')
        .select('id,audio_url')
        .eq('owner_user_id', uid)
        .ilike('title', title);
      if (!byTitle.error && byTitle.data && byTitle.data.length > 0) {
        existingRow = byTitle.data[0];
      }
    } else {
      existingRow = exists;
    }

    // Upload to Storage (upsert)
    try {
      const buffer = fs.readFileSync(file);
      const contentType = mime.getType(basename) || 'audio/mpeg';
      const { error: upErr } = await supabase.storage
        .from('beats')
        .upload(storagePath, buffer, { contentType, upsert: true });
      if (upErr && !/already exists/i.test(upErr.message)) {
        console.error('Upload error:', basename, upErr.message);
        uploadErrors++;
        continue;
      }
    } catch (e) {
      console.error('FS/Upload error:', basename, e.message || e);
      uploadErrors++;
      continue;
    }

    if (!existingRow || !existingRow.id) {
      const { error: insErr } = await supabase.from('beats').insert({
        owner_user_id: uid,
        title,
        audio_url: audioUrl,
        seller: artist.name,
      });
      if (insErr) {
        console.error('Insert error:', basename, insErr.message);
        uploadErrors++;
        continue;
      }
      created++;
      console.log('OK:', artist.name, '<-', basename);
    } else {
      // Если запись есть, но URL отличается от корректного — обновим
      if (existingRow.audio_url !== audioUrl) {
        const { error: updErr } = await supabase
          .from('beats')
          .update({ audio_url: audioUrl })
          .eq('id', existingRow.id);
        if (updErr) {
          console.error('Update error:', basename, updErr.message);
          uploadErrors++;
          continue;
        }
        console.log('OK (fixed URL):', artist.name, '<-', basename);
      } else {
        console.log('OK (up-to-date):', artist.name, '<-', basename);
      }
    }
  }

  console.log(`Done. created=${created}, skipped=${skipped}, errors=${uploadErrors}`);
}

main().catch((e) => {
  console.error('Fatal:', e.message || e);
  process.exit(1);
});


