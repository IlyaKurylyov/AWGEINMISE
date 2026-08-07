-- Уведомления «Секретаря»: куда присылать (каналы), о чём (правила)
-- и что уже отправлено (чтобы не дублировать напоминания).

create table if not exists public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  kind text not null check (kind in ('email', 'telegram')),
  -- email: адрес; telegram: @username бота для наглядности
  address text not null default '',
  -- telegram: личный chat_id артиста, получаем через getUpdates после «Старт»
  chat_id text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (artist_id, kind)
);

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  event_type text not null check (event_type in ('release_soon', 'task_due', 'task_overdue', 'publish_failed', 'weekly_digest')),
  channel_kind text not null check (channel_kind in ('email', 'telegram')),
  enabled boolean not null default false,
  -- смысл зависит от типа: за сколько дней, во сколько, как часто
  timing text not null default 'default',
  unique (artist_id, event_type, channel_kind)
);

-- Защита от повторов: одно напоминание об одном объекте в один день.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  event_type text not null,
  -- ключ объекта: id задачи, релиза или площадки
  subject_key text not null,
  channel_kind text not null,
  sent_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  unique (artist_id, event_type, subject_key, channel_kind, sent_date)
);

create index if not exists notification_log_lookup_idx
  on public.notification_log(artist_id, event_type, subject_key);

alter table public.notification_channels enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notification_log enable row level security;

revoke all on public.notification_channels from anon;
revoke all on public.notification_rules from anon;
revoke all on public.notification_log from anon;

-- Каналы и правила настраивает сам артист; журнал отправок ведёт только сервер.
grant select, insert, update, delete on public.notification_channels to authenticated;
grant select, insert, update, delete on public.notification_rules to authenticated;
grant select on public.notification_log to authenticated;

drop policy if exists "artist owns notification channels" on public.notification_channels;
create policy "artist owns notification channels"
on public.notification_channels for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop policy if exists "artist owns notification rules" on public.notification_rules;
create policy "artist owns notification rules"
on public.notification_rules for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

drop policy if exists "artist reads notification log" on public.notification_log;
create policy "artist reads notification log"
on public.notification_log for select
to authenticated
using (private.owns_artist(artist_id));

comment on table public.notification_channels is
  'Каналы доставки уведомлений артиста: почта и Telegram.';
comment on table public.notification_rules is
  'Матрица «событие × канал»: что и куда присылать, с настройкой времени.';
comment on table public.notification_log is
  'Отметки об отправленных напоминаниях, чтобы не дублировать их каждый час.';
