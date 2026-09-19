-- Задача перестаёт быть строкой с галочкой. У неё появляются описание,
-- исполнитель («кто делает» и «когда обещал»), расписание повтора,
-- напоминание и материалы — ссылки, заметки, файлы.
--
-- Повтор: закрыл задачу — следующая появляется сама с новым сроком.
-- Напоминание шлёт Секретарь в выбранный час: «за день» или «утром в срок».

alter table public.project_tasks
  add column if not exists description text,
  add column if not exists assignee_name text,
  add column if not exists assignee_contact text,
  add column if not exists promised_at date,
  add column if not exists repeat_rule text not null default 'none',
  add column if not exists repeat_until date,
  add column if not exists remind_rule text not null default 'none';

alter table public.project_tasks
  drop constraint if exists project_tasks_repeat_rule_check;
alter table public.project_tasks
  add constraint project_tasks_repeat_rule_check
  check (repeat_rule in ('none', 'daily', 'every2', 'every3', 'weekly'));

alter table public.project_tasks
  drop constraint if exists project_tasks_remind_rule_check;
alter table public.project_tasks
  add constraint project_tasks_remind_rule_check
  check (remind_rule in ('none', 'day_before', 'on_day'));

comment on column public.project_tasks.description is 'Что именно нужно сделать — свободный текст.';
comment on column public.project_tasks.assignee_name is 'Кто делает: имя человека, если задача отдана на сторону.';
comment on column public.project_tasks.assignee_contact is 'Как связаться: телефон, Telegram.';
comment on column public.project_tasks.promised_at is 'Когда исполнитель обещал сдать.';
comment on column public.project_tasks.repeat_rule is 'Повтор: none / daily / every2 / every3 / weekly. Следующая задача создаётся при закрытии.';
comment on column public.project_tasks.repeat_until is 'До какой даты повторять.';
comment on column public.project_tasks.remind_rule is 'Напоминание Секретаря: none / day_before / on_day.';

create table if not exists public.task_materials (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  kind text not null check (kind in ('link', 'note', 'file')),
  title text not null default '',
  url text,
  body text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists task_materials_task_idx on public.task_materials(task_id, created_at);

alter table public.task_materials enable row level security;
revoke all on public.task_materials from anon;
grant select, insert, update, delete on public.task_materials to authenticated;

drop policy if exists "artist owns task materials" on public.task_materials;
create policy "artist owns task materials"
on public.task_materials for all
to authenticated
using (private.owns_artist(artist_id))
with check (private.owns_artist(artist_id));

comment on table public.task_materials is
  'Материалы задачи: ссылки, заметки и файлы (файлы лежат в бакете artist-private в папке артиста).';
