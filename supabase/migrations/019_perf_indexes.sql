-- =============================================================================
-- MIGRACIÓ 019: Índexs de rendiment per als camins calents
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- Additiu i idempotent (CREATE INDEX IF NOT EXISTS) — cap canvi d'esquema ni de
-- dades, només acelera consultes que avui fan seq scan a mesura que creixen les
-- taules. Cap regressió possible.
--
-- Camins coberts:
--   · posts(site_id, created_at DESC) — el llistat paginat (listPosts) i el render
--     públic ordenen SEMPRE per created_at dins d'un site.
--   · posts(site_id, is_published)    — els head-counts de publicats/esborranys del
--     dashboard i el filtre d'estat.
--   · site_users(user_id)             — el sidebar/layout llista els sites d'un
--     usuari per user_id; la PK és (site_id, user_id), així que user_id sol no
--     està indexat (seq scan a cada càrrega del dashboard del client).
--   · sites(api_key)                  — l'API pública (/api/v1/posts) autentica fent
--     un lookup per api_key a CADA petició; sense índex és un seq scan de sites.
-- =============================================================================

CREATE INDEX IF NOT EXISTS posts_site_created_idx
  ON public.posts (site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_site_published_idx
  ON public.posts (site_id, is_published);

CREATE INDEX IF NOT EXISTS site_users_user_idx
  ON public.site_users (user_id);

CREATE INDEX IF NOT EXISTS sites_api_key_idx
  ON public.sites (api_key);

NOTIFY pgrst, 'reload schema';
