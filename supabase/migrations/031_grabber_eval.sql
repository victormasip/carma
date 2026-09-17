-- =============================================================================
-- MIGRACIÓ 031: Grabber Eval — revisions humanes del benchmark Barcelona-100
-- =============================================================================
-- El Grabber Eval (tests/grabber-eval.mjs + /admin/grabber-eval) avalua el motor
-- d'extracció contra un dataset fix de 100 webs reals de Barcelona
-- (src/lib/grabber-lab/evalDataset.ts). Aquesta taula guarda la CAPA HUMANA:
-- per cada cas, el fundador posa punts (0–10), marca què està bé per regió
-- (capçalera / contingut / peu / estils) i escriu observacions.
--
-- El sistema de recompensa: les revisions + els region_hashes del moment de la
-- revisió formen el dataset d'etiquetes. Quan el motor canvia, els hashes
-- canvien → la UI marca la revisió com a OBSOLETA i el cas torna a la cua de
-- revisió. Així, cada iteració del motor es puntua contra les etiquetes humanes
-- sense poder "aprovar-se" a si mateixa en silenci.
--
-- Model d'accés idèntic a la migració 017: RLS activat SENSE polítiques — només
-- el service-role hi escriu/llegeix, i les server actions verifiquen superadmin.
-- Executar al Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.grabber_eval_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Clau estable del cas al dataset (evalDataset.ts) — una revisió viva per cas.
  case_id      TEXT NOT NULL UNIQUE,
  url          TEXT NOT NULL,

  -- ── Recompensa humana ──────────────────────────────────────────────────────
  points       SMALLINT NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 10),
  header_ok    BOOLEAN,
  content_ok   BOOLEAN,
  footer_ok    BOOLEAN,
  styles_ok    BOOLEAN,
  observations TEXT,

  -- ── Snapshot del motor en el moment de revisar ─────────────────────────────
  -- region_hashes = { top, bottom, head, bodyAttrs } (sha1 curts). Si un run
  -- posterior té hashes diferents, la revisió és OBSOLETA (el motor ha canviat
  -- la sortida del cas) i cal re-revisar.
  region_hashes JSONB,
  engine_hash   TEXT,
  auto_score    SMALLINT,

  reviewed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grabber_eval_reviews_updated_idx
  ON public.grabber_eval_reviews (updated_at DESC);

ALTER TABLE public.grabber_eval_reviews ENABLE ROW LEVEL SECURITY;
-- Cap política: accés exclusiu via service-role (server actions superadmin).
