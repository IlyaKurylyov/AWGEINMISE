-- Ещё один повод написать артисту: у задач нет дат, они висят без плана.
alter table public.notification_rules
  drop constraint if exists notification_rules_event_type_check;
alter table public.notification_rules
  add constraint notification_rules_event_type_check
  check (event_type in ('release_soon', 'task_due', 'task_overdue', 'publish_failed', 'weekly_digest', 'tasks_unplanned'));
