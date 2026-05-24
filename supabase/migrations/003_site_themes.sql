-- =============================================================================
-- MIGRACIÓ 003: Sistema de tema visual per site (replicació de look & feel)
-- =============================================================================
-- Permet al superadmin pastar HTML/CSS de referència d'una web custom per
-- generar pàgines de render que mantinguin la identitat visual del client.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.site_themes (
  site_id           UUID PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,

  -- 3 URLs de referència (una per cada tipus de pàgina)
  reference_url_home     TEXT,
  reference_url_listing  TEXT,
  reference_url_article  TEXT,
  raw_css                TEXT,

  -- Parts extretes/processades (típicament de la pàgina home, header/footer són globals)
  extracted_head    TEXT,           -- meta tags, fonts, links a CSS originals
  extracted_header  TEXT,           -- <header>/<nav> HTML
  extracted_footer  TEXT,           -- <footer> HTML
  extracted_scripts TEXT,                 -- HTML amb <script> del client (inline + externs)
  external_styles   TEXT[] DEFAULT '{}',  -- URLs absolutes de <link rel="stylesheet">
  external_scripts  TEXT[] DEFAULT '{}',  -- URLs absolutes dels <script src="...">
  font_links        TEXT[] DEFAULT '{}',  -- URLs de Google Fonts, etc.

  -- Mapping de classes detectades/configurades pel superadmin
  class_article_wrapper  TEXT,      -- ex: ".post" o "article.entry"
  class_article_title    TEXT,      -- ex: ".post-title"
  class_article_content  TEXT,      -- ex: ".post-content"
  class_article_meta     TEXT,      -- ex: ".post-meta" (data, autor)
  class_card_grid        TEXT,      -- ex: ".news-grid"
  class_card             TEXT,      -- ex: ".news-card"
  class_main_wrapper     TEXT,      -- ex: ".container" o "main.content"

  -- Detecció automàtica
  detected_framework     TEXT,      -- wordpress, nextjs, astro, vue, html, etc.
  detected_hosting       TEXT,      -- vercel, netlify, cloudflare, etc.

  -- Configuració addicional
  base_url               TEXT,      -- per resoldre URLs relatives en HTML extret
  is_enabled             BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger per actualitzar updated_at
DROP TRIGGER IF EXISTS site_themes_set_updated_at ON public.site_themes;
CREATE TRIGGER site_themes_set_updated_at
  BEFORE UPDATE ON public.site_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- RLS: només superadmin pot escriure. Clients poden llegir el seu propi tema.
-- =============================================================================
ALTER TABLE public.site_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_themes_all_superadmin" ON public.site_themes;
CREATE POLICY "site_themes_all_superadmin" ON public.site_themes
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "site_themes_select_assigned" ON public.site_themes;
CREATE POLICY "site_themes_select_assigned" ON public.site_themes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.site_users
      WHERE site_users.site_id = site_themes.site_id
        AND site_users.user_id = auth.uid()
    )
  );
