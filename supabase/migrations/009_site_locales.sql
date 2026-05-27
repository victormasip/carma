-- =============================================================================
-- MIGRACIÓ 009: Idiomes per lloc (site-level i18n config)
-- =============================================================================
-- Cada lloc declara quins idiomes ofereix el seu blog (`locales`) i quin és el
-- per defecte (`default_locale`, sempre 'ca' tret que es canviï explícitament).
-- En capturar la web del client (Theme Grabber) l'idioma detectat de <html lang>
-- s'AFEGEIX a `locales` (no força el default, per no segrestar la base d'un lloc
-- català amb un <html lang="en"> mal etiquetat). L'editor d'articles llegeix
-- aquesta config per saber quines pestanyes d'idioma mostrar (botó "+").
-- El codi té fallback (error 42703) si aquesta migració encara no s'ha executat.
-- Executar al Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS default_locale TEXT NOT NULL DEFAULT 'ca',
  ADD COLUMN IF NOT EXISTS locales TEXT[] NOT NULL DEFAULT ARRAY['ca']::text[];

-- Recarregar el schema cache de PostgREST perquè Supabase vegi les noves columnes
NOTIFY pgrst, 'reload schema';
