-- =============================================================================
-- MIGRACIÓ 034: Preus v2 — les assignacions mensuals de punts per pla
-- Executar al Supabase SQL Editor. Additiva, idempotent, sense pèrdua de dades.
-- =============================================================================
-- Disseny aprovat: docs/plans/2026-09-16-modules-and-pricing-strategy.md
--
-- PER QUÈ CANVIA
-- ──────────────
-- L'escala antiga (free 100 · premium 400 · gold 800 · agency 2500) tenia la
-- corba de valor INVERTIDA exactament on volem que la gent pugi: Or costava 2,5
-- vegades més que Premium i donava només el doble de punts. Una escala de plans
-- ha d'abaratir-se per unitat a mesura que puges, o la part de dalt no es ven.
--
--   Pla        Preu     Punts    €/100 punts
--   Gratis     0 €        100    —
--   Premium   19 €        500    3,80 €
--   Or        49 €      1.800    2,72 €
--   Agència  149 €      6.500    2,29 €
--
-- El cost real no hi té res a veure: un article il·lustrat val €0,020 d'API, i
-- la comissió de Stripe (~0,80 € sobre 19 €) costa deu vegades la inferència.
-- El sostre de punts existeix per frenar abús i per fer llegible l'escala.
--
-- EFECTE SOBRE CLIENTS ACTUALS
-- ────────────────────────────
-- Tothom hi guanya: Premium 400 → 500, Or 800 → 1.800, Agència 2.500 → 6.500.
-- Ningú perd res. La renovació mandrosa de karma_touch_wallet fa
-- `balance = GREATEST(balance, assignació)`, així que el saldo NOMÉS pot pujar:
-- un usuari que ja tingui més punts que la nova assignació els conserva.
--
-- IMPORTANT: el mirall d'aplicació és KARMA_ALLOCATIONS a src/lib/karma/config.ts
-- i ja està actualitzat. Si tornes a tocar un número, toca'l als dos llocs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.karma_allocation(p_plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_plan
    WHEN 'premium' THEN 500
    WHEN 'gold'    THEN 1800
    WHEN 'agency'  THEN 6500
    ELSE 100                      -- 'free' i qualsevol valor desconegut
  END;
$$;

-- ─── Efecte immediat, sense esperar al dia 1 ─────────────────────────────────
-- Sense això, un client de pagament no veuria els punts nous fins al mes vinent,
-- perquè la renovació és mandrosa (només passa al primer toc d'un mes nou). Puja
-- el saldo de tothom qui estigui per sota de la seva nova assignació, i deixa
-- intacte qui estigui per sobre (punts guanyats amb reptes, per exemple).
UPDATE public.karma_wallets w
SET    balance = public.karma_allocation(p.plan)
FROM   public.profiles p
WHERE  p.id = w.user_id
  AND  w.balance < public.karma_allocation(p.plan);

-- ─── Traça al llibre major ───────────────────────────────────────────────────
-- Tot moviment de saldo ha de quedar escrit, incloent-hi aquest. La clau de
-- dedupe fa que re-executar la migració no torni a escriure la línia.
INSERT INTO public.karma_ledger (user_id, delta, balance_after, kind, action, dedupe_key)
SELECT w.user_id,
       0,
       w.balance,
       'adjust',
       'pricing_v2',
       'migration:034:pricing_v2'
FROM   public.karma_wallets w
ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
