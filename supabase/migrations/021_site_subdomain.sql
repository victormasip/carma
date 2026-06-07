-- =============================================================================
-- MIGRACIÓ 021: Subdomini per lloc (servir el blog a <client>.<domini>)
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- Afegeix `sites.subdomain` perquè cada blog tingui una URL pròpia tipus
-- `elmeublog.carma.cat` (en dev: `elmeublog.localhost:3000`) en lloc de
-- `/render/<uuid>`. El codi és 42703-safe: si aquesta migració no s'ha executat,
-- la creació de llocs i el detall segueixen funcionant sense subdomini i el blog
-- continua accessible per `/render/<uuid>`.
-- =============================================================================

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS subdomain TEXT;

-- Backfill: slugifica el nom (plega accents catalans/castellans comuns), i
-- desambigua els duplicats afegint un sufix numèric per ordre de creació.
UPDATE public.sites s
SET subdomain = d.candidate
FROM (
  SELECT id,
    CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS candidate
  FROM (
    SELECT id, base,
      row_number() OVER (PARTITION BY base ORDER BY created_at, id) AS rn
    FROM (
      SELECT id, created_at,
        COALESCE(NULLIF(
          regexp_replace(
            regexp_replace(
              translate(lower(name),
                'àáâäãèéêëìíîïòóôöõùúûüçñ·',
                'aaaaaeeeeiiiiooooouuuucn-'),
              '[^a-z0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'),
          ''), 'blog') AS base
      FROM public.sites
    ) slugged
  ) ranked
) d
WHERE s.id = d.id AND (s.subdomain IS NULL OR s.subdomain = '');

-- Last resort for anything still empty.
UPDATE public.sites
SET subdomain = 'blog-' || left(replace(id::text, '-', ''), 8)
WHERE subdomain IS NULL OR subdomain = '';

-- Case-insensitive uniqueness — the resolver matches a lowercased host label.
CREATE UNIQUE INDEX IF NOT EXISTS sites_subdomain_key ON public.sites (lower(subdomain));

NOTIFY pgrst, 'reload schema';
