-- =============================================================================
-- MIGRACIÓ 005: capturar JavaScript del site original al tema
-- Permet que jQuery, Vue, menús, carousels i altres scripts del client
-- funcionin a les pàgines de render.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS extracted_scripts TEXT,                    -- HTML amb <script> tags (inline + src absoluts)
  ADD COLUMN IF NOT EXISTS external_scripts  TEXT[] DEFAULT '{}';     -- URLs absolutes dels scripts externs

-- Recarregar PostgREST
NOTIFY pgrst, 'reload schema';
