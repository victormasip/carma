-- =============================================================================
-- FIX 003: actualitzar site_themes a la versió amb 3 URLs de referència
-- Executar al SQL Editor de Supabase per resoldre l'error
-- "Could not find the 'reference_url_article' column"
-- =============================================================================
-- Aquest script és idempotent: pots executar-lo encara que ja l'haguis fet.
-- =============================================================================

-- 1. Afegir les noves columnes (si no existeixen)
ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS reference_url_home    TEXT,
  ADD COLUMN IF NOT EXISTS reference_url_listing TEXT,
  ADD COLUMN IF NOT EXISTS reference_url_article TEXT;

-- 2. Migrar dades antigues si la columna 'reference_url' existeix
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'site_themes'
      AND column_name = 'reference_url'
  ) THEN
    UPDATE public.site_themes
       SET reference_url_home = COALESCE(reference_url_home, reference_url)
     WHERE reference_url IS NOT NULL;

    ALTER TABLE public.site_themes DROP COLUMN reference_url;
  END IF;
END;
$$;

-- 3. Eliminar la columna 'raw_html' si existeix (ja no l'usem)
ALTER TABLE public.site_themes DROP COLUMN IF EXISTS raw_html;

-- 4. CRÍTIC: recarregar el schema cache de PostgREST
--    Sense això Supabase no veurà els canvis fins reiniciar.
NOTIFY pgrst, 'reload schema';
