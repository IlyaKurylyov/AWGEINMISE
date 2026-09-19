-- Отметки «убрать из списка» в секретаре жили в localStorage браузера:
-- другой браузер или чистка данных сайта — и всё «прочитанное» возвращалось.
-- Теперь ключи убранных пунктов хранятся у артиста в настройках секретаря.

alter table public.notification_prefs
  add column if not exists dismissed_keys jsonb not null default '[]'::jsonb;

comment on column public.notification_prefs.dismissed_keys is
  'Ключи пунктов секретаря, которые артист убрал из списка «Что нужно сделать».';
