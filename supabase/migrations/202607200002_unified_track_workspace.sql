-- Tasks may exist independently from a release and can be linked later.
alter table public.project_tasks
  alter column project_id drop not null;

-- "Master" is no longer a separate production stage in the artist terminal.
update public.artist_projects
set status = 'mix'
where status = 'master';

-- Every existing release starts with the same practical production checklist.
insert into public.project_tasks (
  artist_id,
  project_id,
  title,
  workflow_status,
  is_done,
  sort_order
)
select
  project.artist_id,
  project.id,
  defaults.title,
  'idea',
  false,
  defaults.sort_order
from public.artist_projects as project
cross join (
  values
    ('Сделать обложку', 0),
    ('Записать вокал', 1),
    ('Свести', 2)
) as defaults(title, sort_order)
where not exists (
  select 1
  from public.project_tasks as task
  where task.project_id = project.id
    and lower(task.title) = lower(defaults.title)
);
