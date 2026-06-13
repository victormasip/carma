-- =============================================================================
-- MIGRACIÓ 023: Comptador de regeneracions del tema (regen_count)
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- Monetització: un client FREE pot regenerar (re-capturar) el seu tema UNA sola
-- vegada de franc. La captura inicial de l'onboarding NO compta; cada re-captura
-- posterior incrementa aquest comptador. Quan arriba a 1, la regeneració queda
-- bloquejada (Premium). Els superadmins/Premium tenen regeneracions il·limitades.
--
-- El codi és 42703-safe: sense aquesta migració, el límit no s'aplica (es tracta
-- com a regeneracions il·limitades) i la resta del Theme Studio funciona igual.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS regen_count INT NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
