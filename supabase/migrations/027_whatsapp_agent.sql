-- =============================================================================
-- MIGRACIÓ 027: Agent de WhatsApp — nota de veu → esborrany → aprovació → publicació
-- Executar al Supabase SQL Editor. Additiu i idempotent — cap canvi a taules existents.
-- =============================================================================
-- Capa de dades per al pipeline de l'agent de WhatsApp (pla aprovat 2026-06-26,
-- docs/plans/2026-06-26-whatsapp-agent-flow.md · Enfoc B/D). Tot l'accés és
-- SERVER-SIDE amb el service-role: el webhook (/api/whatsapp/webhook) i el worker
-- (Netlify Background Function) escriuen; /admin/agent llegeix (superadmin). RLS de
-- sota = defensa addicional; el service-role la sobrepassa.
--
-- Decisions clau que aquesta migració materialitza:
--   · G1 Enfoc B/D: cap auto-publicació; l'aprovació passa per /review amb login.
--   · G2 multi-site amb DETECCIÓ: el telèfon s'enllaça a un PROPIETARI (no a un
--     site). Els sites candidats = els site_users del propietari, acotables per
--     wa_identity_sites. El worker decideix: 1 site → ruta automàtica; >1 → l'agent
--     pregunta "per a quin client?". El site resolt es desa a wa_threads.site_id.
--   · G3 captura del resultat: wa_article_outcomes desa transcript→publicat→OUTCOME
--     (comprovació a 60 dies) des del primer dia, perquè el motor de recerca futur
--     sigui "canviar una etapa", no reconstruir.
--   · Idempotència: wa_messages.wa_message_id UNIQUE (WhatsApp entrega at-least-once).
--   · Cost: wa_threads.cost_cents + límits es comproven ABANS de cridar l'LLM.
--   · Enllaç d'aprovació: review_tokens desa NOMÉS el sha256 del token, mai el cru.
-- =============================================================================

-- ─── 1. wa_identities — un telèfon de WhatsApp enllaçat a un PROPIETARI Carma ──
-- El telèfon pertany a un usuari (profiles), no a un site. Verificació tipus OTP
-- abans de passar a 'active'. Estats: pending → active → (blocked).
CREATE TABLE IF NOT EXISTS public.wa_identities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164         TEXT NOT NULL UNIQUE,                 -- +34..., un número = un propietari
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending',      -- 'pending' | 'active' | 'blocked'
  verify_code        TEXT,                                 -- OTP de l'enllaç de vinculació
  verify_expires_at  TIMESTAMPTZ,
  verified_at        TIMESTAMPTZ,
  opt_in_at          TIMESTAMPTZ,                          -- consentiment explícit (GDPR)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_identities_user_idx ON public.wa_identities (user_id);

-- ─── 1b. wa_identity_sites — acotació opcional dels sites publicables per telèfon ─
-- Per defecte (cap fila), els candidats són TOTS els site_users del propietari.
-- Si hi ha files, la llista de candidats es limita a aquestes (el propietari no vol
-- que un site concret sigui publicable per WhatsApp).
CREATE TABLE IF NOT EXISTS public.wa_identity_sites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   UUID NOT NULL REFERENCES public.wa_identities(id) ON DELETE CASCADE,
  site_id       UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identity_id, site_id)
);

CREATE INDEX IF NOT EXISTS wa_identity_sites_site_idx ON public.wa_identity_sites (site_id);

-- ─── 2. wa_threads — estat de la conversa (re-entrada per cada missatge entrant) ─
-- L'agent NO és un procés viu: l'estat durador viu aquí (agent_state) i es
-- reconstrueix des de wa_messages a cada torn. site_id és NULL fins que el
-- resolutor de G2 el fixa.
CREATE TABLE IF NOT EXISTS public.wa_threads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id        UUID NOT NULL REFERENCES public.wa_identities(id) ON DELETE CASCADE,
  site_id            UUID REFERENCES public.sites(id) ON DELETE SET NULL,   -- destí resolt
  status             TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'closed'
  agent_state        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- resum + estat del loop
  current_post_id    UUID REFERENCES public.posts(id) ON DELETE SET NULL,   -- esborrany en curs
  window_expires_at  TIMESTAMPTZ,                          -- finestra de 24 h de WhatsApp
  cost_cents         INTEGER NOT NULL DEFAULT 0,           -- Opus + transcripció + WA acumulats
  turn_count         INTEGER NOT NULL DEFAULT 0,           -- tall de seguretat anti-loop
  last_inbound_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_threads_identity_idx ON public.wa_threads (identity_id);
CREATE INDEX IF NOT EXISTS wa_threads_site_idx     ON public.wa_threads (site_id);

-- ─── 3. wa_messages — cada missatge entrant/sortint · idempotència ─────────────
-- wa_message_id UNIQUE és la garantia anti-duplicat: WhatsApp pot reentregar el
-- mateix missatge; el webhook només encua si la inserció és nova. NULL permès per
-- als sortints (poden no tenir id de proveïdor a la inserció).
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      UUID NOT NULL REFERENCES public.wa_threads(id) ON DELETE CASCADE,
  direction      TEXT NOT NULL,                            -- 'in' | 'out'
  wa_message_id  TEXT UNIQUE,                              -- id del proveïdor (dedupe)
  msg_type       TEXT NOT NULL DEFAULT 'text',             -- 'text' | 'audio' | 'image'
  text           TEXT,
  media_path     TEXT,                                     -- ruta al bucket PRIVAT (àudio)
  transcript     TEXT,                                     -- transcripció de la nota de veu
  raw            JSONB,                                    -- payload original del proveïdor
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_messages_thread_created_idx ON public.wa_messages (thread_id, created_at);

-- ─── 4. review_tokens — l'enllaç d'aprovació (superfície d'ESCRIPTURA pública) ──
-- L'aprovació posa is_published=true: un sol ús, revocable i auditat. Es desa
-- NOMÉS sha256(token); el token cru viatja només dins l'enllaç. Acotat a UN post i
-- UNA acció. (B/D: la pàgina /review té login a sobre; el token només selecciona
-- el post — no és encara una superfície d'escriptura sense autenticar.)
CREATE TABLE IF NOT EXISTS public.review_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    TEXT NOT NULL UNIQUE,                      -- sha256 hex, MAI el token cru
  post_id       UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  site_id       UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  thread_id     UUID REFERENCES public.wa_threads(id) ON DELETE SET NULL,
  action        TEXT NOT NULL DEFAULT 'publish',           -- 'publish' (única acció cicle 1)
  status        TEXT NOT NULL DEFAULT 'active',            -- 'active' | 'consumed' | 'revoked' | 'expired'
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  consumed_ip   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_tokens_post_idx        ON public.review_tokens (post_id);
CREATE INDEX IF NOT EXISTS review_tokens_status_exp_idx  ON public.review_tokens (status, expires_at);

-- ─── 5. generation_jobs — la cua durable (resol el límit de 10 s de Netlify) ───
-- El webhook encua i retorna 200 ràpid; el Background Function reclama amb un lease
-- i hi treballa fins a 15 min (la generació triga ≤160 s). Una Scheduled Function
-- d'1 min reempeny les feines amb lease vençut → garantia at-least-once.
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     UUID NOT NULL REFERENCES public.wa_threads(id) ON DELETE CASCADE,
  message_id    UUID REFERENCES public.wa_messages(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL DEFAULT 'agent_turn',        -- 'agent_turn' | 'transcribe' | 'generate' | 'send'
  status        TEXT NOT NULL DEFAULT 'queued',            -- 'queued' | 'running' | 'done' | 'error'
  attempts      INTEGER NOT NULL DEFAULT 0,
  lease_until   TIMESTAMPTZ,                               -- reclamat fins a; vençut → re-empès
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  result        JSONB,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índex parcial per al re-empenyedor: feines vives amb lease vençut (o sense).
CREATE INDEX IF NOT EXISTS generation_jobs_active_idx
  ON public.generation_jobs (lease_until)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS generation_jobs_thread_idx ON public.generation_jobs (thread_id);

-- ─── 6. wa_article_outcomes — el llaç de resultat (la joia de la corona, G3) ───
-- Una fila per article publicat des de l'agent. Captura el brief original i, a 60
-- dies, si ha posicionat / portat trànsit. Sense això, el motor autònom futur és
-- una mànega de contingut sense brúixola.
CREATE TABLE IF NOT EXISTS public.wa_article_outcomes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  site_id        UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  thread_id      UUID REFERENCES public.wa_threads(id) ON DELETE SET NULL,
  transcript     TEXT,                                     -- snapshot del brief que el va originar
  published_url  TEXT,
  published_at   TIMESTAMPTZ,
  check_due_at   TIMESTAMPTZ,                              -- published_at + 60 dies
  outcome        JSONB,                                    -- { ranked, traffic, ... } omplert a 60 dies
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id)
);

CREATE INDEX IF NOT EXISTS wa_article_outcomes_site_idx     ON public.wa_article_outcomes (site_id);
CREATE INDEX IF NOT EXISTS wa_article_outcomes_due_idx
  ON public.wa_article_outcomes (check_due_at)
  WHERE outcome IS NULL;

-- ─── Triggers updated_at (reutilitzen public.set_updated_at() de la migració 001) ─
DROP TRIGGER IF EXISTS wa_identities_set_updated_at ON public.wa_identities;
CREATE TRIGGER wa_identities_set_updated_at
  BEFORE UPDATE ON public.wa_identities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS wa_threads_set_updated_at ON public.wa_threads;
CREATE TRIGGER wa_threads_set_updated_at
  BEFORE UPDATE ON public.wa_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS generation_jobs_set_updated_at ON public.generation_jobs;
CREATE TRIGGER generation_jobs_set_updated_at
  BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS wa_article_outcomes_set_updated_at ON public.wa_article_outcomes;
CREATE TRIGGER wa_article_outcomes_set_updated_at
  BEFORE UPDATE ON public.wa_article_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- RLS — totes les escriptures van pel service-role (cap política d'INSERT/UPDATE).
-- Lectura: superadmin (per a /admin/agent) + el propietari/membre quan la columna
-- ho permet. El service-role sobrepassa RLS; aquestes polítiques són defensa.
-- =============================================================================
ALTER TABLE public.wa_identities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_identity_sites   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_threads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_article_outcomes ENABLE ROW LEVEL SECURITY;

-- wa_identities: superadmin + el mateix propietari.
DROP POLICY IF EXISTS "wa_identities_select_superadmin" ON public.wa_identities;
DROP POLICY IF EXISTS "wa_identities_select_self"        ON public.wa_identities;
CREATE POLICY "wa_identities_select_superadmin" ON public.wa_identities
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "wa_identities_select_self" ON public.wa_identities
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- wa_identity_sites: superadmin + el propietari de la identitat.
DROP POLICY IF EXISTS "wa_identity_sites_select_superadmin" ON public.wa_identity_sites;
DROP POLICY IF EXISTS "wa_identity_sites_select_owner"       ON public.wa_identity_sites;
CREATE POLICY "wa_identity_sites_select_superadmin" ON public.wa_identity_sites
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "wa_identity_sites_select_owner" ON public.wa_identity_sites
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.wa_identities i
      WHERE i.id = wa_identity_sites.identity_id AND i.user_id = auth.uid()
    )
  );

-- wa_threads: superadmin + membre del site resolt.
DROP POLICY IF EXISTS "wa_threads_select_superadmin" ON public.wa_threads;
DROP POLICY IF EXISTS "wa_threads_select_member"      ON public.wa_threads;
CREATE POLICY "wa_threads_select_superadmin" ON public.wa_threads
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "wa_threads_select_member" ON public.wa_threads
  FOR SELECT TO authenticated USING (
    site_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.site_users su
      WHERE su.site_id = wa_threads.site_id AND su.user_id = auth.uid()
    )
  );

-- review_tokens i wa_article_outcomes: superadmin + membre del site.
DROP POLICY IF EXISTS "review_tokens_select_superadmin" ON public.review_tokens;
DROP POLICY IF EXISTS "review_tokens_select_member"      ON public.review_tokens;
CREATE POLICY "review_tokens_select_superadmin" ON public.review_tokens
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "review_tokens_select_member" ON public.review_tokens
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.site_users su
      WHERE su.site_id = review_tokens.site_id AND su.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wa_article_outcomes_select_superadmin" ON public.wa_article_outcomes;
DROP POLICY IF EXISTS "wa_article_outcomes_select_member"      ON public.wa_article_outcomes;
CREATE POLICY "wa_article_outcomes_select_superadmin" ON public.wa_article_outcomes
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "wa_article_outcomes_select_member" ON public.wa_article_outcomes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.site_users su
      WHERE su.site_id = wa_article_outcomes.site_id AND su.user_id = auth.uid()
    )
  );

-- wa_messages i generation_jobs: operacionals, només superadmin (els llegeix /admin/agent).
DROP POLICY IF EXISTS "wa_messages_select_superadmin" ON public.wa_messages;
CREATE POLICY "wa_messages_select_superadmin" ON public.wa_messages
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS "generation_jobs_select_superadmin" ON public.generation_jobs;
CREATE POLICY "generation_jobs_select_superadmin" ON public.generation_jobs
  FOR SELECT TO authenticated USING (public.is_superadmin());

NOTIFY pgrst, 'reload schema';
