-- Во сколько присылать ежедневные напоминания. Без этого рассылка срабатывала
-- на первом часовом проходе после полуночи UTC — около трёх ночи по Москве.
create table if not exists public.notification_prefs (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  send_hour smallint not null default 10 check (send_hour between 0 and 23),
  timezone text not null default 'Europe/Moscow',
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon;
grant select, insert, update on public.notification_prefs to authenticated;

drop policy if exists "artist owns notification prefs" on public.notification_prefs;
create policy "artist owns notification prefs"
on public.notification_prefs for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

comment on table public.notification_prefs is
  'Час отправки ежедневных напоминаний в часовом поясе артиста.';
