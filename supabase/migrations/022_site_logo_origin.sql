-- =============================================================================
-- MIGRACIÓ 022: Logo del lloc + URL d'origen del clon (logo_url, origin_url)
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- · sites.logo_url  — el logo de la marca detectat en capturar el tema (imatge
--   del header amb "logo", o favicon/apple-touch-icon, o og:image). Es mostra a
--   les targetes del dashboard. NULL fins que es captura un tema.
-- · sites.origin_url — la URL que es va clonar per crear aquest lloc (funnel
--   d'onboarding). Permet que el proveïdor de llocs sigui IDEMPOTENT: tornar a
--   entrar al funnel amb la mateixa URL reutilitza el lloc en lloc de duplicar-lo.
--
-- El codi és 42703-safe: si aquesta migració no s'ha executat, la creació de
-- llocs i el dashboard segueixen funcionant (sense logo a les targetes i amb la
-- protecció de duplicats basada en el tier "1 lloc per client free").
-- =============================================================================

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS origin_url TEXT;

-- Cerca ràpida del lloc per URL d'origen (find-or-create del proveïdor idempotent).
CREATE INDEX IF NOT EXISTS sites_origin_url_idx ON public.sites (lower(origin_url));

NOTIFY pgrst, 'reload schema';
