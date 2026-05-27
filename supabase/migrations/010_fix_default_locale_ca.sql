-- =============================================================================
-- MIGRACIÓ 010: Corregir el locale per defecte heretat (en → ca)
-- =============================================================================
-- La migració 008 inicial va sortir amb DEFAULT 'en'. Si es va executar aquella
-- versió, TOTS els articles existents van quedar etiquetats default_locale='en'
-- tot i tenir el contingut en català → l'editor els obria a la pestanya "EN" i
-- el render els marcava <html lang="en">. Aquesta migració:
--   1. Posa el DEFAULT de la columna a 'ca' (per si es va crear amb 'en').
--   2. Reescriu les files que encara arrosseguen el 'en' heretat → 'ca'.
-- Cap usuari ha triat mai 'en' manualment (la funció i18n acaba d'arribar), així
-- que el reescrit només afecta artefactes del default antic.
-- Executar al Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.posts        ALTER COLUMN default_locale SET DEFAULT 'ca';
ALTER TABLE public.site_themes  ALTER COLUMN default_locale SET DEFAULT 'ca';

UPDATE public.posts        SET default_locale = 'ca' WHERE default_locale = 'en';
UPDATE public.site_themes  SET default_locale = 'ca' WHERE default_locale = 'en';

-- Garantir que cada lloc té com a mínim el seu idioma per defecte a locales[].
UPDATE public.site_themes
   SET locales = ARRAY['ca']::text[]
 WHERE locales IS NULL OR array_length(locales, 1) IS NULL;

NOTIFY pgrst, 'reload schema';
