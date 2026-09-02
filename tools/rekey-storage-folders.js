/* eslint-disable no-console */
// Разовый перенос файлов из папки владельца в папку артиста.
//
// Пути в storage начинались с id пользователя, а политика пускала только владельца
// папки. Поэтому после передачи карточки инвайтом новый владелец не мог прочитать
// ни один старый файл: строки в БД переезжали, файлы оставались. Миграция
// 202609020001 научила политику понимать папку артиста, этот скрипт переносит то,
// что уже лежит, и переписывает пути в БД.
//
// По умолчанию сухой прогон. Применить: node tools/rekey-storage-folders.js --apply
//
// Публичные бакеты (`beats`, `artists`) скрипт не трогает намеренно: они читаются
// без авторизации, поэтому после передачи карточки файлы остаются доступны, а
// перенос переписал бы публичные ссылки в audio_url и image_url — риск ради
// косметики. Там достаточно того, что новые загрузки уже идут в папку артиста.

import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const apply = process.argv.includes('--apply');
const BUCKET = 'artist-private';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE are required in .env.local');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Пути с путями внутри: три колонки ссылаются на этот бакет.
const PATH_COLUMNS = [
  { table: 'project_files', column: 'storage_path' },
  { table: 'artist_projects', column: 'cover_storage_path' },
  { table: 'beats', column: 'private_master_path' },
];

async function listRecursive(prefix = '') {
  const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`);
  const files = [];
  for (const entry of data || []) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // У папок нет id — только у объектов.
    if (entry.id) files.push(full);
    else files.push(...await listRecursive(full));
  }
  return files;
}

async function main() {
  const { data: artists, error: artistError } = await db
    .from('artists')
    .select('id,name,owner_user_id');
  if (artistError) throw artistError;

  const byOwner = new Map(artists.map((artist) => [artist.owner_user_id, artist]));
  const artistIds = new Set(artists.map((artist) => artist.id));

  const objects = await listRecursive();
  console.log(`Объектов в ${BUCKET}: ${objects.length}`);

  const moves = [];
  const skipped = [];
  for (const name of objects) {
    const [folder, ...rest] = name.split('/');
    if (artistIds.has(folder)) { skipped.push([name, 'уже в папке артиста']); continue; }
    if (!UUID_RE.test(folder)) { skipped.push([name, 'папка не uuid — наследие старого сайта']); continue; }
    const artist = byOwner.get(folder);
    if (!artist) { skipped.push([name, 'владелец папки не владеет ни одной карточкой']); continue; }
    moves.push({ from: name, to: [artist.id, ...rest].join('/'), artist });
  }

  for (const [name, reason] of skipped) console.log(`  пропуск  ${name}\n           └ ${reason}`);
  for (const move of moves) console.log(`  перенос  ${move.from}\n           → ${move.to}  (${move.artist.name})`);

  if (!moves.length) { console.log('Переносить нечего.'); return; }
  if (!apply) {
    console.log(`\nСухой прогон. К переносу: ${moves.length}. Применить: --apply`);
    return;
  }

  let moved = 0;
  let rewritten = 0;
  for (const move of moves) {
    const { error } = await db.storage.from(BUCKET).move(move.from, move.to);
    if (error) { console.error(`ОШИБКА переноса ${move.from}: ${error.message}`); continue; }
    moved += 1;

    // Путь переписываем только после удачного переноса, чтобы при сбое строка
    // продолжала указывать на файл, который всё ещё лежит на старом месте.
    for (const { table, column } of PATH_COLUMNS) {
      const { data, error: updateError } = await db
        .from(table)
        .update({ [column]: move.to })
        .eq(column, move.from)
        .select('id');
      if (updateError) { console.error(`ОШИБКА ${table}.${column} для ${move.from}: ${updateError.message}`); continue; }
      rewritten += (data || []).length;
    }
  }

  console.log(`\nПеренесено файлов: ${moved} из ${moves.length}. Переписано ссылок в БД: ${rewritten}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
