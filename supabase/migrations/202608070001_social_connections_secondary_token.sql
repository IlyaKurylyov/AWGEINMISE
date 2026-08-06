-- VK запрещает wall.post бизнес-профилям (ошибка 1051), но токен сообщества
-- такие записи публиковать может. Храним его рядом с пользовательским токеном:
-- user-токен нужен для video.save, токен сообщества — для стены и вложений.
-- Для обычных профилей колонка остаётся пустой: user-токена достаточно.
alter table public.social_connections
  add column if not exists secondary_token text;

comment on column public.social_connections.secondary_token is
  'VK: токен сообщества для wall.post/photos/docs, когда user-профиль бизнесовый.';
