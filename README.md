# INMISE — Музыкальный лейбл

Сайт музыкального лейбла INMISE с VHS-эстетикой и ретро-дизайном.

## 🎨 Концепция

Винтажный VHS-стиль с элементами 80-90х годов: кассетный плеер, матричные эффекты, grayscale фото артистов, монохромный янтарно-зеленый UI.

## 🛠 Технологический стек

### Frontend
- **Vanilla JavaScript** — без фреймворков для максимальной производительности
- **React 18** — только для VHS-слота на главной странице
- **CSS3** — кастомные анимации, VHS-эффекты, адаптивная верстка
- **Vite 6** — сборщик проекта (build tool)

### Backend & Services
- **Supabase** — PostgreSQL база данных + Storage для изображений
  - Таблица `artists` — информация об артистах
  - Bucket `artists` — хранение фото артистов
- **Apache** — веб-сервер (хостинг reg.ru)

### Медиа
- **HTML5 Audio API** — кастомный VHS-плеер для треков
- **Canvas API** — матричный дождь при раскрытии карточек артистов
- **Video Background** — фоновое видео на главной странице

## 📁 Структура проекта

```
AWGEINMISE/
├── index.html              # Главная страница (VHS слот)
├── music.html              # Страница релизов (VHS плеер)
├── artists.html            # Страница артистов (карточки)
├── work.html               # Сотрудничество (beats/audio)
├── contacts.html           # Контакты
├── admin.html              # Админ-панель (управление артистами)
│
├── scripts/
│   ├── config.js           # Supabase конфигурация
│   ├── app.js              # Главная страница (VHS слот)
│   ├── music.js            # VHS плеер логика
│   ├── artists-public.js   # Публичный просмотр артистов
│   ├── artists-admin.js    # Админка (CRUD артистов)
│   ├── beats.js            # Управление битами/треками
│   └── video.js            # Фоновое видео
│
├── styles/
│   ├── main.css            # Базовые стили + VHS-эффекты
│   ├── music.css           # Стили VHS-плеера
│   ├── artists.css         # Стили карточек артистов
│   ├── work.css            # Стили страницы work
│   ├── contacts.css        # Стили контактов
│   └── responsive.css      # Адаптивная верстка
│
├── src/
│   ├── vhs-main.jsx        # React компонент VHS-слота
│   └── VhsSlot.jsx         # VHS слот с анимацией вставки кассеты
│
├── assets/
│   ├── audio/              # MP3 треки артистов
│   ├── beats/              # MP3 биты для прослушивания
│   ├── images/             # Статические изображения
│   ├── icons/              # SVG иконки (VK, TG, YouTube)
│   └── videos/             # background.mp4
│
├── dist/                   # Собранный проект (для деплоя)
├── .htaccess               # Apache конфигурация
├── vite.config.js          # Vite сборка
└── package.json            # Зависимости
```

## 🚀 Установка и запуск

### Локальная разработка

```bash
# Установка зависимостей
npm install

# Локальный dev-сервер (http://localhost:3003)
npm run dev

# Предпросмотр собранного проекта
npm run preview
```

### Сборка для продакшена

```bash
# Сборка проекта в dist/
npm run build
```

После сборки в `dist/` будут:
- Минифицированные HTML/CSS/JS файлы
- Оптимизированные изображения
- Хешированные CSS файлы для cache busting
- Скопированные статические assets

## 🌐 Деплой на хостинг

1. **Собрать проект:**
   ```bash
   npm run build
   ```

2. **Залить весь `dist/` в корень `www`** через ispmanager (reg.ru):
   - Все файлы (HTML, CSS, JS)
   - Папки `assets/`, `audio/`, `beats/`, `icons/`, `images/`, `videos/`, `scripts/`
   - Обязательно `.htaccess` для URL rewriting

3. **Проверить работу:**
   - `inmise.ru` → главная
   - `inmise.ru/music` → релизы
   - `inmise.ru/artists` → артисты
   - `inmise.ru/admin` → админ-панель

## ⚙️ Конфигурация

### Supabase

1. Скопируй `scripts/config.local.example.js` в `scripts/config.local.js`.
2. Заполни URL нового проекта и его publishable (или legacy anon) key:
```javascript
window.SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY'
};
```

`scripts/config.local.js` исключён из Git. Никогда не добавляй в него service-role key.

**База данных:**
- Таблица `artists`:
  - `id` (uuid, primary key)
  - `name` (text)
  - `description` (text)
  - `image_url` (text) — URL фото из Supabase Storage
  - `vk_url`, `tg_url`, `inst_url` (text) — соцсети
  - `matrix_text` (text) — кастомный текст для матричного эффекта
  - `created_at` (timestamp)

**Storage:**
- Bucket `artists` (public, для фото артистов)

### Apache (.htaccess)

Основные правила:
- **URL Rewriting:** `/music` → `/music.html` (чистые URL без расширения)
- **Cache Control:** 
  - HTML — no-cache (всегда свежие)
  - CSS/JS — 1 день
  - Media — 30 дней
- **Gzip сжатие** для текстовых файлов
- **MIME types** для всех ресурсов

## 🎵 VHS Плеер

Кастомный аудио-плеер с винтажным интерфейсом:
- **LCD дисплей** — таймкод трека (VT323 шрифт)
- **Кассетная лента** — анимированная при воспроизведении
- **Индикаторы POWER/PLAY/REC** — LED подсветка
- **Механические кнопки** — ◄◄ PLAY ■ ►►
- **Управление клавиатурой:** Space (play/pause), стрелки (prev/next)

## 🖼 Артисты

### Публичная страница (`artists.html`)
- **Карточки с фото** — загрузка из Supabase Storage
- **Лоадеры** — вращающийся спиннер пока фото грузится
- **Матричный эффект** — при клике на карточку:
  1. Белый шум поверх фото
  2. Фото исчезает
  3. Матричный дождь + печать текста
- **Адаптивная сетка** — 4 колонки (desktop) → 2 колонки (tablet) → 1 колонка (mobile)

### Админ-панель (`admin.html`)
- **CRUD операции** — создание/редактирование/удаление артистов
- **Загрузка фото** — прямая загрузка в Supabase Storage
- **Два режима:**
  - Управление артистами (левая панель)
  - Управление битами (правая панель)

## 🎨 Дизайн особенности

### VHS-эффекты
- **Шум (noise)** — SVG фильтр `feTurbulence` поверх контента
- **Scanlines** — горизонтальные полосы
- **Виньетка** — затемнение по краям экрана
- **Grayscale** — черно-белые фото артистов
- **Сепия** — легкий теплый оттенок на всей странице

### Цветовая палитра
```css
--vhs-bg-top: #1A1A1A        /* Темный фон сверху */
--vhs-bg-bottom: #2B2A28     /* Темный фон снизу */
--vhs-text: #D6D3C5          /* Теплый текст */
--vhs-amber: #FFB84C         /* Янтарная подсветка */
--vhs-green: #7FFF7F         /* Зеленые индикаторы */
--vhs-rec: #E74C3C           /* Красная запись */
```

### Шрифты
- **VT323** — LCD-дисплеи, таймкоды
- **IBM Plex Mono** — основной моноширинный шрифт
- **Share Tech Mono** — альтернативный моноширинный

## 📱 Адаптивность

### Breakpoints
- **Desktop:** > 1024px (полный функционал)
- **Tablet:** 768px - 1024px (упрощенная навигация)
- **Mobile:** < 768px (мобильная версия)

### Особенности mobile-версии
- Вертикальная навигация
- Упрощенный VHS-плеер
- Карточки артистов в 1 колонку
- Оптимизированные анимации

## 🔒 Безопасность

- **Supabase RLS (Row Level Security)** — ограничение доступа к данным
- **Service Role Key** — только для серверных операций (загрузка фото)
- **Anon Key** — для клиентских запросов (чтение данных)
- **CORS** — настроен для домена inmise.ru

## 🛠 Утилиты

### Миграция фото в Supabase Storage

`upload-to-storage.js` — автоматическая загрузка фото из `assets/images/artists/` в Supabase Storage:

```bash
node upload-to-storage.js
```

Скрипт:
1. Читает локальные фото
2. Загружает в bucket `artists`
3. Обновляет `image_url` в БД

## 📦 Зависимости

### Production
```json
{
  "@supabase/supabase-js": "^2.47.12",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
}
```

### Development
```json
{
  "@vitejs/plugin-react": "^4.3.4",
  "vite": "^6.0.3"
}
```

## 🌟 Ключевые фичи

✅ Полностью кастомный VHS-плеер без сторонних библиотек  
✅ Матричный дождь на Canvas с эффектом печатной машинки  
✅ Адаптивный дизайн для всех устройств  
✅ Supabase интеграция для динамического контента  
✅ Админ-панель для управления артистами без кода  
✅ Чистые URL без `.html` расширений  
✅ Оптимизация загрузки (lazy loading, cache busting)  
✅ VHS-слот с анимацией вставки кассеты (React)  

## 📞 Контакты

**Сайт:** [inmise.ru](https://inmise.ru)  
**Админ-панель:** [inmise.ru/admin](https://inmise.ru/admin)  

---

*Разработано с 💚 в VHS-эстетике*

