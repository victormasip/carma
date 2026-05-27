-- =============================================================================
-- MIGRACIÓ 011: Chrome multilingüe (header/footer/títol de secció per idioma)
-- =============================================================================
-- El header i el footer reconstruïts (extracted_header/footer) i el section_title
-- representen l'idioma per defecte del lloc. Les versions traduïdes d'altres
-- idiomes es guarden a `chrome_i18n`:
--
--   chrome_i18n = {
--     "es": { "header": "{...json...}", "footer": "{...json...}", "section_title": "Noticias" },
--     "en": { ... }
--   }
--
-- Al render, en canviar d'idioma, el header/footer/títol s'agafen d'aquí (amb
-- fallback a la versió base). L'editor de tema permet editar/traduir cada idioma.
-- El codi té fallback (error 42703) si aquesta migració encara no s'ha executat.
-- Executar al Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS chrome_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Recarregar el schema cache de PostgREST perquè Supabase vegi la nova columna
NOTIFY pgrst, 'reload schema';
