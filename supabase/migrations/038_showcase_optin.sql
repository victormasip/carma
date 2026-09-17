-- =============================================================================
-- MIGRACIÓ 038: L'Aparador és OPT-IN (Community Wave 2)
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- El mur «Fet amb Carma» de la portada agafava QUALSEVOL blog públic amb
-- articles publicats. Era defensable —tot el que ensenyava ja era obert a
-- internet— però no és el que vam dissenyar ni el que la gent espera: sortir a
-- la pàgina d'inici de Carma és una decisió del propietari, no una conseqüència
-- de publicar.
--
-- Aquesta migració posa la casella. A partir d'aquí, la consulta del mur
-- (lib/marketing/wall.ts) filtra estrictament per `showcase = true` i, si
-- aquesta columna no hi és, NO ENSENYA RES. És l'única lectura del codi que
-- falla TANCADA a propòsit: a tot arreu una migració pendent degrada la
-- funcionalitat, aquí ha de degradar cap al silenci.
--
-- Esbós original: docs/plans/2026-09-16-landing-and-community-vision.md §6.8
-- (allà es va escriure com a «034»; la 034 va acabar sent pricing_v2, així que
-- les tres línies de l'aparador viuen aquí).
-- =============================================================================

-- `NOT NULL DEFAULT false` és el cor de tot: cada lloc que ja existeix i cada
-- lloc que es creï demà neix FORA de l'aparador. No hi ha backfill, i és
-- deliberat — un backfill que posés true seria exactament el que estem arreglant.
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS showcase    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS showcase_at TIMESTAMPTZ;

COMMENT ON COLUMN public.sites.showcase IS
  'Opt-in explícit del propietari a sortir al mur «Fet amb Carma» de la portada. Fals per defecte, sempre.';
COMMENT ON COLUMN public.sites.showcase_at IS
  'Quan va dir que sí la PRIMERA vegada. No es reescriu si torna a activar-ho: és el registre honest de la decisió.';

-- Índex parcial: el mur només llegeix les files amb showcase = true, i les
-- ordena per antiguitat de l'opt-in. Un índex sobre tota la taula seria pagar
-- per les files que la consulta mai mira.
CREATE INDEX IF NOT EXISTS sites_showcase_idx
  ON public.sites (showcase_at DESC)
  WHERE showcase;
