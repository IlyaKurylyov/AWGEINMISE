-- Шаблон плана выпуска становится данными, а не константой в коде.
-- Артист редактирует его на экране «Автоматизировать задачи»; новые релизы
-- собираются по шаблону, уже созданные не трогаются.
--
-- Связь «задача → этап» и «задача ждёт другую задачу» раньше держалась
-- на совпадении названий. Теперь это явные ссылки: у задачи релиза есть
-- stage_id и needs (id задач того же релиза). Старым релизам связи
-- проставляются один раз по нынешним названиям.

create table if not exists public.release_templates (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null default 'Сингл · 5 недель',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.template_stages (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  template_id uuid not null references public.release_templates(id) on delete cascade,
  title text not null,
  day_offset integer not null default -7,
  repeat_rule text not null default 'once',
  sort_order integer not null default 0
);

create table if not exists public.template_tasks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  template_id uuid not null references public.release_templates(id) on delete cascade,
  stage_id uuid references public.template_stages(id) on delete set null,
  title text not null,
  needs uuid[] not null default '{}',
  sort_order integer not null default 0
);

create index if not exists template_stages_template_idx on public.template_stages(template_id, sort_order);
create index if not exists template_tasks_template_idx on public.template_tasks(template_id, sort_order);

alter table public.release_templates enable row level security;
alter table public.template_stages enable row level security;
alter table public.template_tasks enable row level security;
revoke all on public.release_templates from anon;
revoke all on public.template_stages from anon;
revoke all on public.template_tasks from anon;
grant select, insert, update, delete on public.release_templates to authenticated;
grant select, insert, update, delete on public.template_stages to authenticated;
grant select, insert, update, delete on public.template_tasks to authenticated;

drop policy if exists "artist owns release templates" on public.release_templates;
create policy "artist owns release templates" on public.release_templates for all to authenticated
  using (private.owns_artist(artist_id)) with check (private.owns_artist(artist_id));
drop policy if exists "artist owns template stages" on public.template_stages;
create policy "artist owns template stages" on public.template_stages for all to authenticated
  using (private.owns_artist(artist_id)) with check (private.owns_artist(artist_id));
drop policy if exists "artist owns template tasks" on public.template_tasks;
create policy "artist owns template tasks" on public.template_tasks for all to authenticated
  using (private.owns_artist(artist_id)) with check (private.owns_artist(artist_id));

-- Явные связи в релизах.
alter table public.release_stages
  add column if not exists template_stage_id uuid;
alter table public.project_tasks
  add column if not exists stage_id uuid references public.release_stages(id) on delete set null,
  add column if not exists needs uuid[] not null default '{}';
alter table public.artist_projects
  add column if not exists template_id uuid references public.release_templates(id) on delete set null;

create index if not exists project_tasks_stage_idx on public.project_tasks(stage_id);

-- Старые релизы: задача → этап по нынешним названиям.
update public.project_tasks t
set stage_id = s.id
from public.release_stages s,
  (values
    ('Подтвердить права на бит', 'Получение прав'),
    ('Записать вокал', 'Запись'),
    ('Сделать обложку', 'Сведение и обложка'),
    ('Свести', 'Сведение и обложка'),
    ('Загрузить дистрибьютору', 'Дистрибуция и питч'),
    ('Отправить питч на площадки', 'Дистрибуция и питч'),
    ('Тизер 1', 'Пресейв и тизеры'),
    ('Тизер 2', 'Пресейв и тизеры'),
    ('Выложить во все площадки', 'День Х — во все площадки')
  ) as map(task_title, stage_title)
where t.stage_id is null
  and t.project_id is not null
  and t.title = map.task_title
  and s.project_id = t.project_id
  and s.artist_id = t.artist_id
  and s.title = map.stage_title;

-- Старые релизы: «ждёт» по нынешним названиям.
update public.project_tasks t
set needs = coalesce((
  select array_agg(n.id)
  from public.project_tasks n
  where n.project_id = t.project_id and n.artist_id = t.artist_id and n.title = any(map.list)
), '{}')
from (values
  ('Свести', array['Записать вокал']),
  ('Загрузить дистрибьютору', array['Свести', 'Сделать обложку', 'Подтвердить права на бит']),
  ('Отправить питч на площадки', array['Загрузить дистрибьютору']),
  ('Тизер 1', array['Загрузить дистрибьютору']),
  ('Тизер 2', array['Тизер 1']),
  ('Выложить во все площадки', array['Загрузить дистрибьютору'])
) as map(task_title, list)
where t.needs = '{}'
  and t.project_id is not null
  and t.title = map.task_title;

comment on table public.release_templates is 'Шаблоны плана выпуска артиста; is_default — какой берётся для нового релиза.';
comment on table public.template_stages is 'Этапы шаблона: за сколько дней до дня Х (day_offset ≤ 0), повтор.';
comment on table public.template_tasks is 'Задачи шаблона: к какому этапу относятся и каких задач ждут (needs — id задач шаблона).';
comment on column public.project_tasks.stage_id is 'Этап релиза, к которому относится задача. Этап закрыт, когда закрыты все его задачи.';
comment on column public.project_tasks.needs is 'Задачи того же релиза, которые должны быть закрыты раньше этой.';
