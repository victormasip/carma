-- =============================================================================
-- MIGRACIÓ 012: Plantilla de targeta d'article capturada (extracted_card)
-- =============================================================================
-- El Magic Wand ara també detecta la "card" repetida del llistat del client i la
-- reconstrueix amb la IA com una PLANTILLA: HTML amb camps ({{title}}, {{image}},
-- {{url}}, {{excerpt}}, {{date}}, {{category}}, {{author}}) + CSS escopat sota
-- [data-carma-card]. S'emmagatzema com a JSON { html, css } (string).
--
-- Al render, si extracted_card existeix, ELS ARTICLES del blog es renderitzen amb
-- aquell disseny (omplint els camps); si no, s'usen les cards natives per tokens.
-- El codi té fallback (error 42703) si aquesta migració encara no s'ha executat.
-- Executar al Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS extracted_card TEXT;

-- Recarregar el schema cache de PostgREST perquè Supabase vegi la nova columna
NOTIFY pgrst, 'reload schema';
