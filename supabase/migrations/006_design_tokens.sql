-- =============================================================================
-- MIGRACIÓ 006: design tokens (Theme Grabber)
-- =============================================================================
-- El nou "Theme Grabber" agafa UNA sola URL del client i n'extreu:
--   · header + footer (replicats exactament, amb la navegació original)
--   · design tokens (colors, tipografies, radis, etc.) que s'injecten a les
--     NOSTRES plantilles de blog en lloc de mapejar classes del client.
-- `design_tokens` és un JSONB amb les claus de DesignTokens (src/lib/scrape/tokens.ts).
-- `reference_url` és la URL única analitzada (substitueix reference_url_*).
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS design_tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_url TEXT;

-- Recarregar el schema cache de PostgREST perquè Supabase vegi les noves columnes
NOTIFY pgrst, 'reload schema';
