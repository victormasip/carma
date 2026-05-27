-- =============================================================================
-- MIGRACIÓ 007: section_title (Theme Grabber)
-- =============================================================================
-- Títol de la pàgina de notícies/blog del client (p. ex. "Actualitat",
-- "Noticias", "Blog"), extret de l'URL analitzada i usat com a encapçalament
-- del llistat d'articles al render, en lloc del literal "Articles".
-- Executar al Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS section_title TEXT;

-- Recarregar el schema cache de PostgREST perquè Supabase vegi la nova columna
NOTIFY pgrst, 'reload schema';
