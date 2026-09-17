-- =============================================================================
-- MIGRACIÓ 036: La comunitat — poble, comentaris, aplaudiments i validació (I6)
-- Executar al Supabase SQL Editor. Additiva i idempotent.
-- =============================================================================
-- Tres coses que el Pla d'Interacció donava per fetes i no existien enlloc:
--
--   1. EL POBLE. El mapa de la comunitat a la landing no pot dibuixar res si no
--      preguntem mai d'on és la gent. `profiles.town` és la dada que el fa
--      possible; `profiles.country` la manté honesta quan sortim dels Països
--      Catalans. És del PERFIL, no del lloc: una persona viu en un poble encara
--      que tingui tres blogs.
--
--   2. PARLAR I APLAUDIR. Un blog al qual no es pot contestar no és una veu, és
--      un tauler d'anuncis. Els mòduls `comments` i `likes` escriuen aquí.
--
--   3. LA VALIDACIÓ (I6). Un autor pot DEMANAR que algú li llegeixi l'esborrany
--      abans de publicar-lo. `posts.review_requested_at` és la bandera que posa
--      l'article a la cua; `article_reviews` hi guarda la resposta.
--
-- Res d'això trenca cap lectura existent: totes les columnes són opcionals i
-- totes les taules noves. El codi que les fa servir tracta 42703/42P01 com a
-- "encara no hi és" i segueix funcionant.
-- =============================================================================

-- ─── 1. El poble de qui escriu ───────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS town    TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

-- El mapa agrupa per poble: un índex parcial perquè comptar-los sigui barat.
CREATE INDEX IF NOT EXISTS profiles_town_idx
  ON public.profiles (lower(town))
  WHERE town IS NOT NULL AND town <> '';

-- ─── 2. Aplaudiments ─────────────────────────────────────────────────────────
-- Un lector anònim s'identifica per una empremta efímera (hash d'IP + user
-- agent + l'id del lloc). NO guardem ni IP ni user agent: només el hash, que no
-- serveix per a res més que per impedir que el mateix navegador compti mil cops.
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  site_id    UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  reader_key TEXT NOT NULL,
  count      SMALLINT NOT NULL DEFAULT 1 CHECK (count BETWEEN 1 AND 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, reader_key)
);
CREATE INDEX IF NOT EXISTS post_likes_post_idx ON public.post_likes (post_id);

-- ─── 3. Comentaris verificats ────────────────────────────────────────────────
-- "Verificat" = hi ha un correu darrere i el propietari l'ha aprovat. El
-- correu NO es mostra mai públicament: la lectura pública només retorna nom,
-- cos i data (vegeu /api/interactions).
CREATE TABLE IF NOT EXISTS public.post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  site_id    UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  author     TEXT NOT NULL CHECK (char_length(author) BETWEEN 2 AND 80),
  email      TEXT,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 2 AND 4000),
  approved   BOOLEAN NOT NULL DEFAULT false,
  reported   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- La consulta pública és sempre "els aprovats d'aquest article, els nous a dalt".
CREATE INDEX IF NOT EXISTS post_comments_public_idx
  ON public.post_comments (post_id, created_at DESC)
  WHERE approved AND NOT reported;
-- La cua de moderació del propietari.
CREATE INDEX IF NOT EXISTS post_comments_pending_idx
  ON public.post_comments (site_id, created_at DESC)
  WHERE NOT approved;

-- ─── 4. I6 — demanar validació d'un esborrany ────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- La cua setmanal llegeix "esborranys que esperen lector, els més antics
-- primer". Parcial: només les files que hi són a la cua ocupen índex.
CREATE INDEX IF NOT EXISTS posts_review_queue_idx
  ON public.posts (review_requested_at)
  WHERE review_requested_at IS NOT NULL;

-- La resposta del revisor. Els CHECK SÓN la política de moderació: un
-- "m'agrada molt" de dotze caràcters no val 25 punts.
CREATE TABLE IF NOT EXISTS public.article_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  praise      TEXT NOT NULL CHECK (char_length(praise)     BETWEEN 80 AND 600),
  suggestion  TEXT NOT NULL CHECK (char_length(suggestion) BETWEEN 80 AND 600),
  pre_publish BOOLEAN NOT NULL DEFAULT false,
  reported    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS article_reviews_once_idx
  ON public.article_reviews (post_id, reviewer_id);

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────
-- Cap d'aquestes taules s'escriu mai des del client amb la clau anon: tot passa
-- per /api/interactions amb el service role, que valida forma, aplica el límit
-- per IP i decideix què és públic. Per tant RLS activat i SENSE política =
-- tancat per a tothom excepte el service role. És el mateix model que `leads`.
ALTER TABLE public.post_likes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_reviews ENABLE ROW LEVEL SECURITY;
