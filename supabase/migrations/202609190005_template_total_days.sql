-- Шаблон говорит, сколько дней артист закладывает на релиз: этапы стоят
-- внутри этого срока, а при сборке план просит ровно столько дней.
-- Встроенный шаблон «Сингл · 5 недель» нельзя удалить и переименовать.
alter table public.release_templates
  add column if not exists total_days integer not null default 35
    check (total_days between 1 and 365),
  add column if not exists is_builtin boolean not null default false;

update public.release_templates set is_builtin = true where title = 'Сингл · 5 недель';

comment on column public.release_templates.total_days is 'Сколько дней артист закладывает на релиз по этому шаблону.';
comment on column public.release_templates.is_builtin is 'Наш шаблон: не удаляется и не переименовывается.';
