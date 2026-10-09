-- =============================================================================
-- MIGRACIÓ 041: L'INSTANT — el cost de cada pàgina deixa de créixer amb el blog
-- Executar al Supabase SQL Editor. Additiva i idempotent (es pot tornar a executar).
-- (La 040 queda reservada per a `chrome_captures`, EL MIRALL W2.)
-- =============================================================================
-- Pla: docs/plans/2026-10-06-architecture-reboot.md §4.2. Cinc peces:
--
--   1. posts.published_at   — la clau del feed. El mateix instant que l'editor
--                             ensenya com a "data de publicació" (created_at, que
--                             l'usuari pot editar i la importació conserva) mentre
--                             l'article és públic; NULL mentre és un esborrany.
--                             Columna GENERADA: no pot divergir mai de la data que
--                             llegeix el lector. Índex parcial (site, published_at,
--                             id) → paginació per cursor (keyset), O(pàgina).
--   2. site_counters         — total / publicats / mostres per lloc, mantinguts per
--                             triggers de SENTÈNCIA (un import de 500 articles = una
--                             actualització, no 500). Substitueix els 4 count(*) exactes
--                             que el llistat del panell feia a CADA pàgina.
--   3. posts.likes_count     — els aplaudiments, sumats en el moment d'escriure'ls
--                             (abans: /api/interactions sumava TOTES les files de
--                             post_likes de l'article a cada visita).
--   4. page_views_daily(_posts) — l'analítica pre-agregada per dia, mantinguda per un
--                             trigger a cada vista: sense pg_cron, sense desfasament.
--                             El panell llegeix O(dies), no 50.000 files — que, de
--                             fet, MAI arribaven: l'API de Supabase talla qualsevol
--                             select a 1.000 files (Max rows per defecte), així que
--                             un lloc amb més de 1.000 vistes en 30 dies veia "1.000".
--   5. posts.search          — tsvector per idioma (català/castellà/anglès, 'simple'
--                             si la versió de Postgres no té la configuració), sense
--                             accents; + índexs trigram per al cercador del panell
--                             (ILIKE '%terme%' deixa de ser un seq scan).
--
-- Tot el codi és fail-open: abans d'executar aquesta migració l'app continua pel
-- camí antic (42P01 / 42703 / PGRST202 → fallback), així que l'ordre de desplegament
-- és indiferent.
-- =============================================================================

-- ─── 1. published_at + índexs keyset ─────────────────────────────────────────

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
  GENERATED ALWAYS AS (CASE WHEN is_published THEN created_at END) STORED;

-- El feed públic: només publicats, el més nou primer, id desfà empats.
CREATE INDEX IF NOT EXISTS posts_feed_idx
  ON public.posts (site_id, published_at DESC, id DESC)
  WHERE is_published;

-- El llistat del panell (tots els estats): el mateix ordre que avui, amb id per a
-- un cursor estable.
CREATE INDEX IF NOT EXISTS posts_site_created_id_idx
  ON public.posts (site_id, created_at DESC, id DESC);

-- ─── 2. site_counters ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_counters (
  site_id          UUID PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  posts_total      INTEGER NOT NULL DEFAULT 0,
  posts_published  INTEGER NOT NULL DEFAULT 0,
  posts_samples    INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aplica uns deltes per lloc (ignora els que són tot zeros: una edició de títol o
-- de contingut, el cas més freqüent, no escriu res).
CREATE OR REPLACE FUNCTION public.site_counters_apply(d JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.site_counters AS c (site_id, posts_total, posts_published, posts_samples, updated_at)
  SELECT (e->>'site_id')::uuid, (e->>'total')::int, (e->>'published')::int, (e->>'samples')::int, now()
  FROM jsonb_array_elements(d) AS e
  WHERE ((e->>'total')::int <> 0 OR (e->>'published')::int <> 0 OR (e->>'samples')::int <> 0)
    -- Deleting a SITE cascades to its posts, and this runs for that cascade: the
    -- site is already gone, so there is nothing to count (and inserting a counter
    -- row for it would fail the foreign key and abort the deletion).
    AND EXISTS (SELECT 1 FROM public.sites s WHERE s.id = (e->>'site_id')::uuid)
  ON CONFLICT (site_id) DO UPDATE SET
    posts_total     = c.posts_total     + EXCLUDED.posts_total,
    posts_published = c.posts_published + EXCLUDED.posts_published,
    posts_samples   = c.posts_samples   + EXCLUDED.posts_samples,
    updated_at      = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.site_counters_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.site_counters_apply(coalesce((
    SELECT jsonb_agg(jsonb_build_object('site_id', site_id, 'total', n, 'published', p, 'samples', s))
    FROM (SELECT site_id, count(*) AS n,
                 count(*) FILTER (WHERE is_published) AS p,
                 count(*) FILTER (WHERE meta @> '{"sample": true}') AS s
          FROM new_rows GROUP BY site_id) x), '[]'));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_counters_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.site_counters_apply(coalesce((
    SELECT jsonb_agg(jsonb_build_object('site_id', site_id, 'total', -n, 'published', -p, 'samples', -s))
    FROM (SELECT site_id, count(*) AS n,
                 count(*) FILTER (WHERE is_published) AS p,
                 count(*) FILTER (WHERE meta @> '{"sample": true}') AS s
          FROM old_rows GROUP BY site_id) x), '[]'));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_counters_on_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.site_counters_apply(coalesce((
    SELECT jsonb_agg(jsonb_build_object('site_id', site_id, 'total', n, 'published', p, 'samples', s))
    FROM (
      SELECT site_id, sum(n) AS n, sum(p) AS p, sum(s) AS s
      FROM (
        SELECT site_id, 1 AS n, is_published::int AS p, coalesce((meta @> '{"sample": true}')::int, 0) AS s FROM new_rows
        UNION ALL
        SELECT site_id, -1, -(is_published::int), -coalesce((meta @> '{"sample": true}')::int, 0) FROM old_rows
      ) x
      GROUP BY site_id
    ) y), '[]'));
  RETURN NULL;
END;
$$;

-- Triggers de sentència amb taules de transició (Postgres ≥ 10). Un per esdeveniment:
-- una taula de transició no es pot compartir entre esdeveniments.
DROP TRIGGER IF EXISTS posts_counters_ins ON public.posts;
CREATE TRIGGER posts_counters_ins AFTER INSERT ON public.posts
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.site_counters_on_insert();
DROP TRIGGER IF EXISTS posts_counters_del ON public.posts;
CREATE TRIGGER posts_counters_del AFTER DELETE ON public.posts
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.site_counters_on_delete();
DROP TRIGGER IF EXISTS posts_counters_upd ON public.posts;
CREATE TRIGGER posts_counters_upd AFTER UPDATE ON public.posts
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.site_counters_on_update();

-- Recompte des de zero: la càrrega inicial ARA, i la reconciliació nocturna (un
-- trigger desactivat a mà o un UPDATE directe no poden deixar un comptador mentider
-- més d'un dia). Retorna quantes files ha CORREGIT — un valor > 0 en una execució
-- nocturna és un avís que val la pena mirar.
CREATE OR REPLACE FUNCTION public.reconcile_site_counters()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE fixed INTEGER;
BEGIN
  WITH truth AS (
    SELECT s.id AS site_id,
           count(p.id)::int                                            AS total,
           count(p.id) FILTER (WHERE p.is_published)::int              AS published,
           count(p.id) FILTER (WHERE p.meta @> '{"sample": true}')::int AS samples
    FROM public.sites s LEFT JOIN public.posts p ON p.site_id = s.id
    GROUP BY s.id
  ), upserted AS (
    INSERT INTO public.site_counters AS c (site_id, posts_total, posts_published, posts_samples, updated_at)
    SELECT site_id, total, published, samples, now() FROM truth
    ON CONFLICT (site_id) DO UPDATE SET
      posts_total = EXCLUDED.posts_total, posts_published = EXCLUDED.posts_published,
      posts_samples = EXCLUDED.posts_samples, updated_at = now()
    WHERE (c.posts_total, c.posts_published, c.posts_samples)
          IS DISTINCT FROM (EXCLUDED.posts_total, EXCLUDED.posts_published, EXCLUDED.posts_samples)
    RETURNING 1
  )
  SELECT count(*) INTO fixed FROM upserted;
  RETURN fixed;
END;
$$;

SELECT public.reconcile_site_counters();

-- Mateixa signatura que la 029: el dashboard (home de client i de superadmin) ja la
-- crida, i ara llegeix una fila per lloc en lloc d'agrupar tots els posts.
CREATE OR REPLACE FUNCTION public.posts_counts_by_site(p_site_ids UUID[] DEFAULT NULL)
RETURNS TABLE (site_id UUID, total BIGINT, published BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.site_id, c.posts_total::bigint, c.posts_published::bigint
  FROM public.site_counters c
  WHERE p_site_ids IS NULL OR c.site_id = ANY (p_site_ids);
$$;

-- ─── 3. likes_count ──────────────────────────────────────────────────────────

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.posts_likes_count_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + NEW.count WHERE id = NEW.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.count <> OLD.count OR NEW.post_id <> OLD.post_id THEN
      UPDATE public.posts SET likes_count = likes_count - OLD.count WHERE id = OLD.post_id;
      UPDATE public.posts SET likes_count = likes_count + NEW.count WHERE id = NEW.post_id;
    END IF;
  ELSE
    UPDATE public.posts SET likes_count = greatest(0, likes_count - OLD.count) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS post_likes_count_sync ON public.post_likes;
CREATE TRIGGER post_likes_count_sync AFTER INSERT OR UPDATE OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.posts_likes_count_sync();

-- Les càrregues inicials sobre `posts` no han de tocar `updated_at` de cap article
-- (el trigger de la 001 el posaria a now() a tots): es fan amb aquell trigger aturat.
CREATE OR REPLACE FUNCTION pg_temp.quiet_posts(on_off BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'posts_set_updated_at' AND tgrelid = 'public.posts'::regclass) THEN
    EXECUTE format('ALTER TABLE public.posts %s TRIGGER posts_set_updated_at', CASE WHEN on_off THEN 'DISABLE' ELSE 'ENABLE' END);
  END IF;
END $$;

SELECT pg_temp.quiet_posts(true);
UPDATE public.posts p SET likes_count = l.total
FROM (SELECT post_id, sum(count)::int AS total FROM public.post_likes GROUP BY post_id) l
WHERE l.post_id = p.id AND p.likes_count IS DISTINCT FROM l.total;
SELECT pg_temp.quiet_posts(false);

-- ─── 4. Analítica diària ─────────────────────────────────────────────────────
--
-- Tres taules, totes per dia UTC (el mateix dia que el panell sempre ha fet servir):
--   page_views_daily           (lloc, dia)        vistes + visitants únics del lloc
--   page_views_daily_posts     (lloc, dia, post)  vistes per article (rànquing)
--   page_view_daily_visitors   (lloc, dia, hash)  qui ja s'ha comptat avui
-- El hash del visitant ja ROTA CADA DIA (lib/analytics/track.ts), així que "visitants
-- únics en 30 dies" sempre ha volgut dir la suma dels únics de cada dia: la suma de
-- `visitors` reprodueix exactament el número que el panell calculava.

CREATE TABLE IF NOT EXISTS public.page_views_daily (
  site_id  UUID    NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day      DATE    NOT NULL,
  views    INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day)
);

CREATE TABLE IF NOT EXISTS public.page_views_daily_posts (
  site_id UUID    NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day     DATE    NOT NULL,
  post_id UUID    NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  views   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, post_id)
);

CREATE TABLE IF NOT EXISTS public.page_view_daily_visitors (
  site_id      UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (site_id, day, visitor_hash)
);

CREATE OR REPLACE FUNCTION public.page_views_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d   DATE := (NEW.created_at AT TIME ZONE 'UTC')::date;
  new_visitor INTEGER := 0;
BEGIN
  IF NEW.visitor_hash IS NOT NULL THEN
    INSERT INTO public.page_view_daily_visitors (site_id, day, visitor_hash)
    VALUES (NEW.site_id, d, NEW.visitor_hash)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS new_visitor = ROW_COUNT;
  END IF;

  INSERT INTO public.page_views_daily AS t (site_id, day, views, visitors)
  VALUES (NEW.site_id, d, 1, new_visitor)
  ON CONFLICT (site_id, day) DO UPDATE SET views = t.views + 1, visitors = t.visitors + EXCLUDED.visitors;

  -- The beacon is public: a view may name any post id. Only a post of THIS site
  -- counts toward this site's ranking (otherwise another blog's draft title could
  -- surface in this owner's "most read").
  IF NEW.post_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = NEW.post_id AND p.site_id = NEW.site_id) THEN
    INSERT INTO public.page_views_daily_posts AS t (site_id, day, post_id, views)
    VALUES (NEW.site_id, d, NEW.post_id, 1)
    ON CONFLICT (site_id, day, post_id) DO UPDATE SET views = t.views + 1;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS page_views_rollup ON public.page_views;
CREATE TRIGGER page_views_rollup AFTER INSERT ON public.page_views
  FOR EACH ROW EXECUTE FUNCTION public.page_views_rollup();

-- Càrrega inicial des de les files crues existents (idempotent: substitueix).
INSERT INTO public.page_views_daily (site_id, day, views, visitors)
SELECT site_id, (created_at AT TIME ZONE 'UTC')::date, count(*), count(DISTINCT visitor_hash)
FROM public.page_views GROUP BY 1, 2
ON CONFLICT (site_id, day) DO UPDATE SET views = EXCLUDED.views, visitors = EXCLUDED.visitors;

INSERT INTO public.page_views_daily_posts (site_id, day, post_id, views)
SELECT pv.site_id, (pv.created_at AT TIME ZONE 'UTC')::date, pv.post_id, count(*)
FROM public.page_views pv JOIN public.posts p ON p.id = pv.post_id AND p.site_id = pv.site_id
GROUP BY 1, 2, 3
ON CONFLICT (site_id, day, post_id) DO UPDATE SET views = EXCLUDED.views;

INSERT INTO public.page_view_daily_visitors (site_id, day, visitor_hash)
SELECT DISTINCT site_id, (created_at AT TIME ZONE 'UTC')::date, visitor_hash
FROM public.page_views WHERE visitor_hash IS NOT NULL
ON CONFLICT DO NOTHING;

-- Tot el que el Resum necessita, en UNA crida i O(dies): sèrie diària, totals, el
-- període anterior (per a la tendència) i els 6 articles més vistos amb títol.
CREATE OR REPLACE FUNCTION public.site_stats(p_site_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT (now() AT TIME ZONE 'UTC')::date AS today,
           greatest(1, least(p_days, 366)) AS n
  ), series AS (
    SELECT gs::date AS day, coalesce(d.views, 0) AS views, coalesce(d.visitors, 0) AS visitors
    FROM bounds b
    CROSS JOIN generate_series(b.today - (b.n - 1), b.today, interval '1 day') AS gs
    LEFT JOIN public.page_views_daily d ON d.site_id = p_site_id AND d.day = gs::date
  ), prev AS (
    SELECT coalesce(sum(d.views), 0) AS views
    FROM bounds b JOIN public.page_views_daily d
      ON d.site_id = p_site_id AND d.day >= b.today - (2 * b.n - 1) AND d.day < b.today - (b.n - 1)
  ), top AS (
    SELECT dp.post_id, sum(dp.views)::int AS views
    FROM bounds b JOIN public.page_views_daily_posts dp
      ON dp.site_id = p_site_id AND dp.day >= b.today - (b.n - 1)
    GROUP BY dp.post_id ORDER BY views DESC, dp.post_id LIMIT 6
  )
  SELECT jsonb_build_object(
    'days', (SELECT n FROM bounds),
    'totalViews', (SELECT coalesce(sum(views), 0) FROM series),
    'uniqueVisitors', (SELECT coalesce(sum(visitors), 0) FROM series),
    'prevViews', (SELECT views FROM prev),
    'series', (SELECT jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'views', views, 'visitors', visitors) ORDER BY day) FROM series),
    'topPosts', coalesce((SELECT jsonb_agg(jsonb_build_object('postId', t.post_id, 'title', p.title, 'slug', p.slug, 'views', t.views) ORDER BY t.views DESC, t.post_id)
                          FROM top t JOIN public.posts p ON p.id = t.post_id AND p.site_id = p_site_id), '[]'::jsonb)
  );
$$;

-- Mateixa signatura que la 020 (targetes del dashboard): ara llegeix el rollup. El
-- dia de `p_since` compta sencer — la granularitat de l'agregat és el dia.
CREATE OR REPLACE FUNCTION public.site_view_counts(p_site_ids UUID[], p_since TIMESTAMPTZ)
RETURNS TABLE (site_id UUID, views BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.site_id, sum(d.views)::bigint
  FROM public.page_views_daily d
  WHERE d.site_id = ANY (p_site_ids) AND d.day >= (p_since AT TIME ZONE 'UTC')::date
  GROUP BY d.site_id;
$$;

-- Retenció (opcional, NO programada aquí): les files crues només calen per a anàlisi
-- de detall; els agregats ja ho tenen tot. Els visitants d'un dia tancat ja no
-- desdupliquen res. Programar-la (Supabase Cron o el cron diari de Vercel) és una
-- decisió de producte, no d'esquema.
CREATE OR REPLACE FUNCTION public.prune_analytics(p_keep_raw_days INTEGER DEFAULT 400)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE raw_deleted INTEGER; visitors_deleted INTEGER;
BEGIN
  DELETE FROM public.page_views WHERE created_at < now() - make_interval(days => greatest(p_keep_raw_days, 31));
  GET DIAGNOSTICS raw_deleted = ROW_COUNT;
  DELETE FROM public.page_view_daily_visitors WHERE day < (now() AT TIME ZONE 'UTC')::date - 2;
  GET DIAGNOSTICS visitors_deleted = ROW_COUNT;
  RETURN jsonb_build_object('raw', raw_deleted, 'visitors', visitors_deleted);
END;
$$;

-- ─── 5. Cerca ────────────────────────────────────────────────────────────────

-- El text, sense accents i en minúscules: una funció IMMUTABLE pròpia (unaccent no ho
-- és, i no depenem de cap extensió). Cobreix català, castellà, francès i anglès.
CREATE OR REPLACE FUNCTION public.carma_fold(t TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(lower(coalesce(t, '')),
    'àáâäãåèéêëìíîïòóôöõùúûüçñýÿœ·',
    'aaaaaaeeeeiiiiooooouuuucnyyo.')
$$;

-- La configuració de text de l'idioma de l'article; 'simple' si aquest Postgres no
-- la té (`catalan` existeix a partir de la 16).
CREATE OR REPLACE FUNCTION public.carma_ts_config(locale TEXT)
RETURNS REGCONFIG
LANGUAGE sql
STABLE
AS $$
  -- (No to_regconfig() exists; the catalogue lookup returns NULL when missing.)
  SELECT coalesce(
    (SELECT c.oid::regconfig FROM pg_catalog.pg_ts_config c
     WHERE c.cfgname = CASE split_part(coalesce(locale, 'ca'), '-', 1)
       WHEN 'ca' THEN 'catalan' WHEN 'es' THEN 'spanish' WHEN 'en' THEN 'english' ELSE 'simple' END
     LIMIT 1),
    'simple'::regconfig)
$$;

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS search TSVECTOR;

CREATE OR REPLACE FUNCTION public.posts_search_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE cfg REGCONFIG := public.carma_ts_config(NEW.default_locale);
BEGIN
  NEW.search :=
       setweight(to_tsvector(cfg, public.carma_fold(NEW.title)), 'A')
    || setweight(to_tsvector(cfg, public.carma_fold(NEW.excerpt)), 'B')
    || setweight(to_tsvector('simple', public.carma_fold(array_to_string(NEW.categories, ' ') || ' ' || array_to_string(NEW.tags, ' '))), 'B')
    || setweight(to_tsvector(cfg, public.carma_fold(left(regexp_replace(coalesce(NEW.content->>'html', ''), '<[^>]+>', ' ', 'g'), 60000))), 'C')
    -- Els altres idiomes de l'article: títols i resums, sense stemming.
    || setweight(to_tsvector('simple', public.carma_fold((
         SELECT string_agg(coalesce(v->>'title', '') || ' ' || coalesce(v->>'excerpt', ''), ' ')
         FROM jsonb_each(coalesce(NEW.i18n, '{}'::jsonb)) AS e(k, v)))), 'B');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_search_sync ON public.posts;
CREATE TRIGGER posts_search_sync
  BEFORE INSERT OR UPDATE OF title, excerpt, content, categories, tags, i18n, default_locale ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_search_sync();

-- Omple els existents (el trigger fa la feina: un UPDATE de la columna que vigila),
-- sense tocar `updated_at`.
SELECT pg_temp.quiet_posts(true);
UPDATE public.posts SET title = title WHERE search IS NULL;
SELECT pg_temp.quiet_posts(false);

CREATE INDEX IF NOT EXISTS posts_search_idx ON public.posts USING GIN (search);

-- Trigrames per al cercador del panell (subcadena al títol o a l'slug). pg_trgm pot
-- viure a `extensions` (projectes nous) o a `public` (antics): l'índex es crea amb
-- l'esquema on realment és.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
DO $$
DECLARE s TEXT;
BEGIN
  SELECT n.nspname INTO s FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm';
  EXECUTE format('CREATE INDEX IF NOT EXISTS posts_title_trgm ON public.posts USING GIN (title %I.gin_trgm_ops)', s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS posts_slug_trgm ON public.posts USING GIN (slug %I.gin_trgm_ops)', s);
END $$;

-- La cerca pública (W-next: /cerca del blog) i la del panell per contingut: el
-- ranking per pes (títol > resum/categories > cos), només publicats si es demana.
CREATE OR REPLACE FUNCTION public.search_posts(
  p_site_id UUID, p_query TEXT, p_published_only BOOLEAN DEFAULT true, p_limit INTEGER DEFAULT 24
)
RETURNS TABLE (id UUID, title TEXT, slug TEXT, excerpt TEXT, featured_image TEXT, published_at TIMESTAMPTZ, rank REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- A document was stemmed with ITS language's configuration; the query is stemmed
  -- with each of ours and OR'ed, so "consells" finds an article stemmed in Catalan
  -- and "consejos" one stemmed in Spanish, with no idea which the reader meant.
  WITH q AS (
    SELECT websearch_to_tsquery('simple', public.carma_fold(p_query))
        || websearch_to_tsquery(public.carma_ts_config('ca'), public.carma_fold(p_query))
        || websearch_to_tsquery(public.carma_ts_config('es'), public.carma_fold(p_query))
        || websearch_to_tsquery(public.carma_ts_config('en'), public.carma_fold(p_query)) AS tq
  )
  SELECT p.id, p.title, p.slug, p.excerpt, p.featured_image, p.published_at,
         ts_rank(p.search, q.tq) AS rank
  FROM public.posts p, q
  WHERE p.site_id = p_site_id
    AND (NOT p_published_only OR p.is_published)
    AND p.search @@ q.tq
  ORDER BY rank DESC, p.published_at DESC NULLS LAST
  LIMIT greatest(1, least(p_limit, 100));
$$;

-- ─── Accés ───────────────────────────────────────────────────────────────────
-- Les taules noves: RLS activat; lectura per a superadmin i membres del lloc, com
-- page_views (migració 015). Escriptures només pels triggers (SECURITY DEFINER).
ALTER TABLE public.site_counters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views_daily         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views_daily_posts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_view_daily_visitors ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_counters', 'page_views_daily', 'page_views_daily_posts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_superadmin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_member', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_superadmin())', t || '_select_superadmin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.site_users su WHERE su.site_id = %I.site_id AND su.user_id = auth.uid()))', t || '_select_member', t, t);
  END LOOP;
END $$;
-- page_view_daily_visitors: cap política → només el servidor (service role) la veu.

-- Les funcions: només el servidor (com la 029). Cap crida anònima ni d'usuari.
REVOKE ALL ON FUNCTION public.site_stats(UUID, INTEGER)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_view_counts(UUID[], TIMESTAMPTZ)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.posts_counts_by_site(UUID[])                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_posts(UUID, TEXT, BOOLEAN, INTEGER)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_site_counters()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_analytics(INTEGER)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_counters_apply(JSONB)                   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_stats(UUID, INTEGER)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.site_view_counts(UUID[], TIMESTAMPTZ)      TO service_role;
GRANT EXECUTE ON FUNCTION public.posts_counts_by_site(UUID[])               TO service_role;
GRANT EXECUTE ON FUNCTION public.search_posts(UUID, TEXT, BOOLEAN, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_site_counters()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_analytics(INTEGER)                   TO service_role;

NOTIFY pgrst, 'reload schema';
