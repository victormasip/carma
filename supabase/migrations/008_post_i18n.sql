-- =============================================================================
-- MIGRACIÓ 008: Multi-idioma d'articles (post i18n)
-- =============================================================================
-- Un article = una sola fila. Els camps de l'idioma per defecte segueixen vivint
-- a les columnes planes existents (title/slug/content/excerpt/seo_*), de manera
-- que TOTES les consultes actuals (llistat, slug, import, render) segueixen
-- funcionant sense canvis. Les variants en altres idiomes es guarden a `i18n`:
--
--   i18n = {
--     "es": { "title": "...", "slug": "...", "content": {"html": "..."},
--             "excerpt": "...", "seo_title": "...", "seo_description": "..." },
--     "ca": { ... }
--   }
--
-- `default_locale` etiqueta quin idioma representen les columnes planes.
-- El codi té fallback (error 42703) si aquesta migració encara no s'ha executat.
-- Executar al Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_locale TEXT NOT NULL DEFAULT 'ca';

-- Recarregar el schema cache de PostgREST perquè Supabase vegi les noves columnes
NOTIFY pgrst, 'reload schema';
