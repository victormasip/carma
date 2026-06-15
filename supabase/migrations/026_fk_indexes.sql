-- =============================================================================
-- MIGRACIÓ 026: Índexs de claus foranes que faltaven (perf en créixer les dades)
-- Executar al Supabase SQL Editor. Additiu i idempotent — cap canvi d'esquema.
-- =============================================================================
-- Postgres NO indexa automàticament les columnes FK. Aquests índexs acceleren:
--   · els JOIN/filtres per FK a mesura que creixen les taules,
--   · els ON DELETE (SET NULL / CASCADE), que han de trobar les files referents,
--   · la resolució de blog per subdomini al render públic (cerca exacta).
--
-- Ja cobert per migracions anteriors (no es repeteix aquí):
--   posts(site_id,*) i sites(api_key) → 019 · leads(site_id,*) → 025
--   page_views(site_id,*) i (post_id,*) → 015 · site_users(user_id) → 019
--   site_users(site_id) i site_themes(site_id) → columna líder de la PK.
-- =============================================================================

-- leads.post_id → posts(id): FK sense índex; l'usa l'ON DELETE SET NULL en
-- esborrar un article, i qualsevol consulta de leads per article.
CREATE INDEX IF NOT EXISTS leads_post_idx ON public.leads (post_id);

-- grabber_lab_samples.created_by → profiles(id): FK sense índex.
CREATE INDEX IF NOT EXISTS grabber_lab_samples_created_by_idx
  ON public.grabber_lab_samples (created_by);

-- sites.subdomain: el render públic resol el blog amb una cerca EXACTA
-- (`subdomain = <label>`). L'índex únic existent és FUNCIONAL (lower(subdomain))
-- i no serveix per a la igualtat exacta sobre la columna; aquest btree pla sí.
CREATE INDEX IF NOT EXISTS sites_subdomain_idx ON public.sites (subdomain);

NOTIFY pgrst, 'reload schema';
