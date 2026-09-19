-- Основной шаблон у артиста один. Заодно это защита от гонки: две вкладки
-- одновременно увидели «шаблонов нет» и обе посеяли заготовку — вторая
-- вставка теперь упрётся в индекс.
create unique index if not exists release_templates_one_default
  on public.release_templates(artist_id) where is_default;
