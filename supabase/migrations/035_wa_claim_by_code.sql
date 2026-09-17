-- =============================================================================
-- MIGRACIÓ 035: Vincular WhatsApp pel CODI, sense saber el número abans
-- Executar al Supabase SQL Editor. Additiva i idempotent.
-- =============================================================================
-- EL BUG QUE ARREGLA
-- ──────────────────
-- El pas "Connecta l'agent" (God-Mode, 2026-09-16) promet això:
--
--     mòbil   → prems el botó → s'obre el WhatsApp amb el codi ja escrit → envia
--     escriptori → escaneja el QR → el mateix
--
-- …i no podia funcionar mai. L'enllaç es construeix a partir d'un codi que surt
-- de `wa_identities.verify_code`, i NOMÉS existeix una fila quan l'usuari ja ha
-- escrit el seu telèfon (addPhoneNumber). O sigui: el codi només apareix després
-- de fer justament allò que la pantalla existeix per estalviar-te. Sense codi,
-- `link` és null → el botó és una àncora morta i el QR no es genera.
--
-- A més el webhook buscava la identitat NOMÉS per telèfon
-- (`.eq('phone_e164', phone)`), així que un missatge des d'un número desconegut
-- es descartava encara que portés un codi vàlid.
--
-- LA SOLUCIÓ
-- ──────────
-- Una RECLAMACIÓ: una fila pendent amb codi i SENSE telèfon. L'usuari envia
-- "Carma 123456" des del número que vulgui; el webhook, quan no troba cap
-- identitat per aquell telèfon, mira si el text conté un codi de reclamació viu
-- i hi enganxa el número. Aquell missatge és també l'opt-in de GDPR, igual que
-- abans.
--
-- Això és el que fa que "zero typing" sigui veritat: l'usuari no ens diu mai el
-- seu número — ens el demostra.
-- =============================================================================

-- ─── 1. El telèfon deixa de ser obligatori ───────────────────────────────────
-- Una reclamació existeix abans de saber el número. UNIQUE segueix igual:
-- a Postgres, un índex únic permet múltiples NULL, així que poden conviure
-- tantes reclamacions obertes com calgui sense xocar entre elles.
ALTER TABLE public.wa_identities
  ALTER COLUMN phone_e164 DROP NOT NULL;

-- ─── 2. Un codi viu no es pot repetir ────────────────────────────────────────
-- Sense això, dues reclamacions simultànies podrien encunyar el mateix codi de
-- sis xifres i el webhook vincularia el número a l'usuari equivocat. L'índex és
-- parcial: només mira els codis que encara serveixen per a res.
CREATE UNIQUE INDEX IF NOT EXISTS wa_identities_pending_code_uidx
  ON public.wa_identities (verify_code)
  WHERE status = 'pending' AND verify_code IS NOT NULL;

-- ─── 3. Buscar per codi ha de ser barat ──────────────────────────────────────
-- El webhook fa aquesta consulta a cada missatge entrant d'un número desconegut.
CREATE INDEX IF NOT EXISTS wa_identities_claim_idx
  ON public.wa_identities (verify_code, verify_expires_at)
  WHERE status = 'pending' AND phone_e164 IS NULL;

-- ─── 4. Neteja: reclamacions caducades sense número ──────────────────────────
-- No tenen cap valor un cop passat el TTL i ocupen l'índex únic del punt 2.
-- Segur: només esborra files SENSE telèfon, o sigui que mai toca una vinculació
-- real ni una pendent iniciada per addPhoneNumber.
DELETE FROM public.wa_identities
WHERE  status = 'pending'
  AND  phone_e164 IS NULL
  AND  verify_expires_at IS NOT NULL
  AND  verify_expires_at < now() - interval '1 day';
