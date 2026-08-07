-- Материалы проекта хранятся не у нас: артист кладёт файлы в своё облако,
-- а здесь остаётся ссылка. Поэтому у записи может быть либо путь в бакете
-- (старые загрузки), либо внешний адрес.
alter table public.project_files
  add column if not exists link_url text;

alter table public.project_files
  alter column storage_path drop not null;

alter table public.project_files
  drop constraint if exists project_file_kind_check;
alter table public.project_files
  add constraint project_file_kind_check
  check (file_kind in ('cover', 'demo', 'master', 'stem', 'document', 'other', 'link'));

alter table public.project_files
  drop constraint if exists project_file_location_check;
alter table public.project_files
  add constraint project_file_location_check
  check (storage_path is not null or link_url is not null);

comment on column public.project_files.link_url is
  'Внешняя ссылка на материал (Яндекс Диск и подобное), когда файл не у нас.';
