-- Журнал событий кабинета для раздела «Секретарь»: что произошло и когда.
-- Пишется из клиента при действиях артиста и из Edge Functions при публикациях.

create table if not exists public.artist_events (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  -- kind группирует события для фильтров в интерфейсе
  kind text not null check (kind in ('release', 'task', 'publication', 'beat', 'lyrics', 'file', 'platform', 'system')),
  title text not null,
  detail text not null default '',
  -- ссылка внутрь кабинета, чтобы из журнала можно было перейти к объекту
  target_view text,
  target_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists artist_events_artist_idx
  on public.artist_events(artist_id, created_at desc);
create index if not exists artist_events_kind_idx
  on public.artist_events(artist_id, kind, created_at desc);

alter table public.artist_events enable row level security;
revoke all on public.artist_events from anon;
grant select, insert on public.artist_events to authenticated;

-- Артист видит и пишет только свои события; правки и удаление не предусмотрены —
-- журнал должен оставаться достоверным.
drop policy if exists "artist reads own events" on public.artist_events;
create policy "artist reads own events"
on public.artist_events for select
to authenticated
using (private.owns_artist(artist_id));

drop policy if exists "artist writes own events" on public.artist_events;
create policy "artist writes own events"
on public.artist_events for insert
to authenticated
with check (private.owns_artist(artist_id));

comment on table public.artist_events is
  'Лента событий кабинета: релизы, задачи, публикации, загрузки. Только чтение и вставка.';
