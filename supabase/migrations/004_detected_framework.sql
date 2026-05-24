-- =============================================================================
-- MIGRACIÓ 004: detecció de framework + hosting del client
-- Executar al SQL Editor de Supabase
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS detected_framework TEXT,
  ADD COLUMN IF NOT EXISTS detected_hosting   TEXT;

-- Recarregar schema cache de PostgREST perquè Supabase vegi les noves columnes
NOTIFY pgrst, 'reload schema';
