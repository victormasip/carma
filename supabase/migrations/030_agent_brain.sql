-- =============================================================================
-- MIGRACIÓ 030: El "Cervell Viu" de l'agent de WhatsApp (P0/P1 del pla
-- docs/plans/2026-07-07-ultimate-whatsapp-agent-architecture.md).
-- Executar al Supabase SQL Editor. TOTA additiva i idempotent — cap canvi
-- destructiu a taules existents.
-- =============================================================================
-- Requereix 028 (Punts de Carma) i 029 (posts_counts_by_site) executades. El codi
-- degrada de forma segura (42P01/42703/42883-safe) mentre aquesta migració no s'ha
-- executat, així que és desplegable sense downtime.
--
-- Materialitza:
--   · profiles.display_name        — E-4: la salutació sap el nom ("Bon dia, Marta!")
--   · wa_identities.memory         — §2.3: preferències duradores del propietari (FIFO 12)
--   · posts.pending_content        — E-11: edició d'un post PUBLICAT en staging (mai en viu)
--   · site_brain_profiles          — §2.2: perfil de marca + SEO generat OFFLINE (no per torn)
--   · theme_snapshots              — §2.5: snapshot abans d'un canvi de tema (undo gratis) [dormant a P1]
--   · claim_next_agent_job()       — §2.7/E-20: reclam de feina SERIALITZAT PER FIL (arregla
--                                    un doble-cobrament LATENT de l'agent actual)
-- =============================================================================

-- ─── 1. profiles.display_name (E-4) ───────────────────────────────────────────
-- Capturat a l'onboarding. La salutació de l'agent degrada amb gràcia si és NULL
-- (sense nom ⇒ sense "Marta,"), mai peta.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ─── 2. wa_identities.memory (§2.3) ───────────────────────────────────────────
-- Instruccions permanents del propietari, com a DADES (mai instruccions que puguin
-- tocar la capa L0). Forma: { facts: [{ text, learned_at, source_msg }] } — màx 12,
-- FIFO, l'expulsió s'anuncia (E-11/C-11). El worker l'escriu de forma determinista.
ALTER TABLE public.wa_identities
  ADD COLUMN IF NOT EXISTS memory JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── 3. posts.pending_content (E-11) ──────────────────────────────────────────
-- Staging d'una revisió d'un post PUBLICAT: la revisió s'escriu aquí (no al
-- `content` en viu); l'aprovació copia pending_content → content IN PLACE (mateixa
-- fila, mateix slug/URL) i el buida. Un post en viu MAI el muta una sortida d'LLM
-- no confirmada. NULL = res en staging (comportament d'avui). [ús ple a P3]
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pending_content JSONB;

-- ─── 4. site_brain_profiles (§2.2) ────────────────────────────────────────────
-- Un perfil per lloc, generat OFFLINE (no a cada torn) per profile.ts. El camí per
-- torn NOMÉS el llegeix — la feina agregada (SEO snapshot) es precalcula aquí.
CREATE TABLE IF NOT EXISTS public.site_brain_profiles (
  site_id            UUID PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  industry           TEXT,            -- "agroturisme rural al Berguedà"
  audience           TEXT,            -- "famílies urbanes que busquen escapades"
  tone               JSONB,           -- { descriptors: [...], register, emoji_policy }
  content_pillars    JSONB,           -- [{ name, keywords[], coverage }]
  seo                JSONB,           -- { focus_keywords_used[], opportunities[], last_published_at }
  writing_rules      JSONB,           -- dos/don'ts destil·lats dels posts existents
  source             TEXT NOT NULL DEFAULT 'auto',   -- 'auto' | 'seed' | 'owner_edited'
  generated_at       TIMESTAMPTZ,
  stale              BOOLEAN NOT NULL DEFAULT false,  -- true en publicar; el cron regenera (debounce)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El cron de refresc busca perfils vells i marcats stale (debounce E-17).
CREATE INDEX IF NOT EXISTS site_brain_profiles_stale_idx
  ON public.site_brain_profiles (stale, generated_at)
  WHERE stale;

-- ─── 5. theme_snapshots (§2.5) ────────────────────────────────────────────────
-- Estat dels design_tokens ABANS d'un canvi de tema via xat → "desfés-ho" gratis i
-- determinista. Es conserven els últims 10 per lloc (el worker els poda). [dormant a
-- P1 — la família H de tema-via-xat és d'un cicle posterior; la DDL additiva no fa mal.]
CREATE TABLE IF NOT EXISTS public.theme_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  design_tokens JSONB NOT NULL,
  reason        TEXT,                -- la petició del propietari, verbatim
  created_by    TEXT NOT NULL DEFAULT 'wa-agent',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS theme_snapshots_site_created_idx
  ON public.theme_snapshots (site_id, created_at DESC);

-- ─── Triggers updated_at (reutilitzen public.set_updated_at() de la migració 001) ─
DROP TRIGGER IF EXISTS site_brain_profiles_set_updated_at ON public.site_brain_profiles;
CREATE TRIGGER site_brain_profiles_set_updated_at
  BEFORE UPDATE ON public.site_brain_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 6. claim_next_agent_job() — reclam SERIALITZAT PER FIL (§2.7 / E-20) ──────
-- ARREGLA UN BUG LATENT DE L'AGENT ACTUAL: claimNextJob (worker.ts) reclamava la
-- feina globalment més antiga; el lease garanteix un worker per FEINA, no per FIL.
-- Dues invocacions after() del webhook drenant alhora podien córrer dues feines del
-- MATEIX fil en paral·lel → doble lectura/escriptura d'agent_state, doble resposta,
-- current_post_id trepitjat i DOBLE COBRAMENT (claus de dedupe diferents → cobren les
-- dues). El pending_action de v2 ho empitjora.
--
-- Solució: una secció crítica de mida microsegon (un advisory lock global) fa que TOTS
-- els reclams se serialitzin; la feina cara (OpenAI) passa DESPRÉS d'aquest retorn,
-- fora de cap lock. Amb els reclams serialitzats, el predicat NOT EXISTS de sota és
-- exacte: mai es reclama una feina d'un fil que ja té una feina viva 'running'.
-- Garantia nova: com a molt UNA feina 'running' per FIL.
CREATE OR REPLACE FUNCTION public.claim_next_agent_job(p_lease_seconds INT DEFAULT 300)
RETURNS SETOF public.generation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Serialitza tots els reclams (secció crítica de sub-mil·lisegon). Es allibera a
  -- final de transacció de la funció, molt abans de qualsevol crida d'LLM.
  PERFORM pg_advisory_xact_lock(hashtext('carma_wa_claim'));

  SELECT j.id INTO v_id
  FROM public.generation_jobs j
  WHERE (j.status = 'queued' OR (j.status = 'running' AND j.lease_until < now()))
    -- Serialització per fil: salta una feina el fil de la qual ja té una feina viva.
    AND NOT EXISTS (
      SELECT 1 FROM public.generation_jobs r
      WHERE r.thread_id = j.thread_id
        AND r.status = 'running'
        AND r.lease_until >= now()
        AND r.id <> j.id
    )
  ORDER BY j.created_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.generation_jobs
     SET status = 'running',
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1
   WHERE id = v_id;

  RETURN QUERY SELECT * FROM public.generation_jobs g WHERE g.id = v_id;
END;
$$;

-- Només el servidor (admin/service-role) la crida: el worker passa per l'admin client.
REVOKE ALL ON FUNCTION public.claim_next_agent_job(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_job(INT) TO service_role;

-- =============================================================================
-- RLS — mirall de la 027: totes les escriptures van pel service-role (cap política
-- d'INSERT/UPDATE); lectura per a superadmin (/admin/agent) + membre del lloc. El
-- service-role sobrepassa RLS; aquestes polítiques són defensa en profunditat.
-- =============================================================================
ALTER TABLE public.site_brain_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_snapshots     ENABLE ROW LEVEL SECURITY;

-- site_brain_profiles: superadmin + membre del lloc.
DROP POLICY IF EXISTS "site_brain_profiles_select_superadmin" ON public.site_brain_profiles;
DROP POLICY IF EXISTS "site_brain_profiles_select_member"      ON public.site_brain_profiles;
CREATE POLICY "site_brain_profiles_select_superadmin" ON public.site_brain_profiles
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "site_brain_profiles_select_member" ON public.site_brain_profiles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.site_users su
      WHERE su.site_id = site_brain_profiles.site_id AND su.user_id = auth.uid()
    )
  );

-- theme_snapshots: superadmin + membre del lloc.
DROP POLICY IF EXISTS "theme_snapshots_select_superadmin" ON public.theme_snapshots;
DROP POLICY IF EXISTS "theme_snapshots_select_member"      ON public.theme_snapshots;
CREATE POLICY "theme_snapshots_select_superadmin" ON public.theme_snapshots
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "theme_snapshots_select_member" ON public.theme_snapshots
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.site_users su
      WHERE su.site_id = theme_snapshots.site_id AND su.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
