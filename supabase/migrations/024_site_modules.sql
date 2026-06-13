-- =============================================================================
-- MIGRACIÓ 024: Smart Modules — configuració flexible per lloc (modules JSONB)
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- "Smart Modules" = funcionalitats opcionals del blog (cerca, filtres, hero
-- destacat, articles relacionats, newsletter, paywall, barra d'anuncis, índex,
-- compartir, progrés de lectura, mode fosc, etc.) que l'usuari activa/desactiva i
-- configura des del panell "Mòduls" del dashboard.
--
-- DECISIÓ ARQUITECTURAL (future-proof): tota la configuració viu en UNA columna
-- JSONB lliure d'esquema. El format és:
--
--   {
--     "<moduleId>": {
--       "enabled":  true | false,
--       "variant":  "<layoutId>",            -- disposició triada
--       "options":  { ...clau→valor }         -- opcions del mòdul
--     },
--     ...
--   }
--
-- Afegir un mòdul NOU en el futur només requereix afegir-lo al registre del codi
-- (src/lib/modules/registry.ts). NO cal cap migració de BD: la columna ja accepta
-- qualsevol clau/valor. Els mòduls absents prenen els valors per defecte del
-- registre, de manera que un lloc sense configuració es renderitza exactament com
-- abans (cap canvi de comportament).
--
-- El codi és 42703-safe: sense aquesta migració, llegir/escriure modules és un
-- no-op silenciós i la resta del Theme Studio i el render funcionen igual.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Cap índex addicional: la config es llegeix sempre per site_id (PK/onConflict
-- existent) com a part del tema, no es consulta per camp intern.

NOTIFY pgrst, 'reload schema';
