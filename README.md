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

### Telegram — по токену (мультиарендно из коробки)

Артист вставляет свой токен в форме подключения; централизованного приложения
и ревью не требуется. Бот создаётся через [@BotFather](https://t.me/BotFather)
(токен вида `123456:ABC...`), в поле «Канал» — `@username`. Бот обязан быть
**администратором канала** с правом публикации, иначе публикация падает с
`Forbidden: bot is not a member of the channel chat` (при подключении `getChat`
проходит и без членства — доступ проверяется только при постинге).

Лимит Bot API: видео по URL — около **20 МБ** (загрузка файлом — 50 МБ).
Тяжёлые ролики в Telegram не уходят, для них используется инструмент Shorts.

### VK — по OAuth (VK ID 2.1 + PKCE, user-токен)

Публикация видео (`video.save`) требует **пользовательского** токена со scope
`video`. Токен **сообщества** такой scope получить не может (в списке прав ключа
сообщества «Видео» отсутствует) — с ним работают только текст, фото и документы,
а `video.save` возвращает `User authorization failed`. Поэтому VK подключается
через OAuth, а не вставкой токена.

- Приложение **VK ID** (id.vk.com, тип Web) — одно на весь сервис. App ID лежит
  в `scripts/config.js` → `window.VK_APP_ID`, защищённый ключ — в секретах Supabase.
- Базовый домен `inmise.ru`, доверенный Redirect URL `https://inmise.ru/admin/`.
- Владелец приложения проходит **подтверждение бизнес-профиля** в VK Бизнес ID —
  без него раздел «Расширенные доступы» закрыт. Для ИП рабочий путь: активировать
  учётную запись ИП на Госуслугах (в списке «организаций» ИП не появляется,
  но подтверждение проходит), либо банковский ID / ручная проверка.
- Авторизация: `https://id.vk.com/authorize` с `response_type=code`,
  `code_challenge_method=S256`, scope `video wall photos docs groups`.
  Обмен кода — `POST https://id.vk.com/oauth2/auth` с `code_verifier`,
  `device_id` (VK возвращает его в redirect) и `client_secret`.

Подводные камни, на которые ушло много времени:

- Классический `oauth.vk.com/authorize` с приложением VK ID отвечает
  `Security Error`, а регистрация старых Standalone-приложений закрыта —
  implicit flow недоступен, только VK ID.
- VK ID **не всегда возвращает `state`** (в частности, ломается на значении
  с точкой), поэтому возврат опознаётся ещё и по префиксу кода `vk2.`.
  `code_verifier` и ID сообщества хранятся в `localStorage`.
- `groups.get` недоступен бизнес-профилям (`Method is not available for this
  profile type`, код 1051), поэтому ID сообщества спрашивается у артиста перед
  входом, а название подтягивается через `groups.getById`.
- Токен проверяется вызовом `users.get`: если метод не проходит, отдаётся
  явная ошибка `vk_token_not_api_capable` вместо невнятного отказа.

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

Имена: `META_APP_ID`, `META_APP_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`VK_APP_ID`, `VK_APP_SECRET` (+ стандартные `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`).

### Модель доступа для артистов

Приложения (Meta, Google, VK ID) создаёт и держит у себя владелец сервиса —
артисты их не регистрируют и бизнес-верификацию не проходят. От артиста нужен
только собственный аккаунт площадки и нажатие «Подключить».

Приложения Meta/Google держатся в режиме разработки, поэтому артиста туда
добавляют вручную:

- в Meta — как **тестировщика** (приложение → Роли в приложении);
- в Google — как **test user** (OAuth consent screen, лимит 100).

Полный App Review Meta и верификация бизнеса нужны только при выходе за пределы
закрытого круга тестировщиков. В Google в режиме Testing refresh-токен живёт
7 дней — YouTube приходится периодически переподключать.

Что требуется от самого артиста по площадкам:

| Площадка | Что нужно артисту | Добавлять в приложение |
|---|---|---|
| Telegram | свой бот от @BotFather, бот — админ канала | нет |
| VK | быть админом сообщества, знать его числовой ID | нет |
| Instagram | аккаунт **Business**, привязанный к странице Facebook | да, тестировщиком |
| YouTube | аккаунт Google с каналом | да, test user |

VK-подключение третьим лицом (не владельцем приложения) пока не проверялось —
приложение публичное и включено, но при раскатке на артистов это стоит
протестировать первым.

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
