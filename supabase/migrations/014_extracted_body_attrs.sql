-- =============================================================================
-- MIGRACIÓ 014: atributs del <body> del lloc d'origen (clon Top/Bottom)
-- =============================================================================
-- El nou motor de captura "Top/Bottom sandwich" parteix la pàgina al voltant del
-- contingut principal: extracted_header = TOT el que va abans (wrappers + header),
-- extracted_footer = TOT el que va després fins a </body> (footer + tancaments de
-- wrappers + scripts tardans). Perquè el FONS i la tipografia globals del lloc
-- coincideixin, també cal reaplicar els atributs del <body> original (class/style/
-- data-*) al <body> del render — les regles `body{…}` i `body.tema-fosc{…}` només
-- encaixen amb un <body> real.
--
-- `extracted_body_attrs` guarda aquesta cadena d'atributs (sense els angles).
-- El codi és 42703-safe: sense aquesta columna, saveTheme reintenta sense ella i
-- el render simplement no aplica els atributs (cap regressió, només el fons pot
-- no coincidir fins executar la migració).
--
-- Executar al Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS extracted_body_attrs TEXT;

-- Recarregar el schema cache de PostgREST perquè Supabase vegi la nova columna.
NOTIFY pgrst, 'reload schema';
