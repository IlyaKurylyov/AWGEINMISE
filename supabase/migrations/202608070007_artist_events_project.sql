-- Событие журнала может относиться к конкретному релизу: тогда в «Истории всего»
-- видно, к какому именно, и можно отфильтровать журнал по релизу.
alter table public.artist_events
  add column if not exists project_id uuid;

-- Ссылку намеренно ставим с set null: релиз удалили, а запись в журнале
-- о том, что он был, должна остаться.
alter table public.artist_events
  drop constraint if exists artist_events_project_fk;
alter table public.artist_events
  add constraint artist_events_project_fk
  foreign key (project_id) references public.artist_projects(id) on delete set null;

create index if not exists artist_events_project_idx
  on public.artist_events(artist_id, project_id, created_at desc);

comment on column public.artist_events.project_id is
  'Релиз, к которому относится событие. null — событие вне релиза.';
