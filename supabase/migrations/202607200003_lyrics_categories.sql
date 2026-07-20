alter table public.lyrics_documents
  add column if not exists category text;

update public.lyrics_documents
set category = 'В работе'
where category is null or btrim(category) = '';

alter table public.lyrics_documents
  alter column category set default 'В работе',
  alter column category set not null;

create index if not exists lyrics_documents_category_idx
  on public.lyrics_documents(artist_id, category, updated_at desc);
