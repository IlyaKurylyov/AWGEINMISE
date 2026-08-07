-- Ежечасный запуск рассылки «Секретаря».
-- Секрет для вызова генерируется здесь же и читается сервером через
-- service-role: RLS без политик закрывает таблицу от всех остальных,
-- поэтому значение не нужно нигде дублировать руками.

create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);

alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

comment on table public.app_secrets is
  'Внутренние секреты сервера. Доступ только через service-role: политик RLS нет.';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('secretary-notify-hourly')
where exists (select 1 from cron.job where jobname = 'secretary-notify-hourly');

select cron.schedule(
  'secretary-notify-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://cibzssnqbctwydobpahm.supabase.co/functions/v1/secretary-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')
    ),
    body := jsonb_build_object('action', 'dispatch')
  );
  $$
);
