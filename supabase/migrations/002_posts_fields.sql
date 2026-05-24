-- =============================================================================
-- MIGRACIÓ 002: Camps addicionals a posts (excerpt, featured_image, categories, tags, SEO, author)
-- Executar al Supabase SQL Editor
-- =============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS excerpt         TEXT,
  ADD COLUMN IF NOT EXISTS featured_image  TEXT,
  ADD COLUMN IF NOT EXISTS categories      TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags            TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seo_title       TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS author_name     TEXT;

-- Índex per a cerques futures per categoria/tag
CREATE INDEX IF NOT EXISTS posts_categories_idx ON public.posts USING GIN (categories);
CREATE INDEX IF NOT EXISTS posts_tags_idx        ON public.posts USING GIN (tags);
