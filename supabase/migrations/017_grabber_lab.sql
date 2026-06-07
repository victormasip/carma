-- =============================================================================
-- MIGRACIÓ 017: Theme Grabber Lab — dataset de "Source of Truth"
-- =============================================================================
-- Eina interna (NOMÉS superadmin) per construir un dataset anotat amb què, més
-- endavant, dissenyarem el motor d'extracció definitiu. Per cada URL de prova
-- desem TRES coses:
--   1) Meta auto-detectada (framework / hosting / locale / nom / títol de secció).
--   2) La SORTIDA del sistema actual (raw head/header/footer, body attrs, tokens,
--      blog_signature) — la "fallada" tal com el grabber la produeix avui.
--   3) La VERITAT DE TERRA de l'operador: header/footer corregits a mà, el
--      document HTML "perfecte" muntat manualment, i notes de diagnòstic.
--
-- `capture_raw` desa el payload sencer de la captura (AnalyzeResult) per no perdre
-- mai cap senyal que el motor futur pugui necessitar.
-- Executar al Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.grabber_lab_samples (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Entrada de la prova
  target_url  TEXT NOT NULL,
  blog_url    TEXT,
  base_url    TEXT,

  -- ── 1. Meta auto-detectada ────────────────────────────────────────────────
  detected_framework         TEXT,
  detected_framework_version TEXT,
  detected_hosting           TEXT,
  detection_confidence       TEXT,   -- 'high' | 'medium' | 'low'
  detected_locale            TEXT,
  detected_site_name         TEXT,
  detected_section_title     TEXT,

  -- ── 2. Sortida del sistema (snapshot read-only del grabber) ───────────────
  system_raw_head         TEXT,
  system_raw_header       TEXT,
  system_raw_footer       TEXT,
  system_body_attrs       TEXT,
  system_design_tokens    JSONB,
  system_blog_signature   JSONB,
  system_external_styles  TEXT[] DEFAULT '{}',
  system_external_scripts TEXT[] DEFAULT '{}',
  system_font_links       TEXT[] DEFAULT '{}',
  -- Payload sencer de la captura (AnalyzeResult), per no perdre cap senyal.
  capture_raw             JSONB,

  -- ── 3. Veritat de terra (correcció manual de l'operador) ──────────────────
  truth_raw_header  TEXT,
  truth_raw_footer  TEXT,
  truth_body_attrs  TEXT,
  -- El document HTML COMPLET i 100% funcional muntat a mà. La veritat absoluta
  -- que el motor futur (IA) aprendrà a reproduir.
  perfect_html      TEXT,

  -- ── Diagnòstic + curació del dataset ──────────────────────────────────────
  diagnostic_notes  TEXT,
  failure_tags      TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT   NOT NULL DEFAULT 'draft',  -- 'draft' | 'annotated' | 'verified'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grabber_lab_samples_created_idx
  ON public.grabber_lab_samples (created_at DESC);
CREATE INDEX IF NOT EXISTS grabber_lab_samples_framework_idx
  ON public.grabber_lab_samples (detected_framework);

-- Reutilitza el trigger set_updated_at() creat a la migració 001.
DROP TRIGGER IF EXISTS grabber_lab_samples_set_updated_at ON public.grabber_lab_samples;
CREATE TRIGGER grabber_lab_samples_set_updated_at
  BEFORE UPDATE ON public.grabber_lab_samples
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- RLS: estrictament NOMÉS superadmin (lectura I escriptura). Cap altre rol pot
-- veure ni tocar el dataset. La validació també es fa al servidor (assertSuperAdmin
-- a les server actions / route handlers), però RLS és la defensa de base.
-- =============================================================================
ALTER TABLE public.grabber_lab_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grabber_lab_all_superadmin" ON public.grabber_lab_samples;
CREATE POLICY "grabber_lab_all_superadmin" ON public.grabber_lab_samples
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Recarregar el schema cache de PostgREST perquè Supabase vegi la nova taula.
NOTIFY pgrst, 'reload schema';
