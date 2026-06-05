-- =============================================================================
-- MIGRACIÓ 013: Bucket d'emmagatzematge per a les imatges dels articles
-- =============================================================================
-- Abans, les imatges enganxades/arrossegades a l'editor es guardaven com a
-- data-URIs base64 DINS de posts.content. Això:
--   · trencava el render (el /api/img rebia URLs de megabytes → 400/failed),
--   · inflava la BD (cada imatge = MBs de base64 al JSONB).
--
-- Ara es pugen a Supabase Storage (bucket públic 'post-media') i es guarda
-- només la URL neta. El /api/upload (service-role) hi escriu; la lectura és
-- pública perquè el render i el /api/img hi puguin accedir.
--
-- Executar al Supabase SQL Editor.
-- =============================================================================

-- Bucket públic per a la lectura (la pujada va sempre via service-role al servidor).
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do update set public = true;

-- Lectura pública dels objectes d'aquest bucket (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'post-media public read'
  ) then
    create policy "post-media public read"
      on storage.objects for select
      using (bucket_id = 'post-media');
  end if;
end $$;
