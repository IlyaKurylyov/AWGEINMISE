-- Этапы пути релиза: план роллаута, посчитанный назад от даты выхода.
-- Храним их, а не вычисляем на ходу, потому что артист правит названия,
-- даты и может закрепить этап, чтобы он не сдвигался вместе с релизом.
create table if not exists public.release_stages (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  stage_date date,
  -- смещение от даты релиза в днях: отрицательное — до выхода
  day_offset integer not null default 0,
  is_done boolean not null default false,
  -- закреплённый этап не сдвигается при переносе дня Х
  is_pinned boolean not null default false,
  repeat_rule text not null default 'once' check (repeat_rule in ('once', 'every_2_days', 'weekly')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (project_id, artist_id)
    references public.artist_projects(id, artist_id)
    on delete cascade
);

create index if not exists release_stages_project_idx
  on public.release_stages(artist_id, project_id, sort_order);

alter table public.release_stages enable row level security;
revoke all on public.release_stages from anon;
grant select, insert, update, delete on public.release_stages to authenticated;

drop policy if exists "artist owns release stages" on public.release_stages;
create policy "artist owns release stages"
on public.release_stages for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

comment on table public.release_stages is
  'Этапы пути релиза: вехи роллаута с датами, повторами и закреплением.';
