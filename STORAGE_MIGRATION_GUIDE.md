# 🚀 Миграция фото артистов в Supabase Storage

## Зачем?

✅ Админка сможет обновлять фото без пересборки  
✅ Не нужно заливать фото на хост вручную  
✅ CDN от Supabase (быстрая загрузка)  
✅ Автоматический resize/optimize (если настроишь)

---

## 📋 План миграции

### Этап 1: Создать bucket (5 мин)

1. Зайди в [Supabase Dashboard](https://supabase.com/dashboard)
2. Выбери свой проект
3. Перейди в **Storage** (боковое меню)
4. Нажми **New Bucket**
5. Заполни:
   - Name: `artists`
   - Public: ✅ **ДА**
   - File size limit: `5 MB`
6. Нажми **Create Bucket**

---

### Этап 2: Настроить политики доступа (5 мин)

В Storage → `artists` → **Policies**:

#### Политика 1: Публичное чтение
```sql
CREATE POLICY "Anyone can view artist images"
ON storage.objects FOR SELECT
USING (bucket_id = 'artists');
```

#### Политика 2: Авторизованные могут загружать
```sql
CREATE POLICY "Authenticated can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'artists' 
  AND auth.role() = 'authenticated'
);
```

#### Политика 3: Обновление только своих файлов
```sql
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'artists'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

### Этап 3: Загрузить существующие фото

**Вариант A: Автоматически (Node.js скрипт)**

1. Скопируй фото в `assets/images/artists/`:
   ```
   assets/images/artists/
   ├── artist1.jpg  (Hahahap)
   ├── artist2.jpg  (Kodik)
   ├── artist3.jpg  (SHIBVRI)
   ├── artist4.jpg  (Dope)
   ├── artist5.jpg  (Xan)
   ├── artist6.jpg  (Namusorill)
   └── artist7.jpg  (Febb Tufoe)
   ```

2. Установи зависимость:
   ```bash
   npm install @supabase/supabase-js
   ```

3. Отредактируй `upload-to-storage.js`:
   - Замени `SUPABASE_SERVICE_KEY` на service role key из Dashboard → Settings → API

4. Запусти:
   ```bash
   node upload-to-storage.js
   ```

**Вариант B: Вручную (через Dashboard)**

1. Storage → `artists` bucket
2. Для каждого артиста:
   - Создай папку с его `user_id` (из таблицы `artists`)
   - Загрузи фото в эту папку
   - Скопируй Public URL
   - Обнови БД:
     ```sql
     UPDATE artists 
     SET image_url = 'https://xxx.supabase.co/storage/v1/object/public/artists/{user_id}/avatar.jpg'
     WHERE id = '{user_id}';
     ```

---

### Этап 4: Очистить старые пути в БД (1 мин)

В SQL Editor:
```sql
-- Очистить неправильные пути
UPDATE artists 
SET image_url = NULL 
WHERE image_url LIKE 'assets/images/artists/%';

-- Проверить
SELECT name, image_url FROM artists ORDER BY name;
```

---

### Этап 5: Проверка

1. Зайди в админку (admin.html)
2. Загрузи новое фото через форму
3. Проверь что:
   - Фото появилось в Storage → artists bucket
   - В БД `image_url` обновился на `https://...`
   - На публичной странице (artists.html) фото отображается

---

## 🎯 После миграции

### Что изменится:

**Раньше:**
```
HTML: <img src="/assets/artist1-CTze5kmE.jpg">
```

**Теперь:**
```
БД: image_url = "https://xxx.supabase.co/storage/.../avatar-123.jpg"
JS: if (image_url.startsWith('https://')) img.src = image_url
```

### Workflow для обновления фото:

1. Артист заходит в админку
2. Загружает новое фото через форму
3. Нажимает "Сохранить"
4. Фото автоматически:
   - Загружается в Storage
   - URL сохраняется в БД
   - Отображается на сайте (без пересборки!)

---

## 🔥 Troubleshooting

### Фото не отображаются после миграции
- Проверь политики доступа (должна быть `SELECT` для всех)
- Проверь что bucket `public`
- Проверь что `image_url` в БД начинается с `https://`

### Ошибка 403 при загрузке
- Проверь что bucket создан
- Проверь политику `INSERT` для authenticated
- Проверь что пользователь авторизован

### Старые фото не загружаются
- Убедись что скопировал фото в `assets/images/artists/`
- Проверь маппинг в `upload-to-storage.js`
- Запусти скрипт с правильным service_role ключом

---

## 📝 Чек-лист миграции

- [ ] Создан bucket `artists` (public)
- [ ] Настроены 3 политики доступа
- [ ] Загружены существующие фото (вручную или скриптом)
- [ ] Обновлена БД (все `image_url` начинаются с `https://` или `NULL`)
- [ ] Проверена загрузка нового фото через админку
- [ ] Проверено отображение на публичной странице
- [ ] Задеплоен обновленный `dist/` с исправленным JS

Готово! 🎉

