# Настройка Supabase Storage для фото артистов

## Шаг 1: Создать bucket

1. Зайди в Supabase Dashboard → **Storage**
2. Нажми **New Bucket**
3. Параметры:
   - Name: `artists`
   - Public bucket: ✅ **ДА** (чтобы фото были доступны без авторизации)
   - File size limit: `5 MB` (достаточно для фото)
4. Нажми **Create**

---

## Шаг 2: Настроить политики доступа

В разделе Storage → `artists` bucket → **Policies**:

### Политика 1: Публичное чтение (для показа фото на сайте)
```sql
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'artists');
```

### Политика 2: Загрузка только авторизованным (для админки)
```sql
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'artists' 
  AND auth.role() = 'authenticated'
);
```

### Политика 3: Обновление только своих файлов
```sql
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'artists'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### Политика 4: Удаление только своих файлов
```sql
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'artists'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## Шаг 3: Загрузить существующие фото

### Через Supabase Dashboard:
1. Storage → `artists` bucket
2. Создай папку для каждого артиста (можно использовать их ID из БД)
3. Загрузи фото вручную

### Или через SQL (обновить пути):
После загрузки файлов, обнови БД:

```sql
-- Замени на реальные URL из Storage
UPDATE artists 
SET image_url = 'https://xxx.supabase.co/storage/v1/object/public/artists/{user_id}/avatar-xxx.jpg'
WHERE name = 'Hahahap';

-- И так для каждого артиста
```

---

## Шаг 4: Проверка

1. Админка должна работать сразу (загрузка через форму)
2. Публичная страница покажет фото из Storage (если image_url начинается с `https://`)
3. Статические файлы из `/assets/` будут фолбэком если image_url пустой

---

## Структура путей в Storage:

```
artists/
├── {user_id_1}/
│   └── avatar-1234567890.jpg
├── {user_id_2}/
│   └── avatar-1234567891.jpg
└── ...
```

Каждый артист загружает фото в свою папку `{user_id}/`

