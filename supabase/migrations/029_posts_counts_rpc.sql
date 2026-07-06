-- =============================================================================
-- MIGRACIÓ 029: Recompte agrupat d'articles per lloc (RPC) — el dashboard deixa
-- de descarregar TOTES les files de posts només per comptar-les.
-- Executar al Supabase SQL Editor. Additiva i idempotent.
-- =============================================================================
-- Abans: /dashboard feia `select site_id, is_published from posts` (sense cap
-- filtre en el cas superadmin!) i comptava en JavaScript — O(files) de
-- transferència i de parse per una pantalla que només vol dos números per lloc.
-- Ara: un GROUP BY a la BD retorna una fila per lloc. El codi manté el camí
-- antic com a fallback 42883-safe fins que aquesta migració s'executi.

CREATE OR REPLACE FUNCTION public.posts_counts_by_site(p_site_ids UUID[] DEFAULT NULL)
RETURNS TABLE (site_id UUID, total BIGINT, published BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.site_id,
         count(*)::bigint                                   AS total,
         count(*) FILTER (WHERE p.is_published)::bigint     AS published
  FROM public.posts p
  WHERE p_site_ids IS NULL OR p.site_id = ANY (p_site_ids)
  GROUP BY p.site_id;
$$;

-- Només el servidor la crida (el dashboard passa per l'admin client). Cap accés
-- anònim ni d'usuari directe: la funció és SECURITY DEFINER i saltaria RLS.
REVOKE ALL ON FUNCTION public.posts_counts_by_site(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.posts_counts_by_site(UUID[]) TO service_role;

NOTIFY pgrst, 'reload schema';
