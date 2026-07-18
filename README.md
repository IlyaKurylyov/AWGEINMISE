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
