-- Миграция для очистки старых путей и подготовки к Storage

-- 1. Очистить старые неправильные пути (если есть)
UPDATE artists 
SET image_url = NULL 
WHERE image_url LIKE 'assets/images/artists/%';

-- 2. Проверить текущее состояние
SELECT id, name, image_url 
FROM artists 
ORDER BY name;

-- 3. После загрузки фото в Storage, обнови пути (ПРИМЕР):
-- Замени URL на реальные из твоего Supabase Storage

/*
UPDATE artists 
SET image_url = 'https://lzpesnkjffmsnigahuav.supabase.co/storage/v1/object/public/artists/{user_id}/avatar-xxx.jpg'
WHERE name = 'Hahahap';

UPDATE artists 
SET image_url = 'https://lzpesnkjffmsnigahuav.supabase.co/storage/v1/object/public/artists/{user_id}/avatar-xxx.jpg'
WHERE name = 'Kodik';

-- И так далее для каждого артиста
*/

-- 4. Финальная проверка - все URL должны начинаться с https://
SELECT 
  name, 
  CASE 
    WHEN image_url IS NULL THEN '❌ NULL (будет фолбэк)'
    WHEN image_url LIKE 'https://%' THEN '✅ Storage URL'
    ELSE '⚠️ Неправильный путь'
  END as status,
  image_url
FROM artists 
ORDER BY name;

