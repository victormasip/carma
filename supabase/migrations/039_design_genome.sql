-- 039 — EL GENOMA DE DISSENY TÉ CASA (W6)
--
-- Tres taules, i cap altera res del que ja existeix:
--
--   1. site_design_genomes    — el disseny d'un lloc com a DADA, no com a CSS. Cada
--      disseny és una fila (l'historial són files; desfer és canviar is_active), amb
--      l'evidència i el brief de què va sortir. El CSS compilat és una memòria cau,
--      mai la veritat: es recalcula quan canvia el genoma o compiler_version.
--   2. design_direction_cache — la resposta de l'Art Director (W4) per domini. Dos
--      visitants anònims que escriuen el mateix domini paguen UNA crida al model.
--   3. design_chrome_cache    — la capçalera i el peu capturats per domini, perquè la
--      vista prèvia de la Porta pugui mostrar-los sense tornar a llegir la web.
--
-- Idempotent (IF NOT EXISTS a tot arreu). El codi és segur SENSE aquesta migració:
-- si les taules no hi són, el producte es comporta exactament com abans (42P01).

-- ─── 1. Els genomes d'un lloc ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_design_genomes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  genome           JSONB NOT NULL,
  -- Hash de contingut (`g_` + 16 hex, sha-256 del genoma): el mateix genoma té
  -- sempre el mateix id, i és el que la Porta porta a través del registre.
  genome_id        TEXT NOT NULL,
  genome_version   INT  NOT NULL DEFAULT 1,
  source           TEXT NOT NULL CHECK (source IN ('derived', 'directed', 'preset', 'edited', 'nudged')),
  variant          TEXT CHECK (variant IN ('faithful', 'elevated', 'reimagined')),
  -- De què va sortir: l'evidència mesurada i el brief de la síntesi.
  evidence         JSONB,
  brief            JSONB,
  parent_id        UUID REFERENCES public.site_design_genomes(id) ON DELETE SET NULL,
  is_active        BOOLEAN NOT NULL DEFAULT false,
  -- Derivat, en memòria cau, mai la font de veritat:
  compiled_css     TEXT,
  compiled_at      TIMESTAMPTZ,
  compiler_version TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un sol disseny actiu per lloc.
CREATE UNIQUE INDEX IF NOT EXISTS site_design_genomes_one_active
  ON public.site_design_genomes (site_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS site_design_genomes_site_idx
  ON public.site_design_genomes (site_id, created_at DESC);

ALTER TABLE public.site_design_genomes ENABLE ROW LEVEL SECURITY;

-- Lectura: els membres del lloc (mateix model que site_users). L'escriptura passa
-- sempre pel servidor amb la clau de servei, després de comprovar l'accés — com
-- saveTheme — i per això no hi ha política d'escriptura per a l'usuari.
DROP POLICY IF EXISTS site_design_genomes_read ON public.site_design_genomes;
CREATE POLICY site_design_genomes_read ON public.site_design_genomes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.site_users su
      WHERE su.site_id = site_design_genomes.site_id
        AND su.user_id = auth.uid()
    )
  );

-- ─── 2. La memòria de l'Art Director ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.design_direction_cache (
  domain       TEXT NOT NULL,
  -- Versió del director + model + esquema + empremta de l'evidència: si la web
  -- canvia de colors o de lletra, l'empremta canvia i la resposta vella no serveix.
  cache_key    TEXT NOT NULL,
  model        TEXT NOT NULL,
  -- [{ variant, genome, rationale }] — el que el model va decidir, validat.
  variants     JSONB NOT NULL,
  cost_usd     NUMERIC(10, 6),
  hits         INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_hit_at  TIMESTAMPTZ,
  PRIMARY KEY (domain, cache_key)
);
CREATE INDEX IF NOT EXISTS design_direction_cache_created_idx
  ON public.design_direction_cache (created_at);

-- Només el servidor: cap política vol dir cap accés per a anon/authenticated.
ALTER TABLE public.design_direction_cache ENABLE ROW LEVEL SECURITY;

-- ─── 3. La capçalera capturada, per a la vista prèvia ─────────────────────────

CREATE TABLE IF NOT EXISTS public.design_chrome_cache (
  domain       TEXT PRIMARY KEY,
  -- { header, footer, bodyAttrs, css, fontFaceCss, fontLinks, nav } — ja netejat:
  -- sense <script>, sense gestors on*, sense javascript:.
  capture      JSONB NOT NULL,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.design_chrome_cache ENABLE ROW LEVEL SECURITY;
