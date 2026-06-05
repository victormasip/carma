-- =============================================================================
-- MIGRACIÓ 016: Signatura del blog del client (blog_signature)
-- =============================================================================
-- Resultat de la detecció intel·ligent del Theme Grabber: si el lloc d'origen ja
-- té un blog/secció de notícies, on és, i l'estil de les seves "targetes d'article"
-- (columnes, gap, radi, vora, ombra, proporció d'imatge, tipografia del títol),
-- perquè el feed de Carma en repliqui el disseny natiu. NULL quan no hi ha blog
-- (llavors el render fa servir el disseny premium per defecte amb els tokens).
--
--   blog_signature = {
--     "hasBlog": true,
--     "blogUrl": "https://exemple.com/noticies",
--     "card": { "columns": 3, "gap": "2rem", "radius": "12px",
--               "border": "1px solid #ddd", "imageAspect": "16/9", ... }
--   }
--
-- El codi té fallback (error 42703) si aquesta migració encara no s'ha executat.
-- Executar al Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.site_themes
  ADD COLUMN IF NOT EXISTS blog_signature JSONB;

NOTIFY pgrst, 'reload schema';
