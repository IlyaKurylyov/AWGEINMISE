#!/usr/bin/env node
/**
 * Скрипт для загрузки существующих фото артистов в Supabase Storage
 * 
 * Использование:
 * 1. npm install @supabase/supabase-js
 * 2. Заполни SUPABASE_URL и SUPABASE_SERVICE_KEY (service role key, не anon!)
 * 3. node upload-to-storage.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚠️ ЗАПОЛНИ ЭТИ ДАННЫЕ ИЗ SUPABASE DASHBOARD
const SUPABASE_URL = 'https://lzpesnkjffmsnigahuav.supabase.co'; // Твой URL
const SUPABASE_SERVICE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'; // Service Role Key (НЕ anon key!)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Маппинг: имя файла → имя артиста в БД
const artistMapping = {
  'artist1.jpg': 'Hahahap',
  'artist2.jpg': 'Kodik',
  'artist3.jpg': 'SHIBVRI',
  'artist4.jpg': 'Dope the producer',
  'artist5.jpg': 'Xan',
  'artist6.jpg': 'Namusorill',
  'artist7.jpg': 'Febb Tufoe',
};

async function uploadPhotos() {
  console.log('🚀 Начинаем загрузку фото в Supabase Storage...\n');

  const sourceDir = path.join(__dirname, 'assets/images/artists');
  
  if (!fs.existsSync(sourceDir)) {
    console.error('❌ Папка не найдена:', sourceDir);
    console.log('💡 Скопируй фото артистов в assets/images/artists/');
    return;
  }

  // Получаем список артистов из БД
  const { data: artists, error: fetchError } = await supabase
    .from('artists')
    .select('id, name');

  if (fetchError) {
    console.error('❌ Ошибка загрузки артистов из БД:', fetchError);
    return;
  }

  console.log(`📋 Найдено артистов в БД: ${artists.length}\n`);

  // Загружаем каждое фото
  for (const [filename, artistName] of Object.entries(artistMapping)) {
    const artist = artists.find(a => a.name === artistName);
    
    if (!artist) {
      console.log(`⚠️  Артист "${artistName}" не найден в БД, пропускаем ${filename}`);
      continue;
    }

    const filePath = path.join(sourceDir, filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Файл не найден: ${filename}`);
      continue;
    }

    try {
      // Читаем файл
      const fileBuffer = fs.readFileSync(filePath);
      const fileExt = path.extname(filename);
      
      // Генерируем путь в Storage
      const storagePath = `${artist.id}/avatar-${Date.now()}${fileExt}`;
      
      console.log(`📤 Загружаем ${filename} → ${storagePath}...`);

      // Загружаем в Storage
      const { error: uploadError } = await supabase.storage
        .from('artists')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error(`   ❌ Ошибка загрузки: ${uploadError.message}`);
        continue;
      }

      // Получаем публичный URL
      const { data: urlData } = supabase.storage
        .from('artists')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;
      
      console.log(`   ✅ Загружено: ${publicUrl}`);

      // Обновляем БД
      const { error: updateError } = await supabase
        .from('artists')
        .update({ image_url: publicUrl })
        .eq('id', artist.id);

      if (updateError) {
        console.error(`   ⚠️  Ошибка обновления БД: ${updateError.message}`);
      } else {
        console.log(`   ✅ БД обновлена для "${artistName}"`);
      }

      console.log('');

    } catch (err) {
      console.error(`❌ Ошибка обработки ${filename}:`, err.message);
    }
  }

  console.log('\n🎉 Готово! Проверь Supabase Storage → artists bucket');
}

// Проверка конфигурации
if (SUPABASE_SERVICE_KEY === 'YOUR_SERVICE_ROLE_KEY_HERE') {
  console.error('❌ Заполни SUPABASE_SERVICE_KEY в скрипте!');
  console.log('💡 Найти можно в Supabase Dashboard → Settings → API → service_role key');
  process.exit(1);
}

uploadPhotos().catch(err => {
  console.error('❌ Критическая ошибка:', err);
  process.exit(1);
});

