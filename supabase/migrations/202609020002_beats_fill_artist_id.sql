-- Миграции уезжают на прод раньше кода: сейчас на сервере лежит сборка от
-- 7 августа, которая вставляет бит без artist_id. Политика из предыдущей
-- миграции требует owns_artist(artist_id) и такую вставку отвергает — загрузка
-- бита на живом сайте ломается до деплоя нового фронта.
--
-- Поэтому artist_id проставляется в базе, а не только в браузере. Триггер BEFORE
-- INSERT срабатывает раньше проверки RLS, так что политика видит уже заполненную
-- строку: старый код продолжает работать, новый передаёт artist_id явно, а данные
-- в обоих случаях остаются корректными.

begin;

create or replace function private.beats_fill_artist_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.artist_id is null and new.owner_user_id is not null then
    select artist.id
      into new.artist_id
    from public.artists as artist
    -- Сортировка по id, а не по created_at: artists — таблица старого сайта,
    -- и набор её колонок миграциями не задан. Владеть двумя карточками всё
    -- равно не даёт claim_artist_invite, так что выбор здесь однозначен.
    where artist.owner_user_id = new.owner_user_id
    order by artist.id
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists beats_fill_artist_id on public.beats;
create trigger beats_fill_artist_id
before insert on public.beats
for each row
execute function private.beats_fill_artist_id();

commit;
