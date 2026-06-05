-- =============================================================================
-- MIGRACIÓ 015: Analytics — vistes de pàgina (page_views)
-- =============================================================================
-- Registre d'esdeveniments de visita per al render públic (/render/...) i els
-- embeds. Una fila per visita real del navegador (s'envia via un beacon JS des de
-- la pàgina renderitzada, així es compta encara que el CDN serveixi l'HTML
-- des de la memòria cau). El recompte de visitants únics fa servir un hash diari
-- (IP+UA+dia+salt) que NO permet identificar la persona ni correlacionar dies.
--
-- Lectura: sempre des del servidor amb el service-role (createAdminClient) després
-- de validar l'accés al site — igual que posts/site_themes. Les polítiques RLS de
-- sota són defensa addicional per si algun dia es llegeix amb el client autenticat.
-- Inserció: NOMÉS via service-role (l'endpoint /api/track), mai amb RLS.
-- Executar al Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.page_views (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id       UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  post_id       UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL DEFAULT 'article',   -- 'article' | 'listing'
  path          TEXT NOT NULL DEFAULT '',
  locale        TEXT,
  referrer_host TEXT,
  visitor_hash  TEXT,                              -- hash diari per a visitants únics
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consultes típiques: per site dins d'un rang de dates; per post; únics per site.
CREATE INDEX IF NOT EXISTS page_views_site_created_idx ON public.page_views (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_post_created_idx ON public.page_views (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_site_visitor_idx ON public.page_views (site_id, visitor_hash);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_views_select_superadmin" ON public.page_views;
DROP POLICY IF EXISTS "page_views_select_member"     ON public.page_views;

CREATE POLICY "page_views_select_superadmin" ON public.page_views
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "page_views_select_member" ON public.page_views
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.site_users
      WHERE site_users.site_id = page_views.site_id
        AND site_users.user_id = auth.uid()
    )
  );

-- (Cap política d'INSERT per a `authenticated`: les escriptures van pel service-role.)

NOTIFY pgrst, 'reload schema';
