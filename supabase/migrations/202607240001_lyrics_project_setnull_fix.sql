-- Deleting a project failed when it had linked lyrics: the composite FK
-- (project_id, artist_id) with ON DELETE SET NULL nulled BOTH columns, and
-- artist_id is NOT NULL. Re-create the FK to null only project_id (PG 15+).

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.lyrics_documents'::regclass
    and contype = 'f'
    and confrelid = 'public.artist_projects'::regclass;
  if cname is not null then
    execute format('alter table public.lyrics_documents drop constraint %I', cname);
  end if;
end $$;

alter table public.lyrics_documents
  add constraint lyrics_documents_project_id_artist_id_fkey
  foreign key (project_id, artist_id)
  references public.artist_projects(id, artist_id)
  on delete set null (project_id);
