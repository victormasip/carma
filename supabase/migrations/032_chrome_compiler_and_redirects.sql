-- =============================================================================
-- MIGRACIÓ 032: Chrome Compiler + redireccions de slug
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- Pla mestre Super MVP (docs/plans/2026-09-16-super-mvp-master-plan.md), Fase 4.
--
-- (A) CHROME COMPILER
--     Fins ara el render injectava `extracted_head` sencer a CADA pàgina del blog:
--     els fulls d'estil reals del client (cross-origin, render-blocking) I els seus
--     scripts. Un clon de WordPress arrossegava jQuery + el CSS del page-builder +
--     10-20 fulls de plugins a cada article. Aquesta era la lentitud real.
--
--     Ara la compilació es fa UN COP, a la captura: es fa match dels selectors
--     contra el DOM capçalera/peu capturat i s'emet UN sol blob de CSS crític.
--
--       · compiled_chrome_css     el blob compilat (NULL = encara no compilat →
--                                 el render fa fallback a la injecció crua, així
--                                 cap lloc existent es trenca abans de recapturar)
--       · chrome_scripts_enabled  escapatòria per llocs el menú dels quals depèn
--                                 de JS. Per defecte FALSE (els scripts cauen).
--       · chrome_compile_stats    regles dins/fora, bytes estalviats, selectors
--                                 no avaluables — alimenta el gate de fidelitat.
--
-- (B) POST_REDIRECTS
--     Canviar l'slug d'un article publicat feia 404 silenciós a tots els enllaços
--     entrants. WordPress ho resol; nosaltres no. Cada canvi d'slug deixa ara un
--     rastre i el render respon 308 cap al canònic.
--
-- Tot el codi és 42703/42P01-safe: sense aquesta migració el render fa servir el
-- camí antic (injecció crua) i les redireccions simplement no existeixen.
-- =============================================================================

-- ── (A) Chrome Compiler ──────────────────────────────────────────────────────
ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS compiled_chrome_css    TEXT,
  ADD COLUMN IF NOT EXISTS chrome_scripts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS chrome_compile_stats   JSONB;

COMMENT ON COLUMN public.site_themes.compiled_chrome_css IS
  'CSS crític compilat del header/footer clonat. NULL = fallback a extracted_head cru.';
COMMENT ON COLUMN public.site_themes.chrome_scripts_enabled IS
  'TRUE = reinjecta els scripts del lloc clonat (diferits). Només per menús que depenen de JS.';

-- ── (B) Redireccions d'slug ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_redirects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  -- L'slug ANTIC (el que ja està indexat i enllaçat des de fora).
  from_slug   TEXT NOT NULL,
  -- L'article destí. Si s'esborra l'article, la redirecció se'n va amb ell.
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un slug antic només pot apuntar a un lloc dins d'un mateix site.
  CONSTRAINT post_redirects_site_from_slug_key UNIQUE (site_id, from_slug)
);

-- El render resol per (site_id, from_slug) a cada 404 d'article: ha de ser un
-- índex, no un scan.
CREATE INDEX IF NOT EXISTS post_redirects_lookup_idx
  ON public.post_redirects (site_id, from_slug);
CREATE INDEX IF NOT EXISTS post_redirects_post_idx
  ON public.post_redirects (post_id);

ALTER TABLE public.post_redirects ENABLE ROW LEVEL SECURITY;

-- Lectura pública: el render (service role) i qualsevol visitant del blog han de
-- poder resoldre una redirecció. No hi ha res sensible — és un mapa d'URLs.
DROP POLICY IF EXISTS post_redirects_read ON public.post_redirects;
CREATE POLICY post_redirects_read ON public.post_redirects
  FOR SELECT USING (TRUE);

-- Escriptura: només el propietari del lloc (mateix model que site_users).
DROP POLICY IF EXISTS post_redirects_write ON public.post_redirects;
CREATE POLICY post_redirects_write ON public.post_redirects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.site_users su
      WHERE su.site_id = post_redirects.site_id
        AND su.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.site_users su
      WHERE su.site_id = post_redirects.site_id
        AND su.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
