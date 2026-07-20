alter table public.project_tasks
  add column if not exists workflow_status text;

update public.project_tasks
set workflow_status = case when is_done then 'uploaded' else 'idea' end
where workflow_status is null;

alter table public.project_tasks
  alter column workflow_status set default 'idea',
  alter column workflow_status set not null;

alter table public.project_tasks
  drop constraint if exists project_tasks_workflow_status_check;

alter table public.project_tasks
  add constraint project_tasks_workflow_status_check
  check (workflow_status in ('idea', 'doing', 'uploaded'));

create index if not exists project_tasks_workflow_idx
  on public.project_tasks(artist_id, workflow_status, sort_order, due_at);
