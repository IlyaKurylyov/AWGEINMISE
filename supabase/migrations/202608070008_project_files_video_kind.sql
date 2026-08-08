-- Материалом может быть и видео: клипы, тизеры, вертикалки.
alter table public.project_files
  drop constraint if exists project_file_kind_check;
alter table public.project_files
  add constraint project_file_kind_check
  check (file_kind in ('cover', 'demo', 'master', 'stem', 'document', 'video', 'other', 'link'));
