-- =============================================================================
-- MIGRACIÓ 033: Brand Brain (Fase 1 del pla Super MVP)
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- EL PROBLEMA (auditoria 2026-09-16)
-- ──────────────────────────────────
-- site_brain_profiles (migració 030) existeix, però es genera OFFLINE A PARTIR
-- DELS ARTICLES JA PUBLICATS i es marca `seed` per sota de WA_PROFILE_MIN_POSTS.
-- És a dir: l'agent d'un usuari NOU no sap pràcticament res de la seva marca
-- justament al primer torn, que és quan més importa.
--
-- LA SOLUCIÓ
-- ──────────
-- El Brand Brain s'omple A L'ONBOARDING, abans del primer article: de la web
-- (scrape profund), dels documents que deixi anar (PDF/DOCX/TXT/MD) i d'una nota
-- de veu. Tot el que les columnes de 030 ja modelen (industry/audience/tone/
-- content_pillars/writing_rules) es reomple; la resta viu a `brand`.
--
--   · brand.identity     nom, tagline, què venen realment, proves
--   · brand.voice        descriptors, registre, paraules prohibides, longitud de
--                        frase, política d'emojis i — el camp de més valor de tot
--                        el pla — EXEMPLARS VERBATIM tretes del seu propi web.
--                        Un few-shot amb les seves pròpies frases val més que
--                        qualsevol quantitat d'adjectius.
--   · brand.visual       tipografies, colors, logo, estil d'imatge
--   · brand.constraints  afirmacions que no poden fer mai (compliance)
--   · brand.sources      d'on ha sortit cada cosa (auditabilitat)
--
-- Tot el codi és 42703-safe: sense aquesta migració el Brand Brain no es desa i
-- l'agent es comporta exactament com avui.
-- =============================================================================

ALTER TABLE public.site_brain_profiles
  ADD COLUMN IF NOT EXISTS brand JSONB;

COMMENT ON COLUMN public.site_brain_profiles.brand IS
  'Brand Brain capturat a l''onboarding: identity / voice (amb exemplars verbatim) / visual / constraints / sources.';

-- `source` guanya un valor: 'onboarding' (capturat de web+documents+veu, abans del
-- primer article). Ordre de confiança: owner_edited > onboarding > auto > seed.
-- La columna és TEXT sense CHECK, així que no cal DDL — però hi deixem constància
-- perquè qui llegeixi l'esquema sàpiga quins valors són legítims.
COMMENT ON COLUMN public.site_brain_profiles.source IS
  'seed | auto | onboarding | owner_edited. Confiança creixent en aquest ordre.';

-- El perfil d'onboarding es genera un cop i no s'ha de regenerar per haver
-- publicat: el cron de refresc només ha de tocar els `auto`/`seed`.
CREATE INDEX IF NOT EXISTS site_brain_profiles_source_idx
  ON public.site_brain_profiles (source);

NOTIFY pgrst, 'reload schema';
