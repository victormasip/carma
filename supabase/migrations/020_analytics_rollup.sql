-- =============================================================================
-- MIGRACIÓ 020: Rollup d'analítica — recompte de vistes per site en UNA consulta
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- Abans, el dashboard cridava fetchSitesViewCounts() que feia UNA consulta de
-- recompte PER site (fan-out de fins a 60 round-trips a cada càrrega). Aquesta
-- funció fa l'agregació amb un sol GROUP BY a la base de dades → una sola crida,
-- index-backed (page_views_site_created_idx). El codi té un fallback al
-- comportament antic si la funció encara no existeix (42883 / PGRST202), així que
-- res es trenca abans d'executar aquesta migració.
--
-- Sense SECURITY DEFINER: s'invoca SEMPRE amb el service-role (createAdminClient)
-- des de codi de servidor ja verificat, com la resta de lectures d'analítica.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.site_view_counts(
  p_site_ids UUID[],
  p_since    TIMESTAMPTZ
)
RETURNS TABLE (site_id UUID, views BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT pv.site_id, COUNT(*)::BIGINT AS views
  FROM public.page_views pv
  WHERE pv.site_id = ANY(p_site_ids)
    AND pv.created_at >= p_since
  GROUP BY pv.site_id
$$;

NOTIFY pgrst, 'reload schema';
