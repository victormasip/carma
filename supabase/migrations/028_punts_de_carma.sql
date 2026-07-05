-- =============================================================================
-- MIGRACIÓ 028: Punts de Carma — economia de crèdits unificada i gamificada
-- Executar al Supabase SQL Editor. Additiva i idempotent.
-- =============================================================================
-- Disseny aprovat: docs/plans/2026-07-05-punts-de-carma.md
--
--   · UNA cartera per usuari (karma_wallets) + llibre major auditable
--     (karma_ledger, amb balance_after i clau de dedupe).
--   · ATOMICITAT: tota mutació passa per RPCs SECURITY DEFINER que bloquegen la
--     fila de la cartera (SELECT … FOR UPDATE). Feines paral·leles del webhook
--     de WhatsApp, torns de consola i reclamacions de reptes es serialitzen per
--     usuari — el doble descompte és impossible.
--   · IDEMPOTÈNCIA: dedupe_key únic per usuari (job:<id>:draft, reward:<clau>,
--     clone:<user>:<dia>…) fa que els reintents at-least-once cobrin UN sol cop.
--   · RENOVACIÓ MENSUAL mandrosa (lazy): al primer toc de cartera d'un mes nou,
--     balance = GREATEST(balance, assignació del pla). Cap cron: passa dins la
--     mateixa transacció bloquejada que l'spend/lectura, no pot fer race.
--     Efecte producte: l'assignació es renova el dia 1 i no s'acumula; els punts
--     de regal (reptes) es gasten primer i sobreviuen mesos mentre no es gastin.
--   · SUPERADMIN: punts infinits — les RPCs retornen ok sense tocar cap cartera
--     (i el helper d'aplicació ja curtcircuita abans de cridar-les).
--   · SEGURETAT: spend/earn/refund només executables pel service_role;
--     karma_balance és cridable per un usuari autenticat però es força a
--     auth.uid(). RLS: cada usuari llegeix NOMÉS la seva cartera/moviments.
-- =============================================================================

-- ─── 0. El pla comercial viu al perfil (user-level, com el rol) ───────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check
      CHECK (plan IN ('free', 'premium', 'gold', 'agency'));
  END IF;
END;
$$;

-- ─── 1. karma_wallets — una fila per usuari ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.karma_wallets (
  user_id       UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance       INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  period_start  DATE NOT NULL DEFAULT (date_trunc('month', now()))::date,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS karma_wallets_set_updated_at ON public.karma_wallets;
CREATE TRIGGER karma_wallets_set_updated_at
  BEFORE UPDATE ON public.karma_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. karma_ledger — tot moviment queda escrit (auditoria + dedupe) ─────────
CREATE TABLE IF NOT EXISTS public.karma_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta          INTEGER NOT NULL,              -- negatiu = despesa, positiu = ingrés
  balance_after  INTEGER,                       -- snapshot per auditoria ràpida
  kind           TEXT NOT NULL CHECK (kind IN ('spend', 'earn', 'refund', 'refresh', 'adjust')),
  action         TEXT NOT NULL,                 -- article_draft | voice_note | reward:<clau> | …
  ref            TEXT,                          -- id de job/post/site per a traçabilitat i refunds
  dedupe_key     TEXT,                          -- idempotència (única per usuari quan no és NULL)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS karma_ledger_dedupe_uidx
  ON public.karma_ledger (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS karma_ledger_user_created_idx
  ON public.karma_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS karma_ledger_ref_idx
  ON public.karma_ledger (ref)
  WHERE ref IS NOT NULL;

-- ─── 3. Assignació mensual per pla ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.karma_allocation(p_plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_plan
    WHEN 'premium' THEN 400
    WHEN 'gold'    THEN 800
    WHEN 'agency'  THEN 2500
    ELSE 100                      -- 'free' i qualsevol valor desconegut
  END;
$$;

-- ─── 4. Toc de cartera: crea si falta + renovació mensual, SEMPRE amb lock ────
-- Retorna la fila bloquejada (FOR UPDATE) perquè el cridador operi en sèrie.
-- NOMÉS per a ús intern de les RPCs d'aquí sota (mateixa transacció).
CREATE OR REPLACE FUNCTION public.karma_touch_wallet(p_user UUID)
RETURNS public.karma_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet     public.karma_wallets;
  v_plan       TEXT;
  v_alloc      INTEGER;
  v_month      DATE := (date_trunc('month', now()))::date;
  v_new_bal    INTEGER;
BEGIN
  SELECT plan INTO v_plan FROM public.profiles WHERE id = p_user;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'karma: perfil % inexistent', p_user;
  END IF;
  v_alloc := public.karma_allocation(v_plan);

  -- Crear la cartera si no existeix (amb l'assignació completa del mes en curs).
  INSERT INTO public.karma_wallets (user_id, balance, period_start)
  VALUES (p_user, v_alloc, v_month)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock: serialitza qualsevol moviment d'aquest usuari fins al COMMIT.
  SELECT * INTO v_wallet FROM public.karma_wallets WHERE user_id = p_user FOR UPDATE;

  -- Renovació mensual mandrosa: no s'acumula; els punts de regal sobreviuen
  -- mentre el saldo superi l'assignació (es "gasten primer").
  IF v_wallet.period_start < v_month THEN
    v_new_bal := GREATEST(v_wallet.balance, v_alloc);
    IF v_new_bal <> v_wallet.balance THEN
      INSERT INTO public.karma_ledger (user_id, delta, balance_after, kind, action)
      VALUES (p_user, v_new_bal - v_wallet.balance, v_new_bal, 'refresh', 'monthly_refresh');
    END IF;
    UPDATE public.karma_wallets
      SET balance = v_new_bal, period_start = v_month
      WHERE user_id = p_user
      RETURNING * INTO v_wallet;
  END IF;

  RETURN v_wallet;
END;
$$;

-- ─── 5. karma_spend — descompte atòmic amb dedupe ─────────────────────────────
-- Retorna JSONB:
--   { ok: true,  balance: <int|null>, already: <bool>, superadmin: <bool> }
--   { ok: false, reason: 'insufficient', balance: <int>, needed: <int> }
CREATE OR REPLACE FUNCTION public.karma_spend(
  p_user   UUID,
  p_cost   INTEGER,
  p_action TEXT,
  p_ref    TEXT DEFAULT NULL,
  p_dedupe TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.karma_wallets;
  v_bal    INTEGER;
BEGIN
  -- Superadmin: punts infinits, cap descompte, cap cartera.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role = 'superadmin') THEN
    RETURN jsonb_build_object('ok', true, 'balance', NULL, 'superadmin', true);
  END IF;

  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'balance', NULL);
  END IF;

  v_wallet := public.karma_touch_wallet(p_user);

  -- Idempotència: el lock de sobre serialitza; comprovar-existeix és segur.
  IF p_dedupe IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.karma_ledger WHERE user_id = p_user AND dedupe_key = p_dedupe
  ) THEN
    RETURN jsonb_build_object('ok', true, 'balance', v_wallet.balance, 'already', true);
  END IF;

  IF v_wallet.balance < p_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient',
                              'balance', v_wallet.balance, 'needed', p_cost);
  END IF;

  v_bal := v_wallet.balance - p_cost;
  UPDATE public.karma_wallets SET balance = v_bal WHERE user_id = p_user;
  INSERT INTO public.karma_ledger (user_id, delta, balance_after, kind, action, ref, dedupe_key)
  VALUES (p_user, -p_cost, v_bal, 'spend', p_action, p_ref, p_dedupe);

  RETURN jsonb_build_object('ok', true, 'balance', v_bal);
END;
$$;

-- ─── 6. karma_earn — ingrés (reptes, regals) idempotent ───────────────────────
--   { ok: true, balance: <int|null>, already: <bool>, superadmin: <bool> }
CREATE OR REPLACE FUNCTION public.karma_earn(
  p_user   UUID,
  p_amount INTEGER,
  p_action TEXT,
  p_ref    TEXT DEFAULT NULL,
  p_dedupe TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.karma_wallets;
  v_bal    INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role = 'superadmin') THEN
    RETURN jsonb_build_object('ok', true, 'balance', NULL, 'superadmin', true);
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'balance', NULL);
  END IF;

  v_wallet := public.karma_touch_wallet(p_user);

  IF p_dedupe IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.karma_ledger WHERE user_id = p_user AND dedupe_key = p_dedupe
  ) THEN
    RETURN jsonb_build_object('ok', true, 'balance', v_wallet.balance, 'already', true);
  END IF;

  v_bal := v_wallet.balance + p_amount;
  UPDATE public.karma_wallets SET balance = v_bal WHERE user_id = p_user;
  INSERT INTO public.karma_ledger (user_id, delta, balance_after, kind, action, ref, dedupe_key)
  VALUES (p_user, p_amount, v_bal, 'earn', p_action, p_ref, p_dedupe);

  RETURN jsonb_build_object('ok', true, 'balance', v_bal);
END;
$$;

-- ─── 7. karma_refund — retorn (feina fallida) idempotent ──────────────────────
-- Igual que earn però amb kind='refund' — separat perquè el llibre major
-- distingeixi regals d'indemnitzacions.
CREATE OR REPLACE FUNCTION public.karma_refund(
  p_user   UUID,
  p_amount INTEGER,
  p_action TEXT,
  p_ref    TEXT DEFAULT NULL,
  p_dedupe TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.karma_wallets;
  v_bal    INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role = 'superadmin') THEN
    RETURN jsonb_build_object('ok', true, 'balance', NULL, 'superadmin', true);
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'balance', NULL);
  END IF;

  v_wallet := public.karma_touch_wallet(p_user);

  IF p_dedupe IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.karma_ledger WHERE user_id = p_user AND dedupe_key = p_dedupe
  ) THEN
    RETURN jsonb_build_object('ok', true, 'balance', v_wallet.balance, 'already', true);
  END IF;

  v_bal := v_wallet.balance + p_amount;
  UPDATE public.karma_wallets SET balance = v_bal WHERE user_id = p_user;
  INSERT INTO public.karma_ledger (user_id, delta, balance_after, kind, action, ref, dedupe_key)
  VALUES (p_user, p_amount, v_bal, 'refund', p_action, p_ref, p_dedupe);

  RETURN jsonb_build_object('ok', true, 'balance', v_bal);
END;
$$;

-- ─── 8. karma_balance — lectura (amb renovació mandrosa) ──────────────────────
-- Cridable per un usuari autenticat (es força a auth.uid(): mai pot llegir el
-- saldo d'un altre) i pel service_role (que passa p_user explícit).
--   { balance: <int|null>, plan: <text>, allocation: <int>, superadmin: <bool> }
CREATE OR REPLACE FUNCTION public.karma_balance(p_user UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := COALESCE(auth.uid(), p_user);
  v_plan   TEXT;
  v_role   TEXT;
  v_wallet public.karma_wallets;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'karma_balance: cap usuari';
  END IF;

  SELECT plan, role INTO v_plan, v_role FROM public.profiles WHERE id = v_user;
  IF v_role = 'superadmin' THEN
    RETURN jsonb_build_object('ok', true, 'balance', NULL, 'plan', COALESCE(v_plan, 'free'),
                              'allocation', NULL, 'superadmin', true);
  END IF;

  v_wallet := public.karma_touch_wallet(v_user);
  RETURN jsonb_build_object('ok', true, 'balance', v_wallet.balance,
                            'plan', COALESCE(v_plan, 'free'),
                            'allocation', public.karma_allocation(v_plan),
                            'superadmin', false);
END;
$$;

-- ─── 9. Permisos d'execució ───────────────────────────────────────────────────
-- Les mutacions NOMÉS des del servidor (service_role). karma_balance també per a
-- usuaris autenticats (auto-acotada a auth.uid()).
REVOKE ALL ON FUNCTION public.karma_touch_wallet(UUID)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.karma_spend(UUID, INTEGER, TEXT, TEXT, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.karma_earn(UUID, INTEGER, TEXT, TEXT, TEXT)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.karma_refund(UUID, INTEGER, TEXT, TEXT, TEXT)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.karma_balance(UUID)                            FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.karma_spend(UUID, INTEGER, TEXT, TEXT, TEXT)  TO service_role;
GRANT EXECUTE ON FUNCTION public.karma_earn(UUID, INTEGER, TEXT, TEXT, TEXT)   TO service_role;
GRANT EXECUTE ON FUNCTION public.karma_refund(UUID, INTEGER, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.karma_balance(UUID)                           TO authenticated, service_role;

-- ─── 10. RLS — lectura pròpia; escriptura només via RPC/service-role ──────────
ALTER TABLE public.karma_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karma_ledger  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "karma_wallets_select_own"        ON public.karma_wallets;
DROP POLICY IF EXISTS "karma_wallets_select_superadmin" ON public.karma_wallets;
CREATE POLICY "karma_wallets_select_own" ON public.karma_wallets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "karma_wallets_select_superadmin" ON public.karma_wallets
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS "karma_ledger_select_own"        ON public.karma_ledger;
DROP POLICY IF EXISTS "karma_ledger_select_superadmin" ON public.karma_ledger;
CREATE POLICY "karma_ledger_select_own" ON public.karma_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "karma_ledger_select_superadmin" ON public.karma_ledger
  FOR SELECT TO authenticated USING (public.is_superadmin());

NOTIFY pgrst, 'reload schema';
