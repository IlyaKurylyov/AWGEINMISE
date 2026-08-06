-- VK ID требует device_id при обновлении токена по refresh_token.
-- Токен VK привязан к IP выдачи, поэтому перед публикацией он обновляется,
-- и без device_id это сделать невозможно.
alter table public.social_connections
  add column if not exists device_id text;

comment on column public.social_connections.device_id is
  'VK ID device_id, нужен для grant_type=refresh_token. Для остальных площадок null.';
