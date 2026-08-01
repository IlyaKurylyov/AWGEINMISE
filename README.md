# INMISE

Сайт независимого аудио/видео-лейбла в эстетике VHS/CRT.

## Страницы

- `/` — главный терминал.
- `/releases/` — релизы и выбор артиста.
- `/artists/` — консоль артистов.
- `/collaboration/` — биты и сотрудничество.
- `/contacts/` — контакты.
- `/admin/` — кабинет артиста и владельца лейбла.
- `/invite/` — активация кабинета по персональному приглашению.

## Стек

- Vite
- HTML, CSS и JavaScript без клиентского фреймворка
- Supabase для динамического контента

## Локальный запуск

```bash
npm install
npm run dev
```

Для подключения Supabase скопируйте `scripts/config.local.example.js` в
`scripts/config.local.js` и укажите URL проекта и publishable/anon key.
`config.local.js` исключён из Git. Service-role key в браузерный код добавлять нельзя.

Без локальной конфигурации Artists использует встроенный статический fallback.

## Production

```bash
npm run build
npm run preview
```

Production-сборка создаётся в `dist/`. В исходниках медиа подключаются относительно
корня проекта, например `assets/ui/home-bezel.png`. Vite обрабатывает статические
ресурсы, а динамические изображения и аудио копируются без переименования.

## Автопостинг: подключение соцсетей

Раздел `/admin/` → «Автопостинг» публикует в VK, Telegram, Instagram и YouTube.
Подключения хранятся по каждому артисту отдельно (таблица `social_connections`,
ключ `artist_id`). Серверная логика — Edge Functions Supabase: `social-connect`
(подключение/статус), `social-publish` (публикация), `social-storage` (загрузка медиа).

Площадки делятся на два типа подключения:

### Telegram и Vk — по токену (мультиарендно из коробки)

Артист вставляет свой токен в форме подключения. Централизованного приложения
и ревью не требуется.

- **Telegram:** бот через [@BotFather](https://t.me/BotFather) → токен вида
  `123456:ABC...`; в поле «Канал» — `@username`; бот должен быть **администратором**
  канала. Сервер проверяет доступ через `getChat`.
- **VK:** токен **сообщества** (Управление → Настройки → Работа с API → Ключи доступа;
  права: Управление, Стена, Фотографии, Документы) + числовой ID группы (без `club`).
  Публикация использует `wall.post`, `photos.*`, `docs.*`, `video.save`.

### Instagram и YouTube — по OAuth (через одно центральное приложение)

Артисты **не создают** приложения — используется одно приложение владельца.

- **Instagram (Meta Graph API через Facebook Login):**
  - Приложение Meta (developers.facebook.com), App ID хранится в
    `scripts/config.js` → `window.META_APP_ID` (публичное значение).
  - Redirect URI: `https://inmise.ru/admin/` (Facebook Login → Настройки →
    «Действительные URI перенаправления OAuth»).
  - OAuth scope: `instagram_basic, instagram_content_publish, pages_show_list,
    pages_read_engagement, business_management`. `business_management` обязателен,
    иначе `/me/accounts` не возвращает страницы из бизнес-портфолио.
  - Требование к аккаунту артиста: Instagram **Business** (не Creator), привязанный
    к **странице Facebook** (связка в Meta Business Suite → Аккаунты Instagram).
  - Сервер по коду находит `instagram_business_account` у страниц и сохраняет
    page access token.
- **YouTube (Google OAuth):** client id в `scripts/config.js` →
  `window.GOOGLE_CLIENT_ID`; scope `youtube.upload`, `youtube.readonly`.

### Секреты (Supabase Edge Functions)

Задаются через Supabase CLI, значения в репозиторий не попадают:

```bash
npx supabase secrets set META_APP_ID=... META_APP_SECRET=... --project-ref <ref>
```

Имена: `META_APP_ID`, `META_APP_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
(+ стандартные `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

### Модель доступа для артистов

Приложения Meta/Google держатся в режиме разработки. Чтобы артист мог подключить
Instagram/YouTube, его добавляют:

- в Meta — как **тестировщика** (приложение → Роли в приложении);
- в Google — как **test user** (OAuth consent screen, лимит 100).

Полный App Review Meta и верификация бизнеса нужны только при выходе за пределы
закрытого круга тестировщиков. В Google в режиме Testing refresh-токен живёт 7 дней.

Панель автопостинга содержит сворачиваемую инструкцию «Как подключить Instagram?»,
а ошибки подключения переводятся в понятные подсказки (`socialErrorHint` в
`scripts/artist-terminal.js`).

## Структура

```text
assets/
  beats/                 локальный fallback страницы Collaboration
  icons/                 социальные иконки
  images/artists/        фотографии артистов
  ui/                    корпуса, панели и спрайты интерфейса
  videos/                видеофоны и клипы
scripts/
  home-terminal.js       главный экран
  releases-vhs.js        экран Releases
  artists-signal.js      экран Artists
  app.js                 общая логика старых страниц
  beats.js               локальный fallback битов
  work-dynamic.js        данные Collaboration из Supabase
  admin.js               админ-панель
styles/
  home-terminal.css
  releases-vhs.css
  artists-signal.css
  work.css
  contacts.css
  responsive.css
  work-responsive.css
```

## Адаптивность

Главный экран имеет отдельные desktop/tablet/mobile варианты. Releases и Artists
пока являются desktop-first консолями с пропорциональным масштабированием корпуса.
Мобильная адаптация этих двух экранов выполняется отдельным этапом.
