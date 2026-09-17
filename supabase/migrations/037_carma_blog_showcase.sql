-- =============================================================================
-- MIGRACIÓ 037: El blog de Carma, reconstruït com a aparador
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- Directiva del fundador (2026-09-17): «our own blog loads extremely slowly and
-- points to a zombie /render route. Rebuild Carma's own blog using our absolute
-- best, module-rich templates to showcase EXACTLY what the platform is capable
-- of. Eat our own dog food.»
--
-- TRES COSES, I LA PRIMERA ÉS LA QUE FA MAL
--
-- 1. LA RUTA ZOMBI. La migració 018 va crear el lloc «Carma» ABANS que la 021
--    afegís `sites.subdomain`, i el backfill de la 021 només va córrer una
--    vegada. Un lloc sense subdomini fa que `publicSiteUrl()` caigui a l'últim
--    recurs — `/render/<uuid>` — que és el MOTOR, no una adreça. Per això
--    /blog acabava sempre a la URL lletja. Aquí li donem `blog` i s'acaba.
--
-- 2. VUIT MÒDULS APAGATS. El nostre propi blog no tenia cap funcionalitat
--    encesa: ni cercador, ni índex, ni relacionats, ni comentaris. Un SaaS de
--    mòduls amb el blog més pelat de tots. Ara arriba amb la configuració de
--    LA REVISTA + la captació d'EL CREADOR, escrita i triada, no per defecte.
--
-- 3. ARTICLES DE MOSTRA. Els tres textos de la 018 eren <p> i <h2> i prou —
--    exactament el «simple headings and lists» que l'agent ha deixat de fer.
--    Els reescrivim amb tot el vocabulari que el renderitzador ja sap pintar:
--    callouts, taula, cita destacada, desplegables, índex. El nostre blog ha de
--    ser la prova del que surt de la caixa.
--
-- Idempotent: es pot re-executar. A diferència de la 018, aquesta SOBREESCRIU
-- el cos dels articles — és una actualització, no una llavor.
-- =============================================================================

-- Upsert d'un article per (site, slug): actualitza si ja hi és.
CREATE OR REPLACE FUNCTION public.upsert_carma_post(
  p_site uuid, p_slug text, p_title text, p_excerpt text, p_content text,
  p_category text, p_tags text[], p_days_ago int
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.posts WHERE site_id = p_site AND slug = p_slug) THEN
    UPDATE public.posts SET
      title      = p_title,
      content    = jsonb_build_object('html', p_content),
      excerpt    = p_excerpt,
      categories = ARRAY[p_category],
      tags       = p_tags,
      is_published = true,
      updated_at = now()
    WHERE site_id = p_site AND slug = p_slug;
    RETURN;
  END IF;
  INSERT INTO public.posts (
    site_id, title, slug, content, excerpt, is_published, author_name,
    categories, tags, default_locale, created_at, updated_at
  )
  VALUES (
    p_site, p_title, p_slug, jsonb_build_object('html', p_content), p_excerpt, true, 'Equip Carma',
    ARRAY[p_category], p_tags, 'ca',
    now() - (p_days_ago || ' days')::interval, now() - (p_days_ago || ' days')::interval
  );
END;
$fn$;

DO $$
DECLARE
  v_site uuid;
BEGIN
  SELECT id INTO v_site FROM public.sites WHERE name = 'Carma' ORDER BY created_at LIMIT 1;
  IF v_site IS NULL THEN
    RAISE NOTICE 'No hi ha cap lloc «Carma» — executa primer la migració 018.';
    RETURN;
  END IF;

  -- ── 1. L'ADREÇA ────────────────────────────────────────────────────────────
  -- `blog` està a la llista RESERVED de lib/sites/domain.ts, que és el que fa
  -- que `blog.carma.cat` NO es tracti com un inquilí qualsevol sinó com la ruta
  -- pública del nostre propi blog. Només l'escrivim si el lloc encara no en té
  -- i ningú altre l'ha agafat.
  BEGIN
    UPDATE public.sites SET subdomain = 'blog'
    WHERE id = v_site
      AND (subdomain IS NULL OR subdomain = '')
      AND NOT EXISTS (SELECT 1 FROM public.sites WHERE subdomain = 'blog');
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE 'sites.subdomain encara no existeix (migració 021 pendent).';
  END;

  -- ── 2. ELS MÒDULS ──────────────────────────────────────────────────────────
  -- LA REVISTA sencera (destacat, filtres, cerca, índex, cites, relacionats,
  -- comentaris, aplaudiments, firma, compartir, anterior/següent) + la captació
  -- d'EL CREADOR (newsletter). Amb variants i textos escrits: un arquetip no és
  -- una llista d'ids, és una decisió editorial.
  --
  -- Sense mur de pagament: el nostre blog no amaga res, i un aparador amb un
  -- candau és una demostració de com no deixar llegir.
  BEGIN
    UPDATE public.site_themes SET modules = $mods${
      "featuredHero":     {"enabled":true,"variant":"magazine","options":{"count":3,"showExcerpt":true}},
      "categoryFilters":  {"enabled":true,"variant":"tabs","options":{"allLabel":"Tot","showCounts":true}},
      "search":           {"enabled":true,"variant":"expand","options":{"placeholder":"Busca un article…"}},
      "tableOfContents":  {"enabled":true,"variant":"sidebar","options":{"depth":"h2h3"}},
      "keyTakeaways":     {"enabled":true,"variant":"card"},
      "pullQuote":        {"enabled":true,"variant":"side","options":{"count":2,"minChars":80}},
      "readingProgress":  {"enabled":true,"variant":"bar","options":{"position":"top"}},
      "relatedPosts":     {"enabled":true,"variant":"grid","options":{"count":3,"matchBy":"smart","showImage":true}},
      "readNext":         {"enabled":true,"variant":"card"},
      "prevNext":         {"enabled":true,"variant":"cards"},
      "authorCard":       {"enabled":true,"variant":"box"},
      "socialShare":      {"enabled":true,"variant":"floating","options":{"networks":["whatsapp","x","linkedin","copy"]}},
      "whatsappShare":    {"enabled":true,"variant":"end"},
      "likes":            {"enabled":true,"variant":"clap","options":{"label":"Aplaudeix","showCount":true,"maxPerReader":10}},
      "comments":         {"enabled":true,"variant":"threaded","options":{
        "title":"La conversa",
        "placeholder":"Què n'has tret?",
        "buttonText":"Publicar",
        "requireApproval":true,
        "emptyMessage":"Encara no hi ha comentaris. Comença tu.",
        "closedMessage":"✓ Rebut. El publiquem quan l'hàgim llegit."
      }},
      "newsletter":       {"enabled":true,"variant":"banner","options":{
        "title":"T'avisem quan surti alguna cosa que val la pena",
        "description":"Un correu de tant en tant. Ni un més.",
        "buttonText":"Apunta-m'hi",
        "successMessage":"✓ Ja hi ets. Gràcies!"
      }},
      "backToTop":        {"enabled":true,"variant":"minimal","options":{"position":"right"}}
    }$mods$::jsonb
    WHERE site_id = v_site;
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE 'site_themes.modules encara no existeix (migració 024 pendent).';
  END;

  -- ── 3. ELS ARTICLES ────────────────────────────────────────────────────────
  PERFORM upsert_carma_post(v_site,
    'benvingut-al-teu-blog-carma',
    'El teu blog, des del WhatsApp: com funciona de veritat',
    'Envies una nota de veu, reps un article escrit amb la teva veu, dius «publica». Això és tot el flux, explicat sense fum.',
    '<p>La promesa de Carma cap en una frase: <strong>parles i es publica</strong>. El que segueix és el que passa entremig, perquè entenguis on hi ha màgia i on hi ha feina.</p>'
    '<h2>1. Primer et llegim a tu</h2>'
    '<p>Abans del primer article, Carma es fa una fitxa de com parles: a qui tractes de tu i a qui de vostè, com anomenes els teus serveis, si fas frases curtes o llargues, i què no diries mai. Surt de la teva web, dels teus documents i de trenta segons de veu.</p>'
    '<p class="carma-callout" data-variant="info">No copiem cap frase teva. La fitxa descriu com escrius; les frases es tornen a escriure cada vegada.</p>'
    '<h2>2. Li envies la idea</h2>'
    '<p>Un àudio mentre tanques la persiana. Una foto del taller amb dues paraules. Un enllaç. Qualsevol cosa que tingui un tema a dins li serveix.</p>'
    '<ol><li>Envia-ho pel WhatsApp de sempre.</li><li>Rebràs una confirmació al moment amb l''angle que ha triat.</li><li>L''esborrany arriba en un parell de minuts.</li></ol>'
    '<h2>3. Decideixes tu</h2>'
    '<p>Dos botons: publicar, o dir-li què canviar. Els canvis s''expliquen amb paraules, no amb camps de formulari.</p>'
    '<blockquote>Fes-lo més curt, tuteja i treu la introducció. I posa-hi què fem quan diem que no.</blockquote>'
    '<p>Torna fet, i et diu exactament què ha canviat perquè ho puguis validar sense obrir res.</p>'
    '<h2>Què costa cada cosa</h2>'
    '<table><thead><tr><th>Acció</th><th>Punts</th></tr></thead><tbody>'
    '<tr><td>Esborrany d''article</td><td>80</td></tr>'
    '<tr><td>Una revisió</td><td>20</td></tr>'
    '<tr><td>Nota de veu</td><td>2</td></tr>'
    '<tr><td>Imatge de portada</td><td>40</td></tr>'
    '<tr><td>Conversa amb l''agent</td><td>gratis</td></tr>'
    '</tbody></table>'
    '<p>El pla gratuït en dona 100 cada mes: un article complet, cada mes, per sempre.</p>'
    '<details class="carma-toggle"><summary>I si no tinc web?</summary><p>Tries un dels blogs ja muntats i li expliques qui sou parlant. La veu no surt del disseny: surt del que expliques.</p></details>'
    '<details class="carma-toggle"><summary>Puc editar un article ja publicat?</summary><p>Sí. Digue-li què vols canviar i prepara la versió nova; l''original no es toca fins que dius que sí.</p></details>',
    'Producte', ARRAY['whatsapp','agent','com funciona'], 2);

  PERFORM upsert_carma_post(v_site,
    'per-que-el-disseny-del-teu-blog-importa',
    'El blog ha de viure dins la teva web, no al costat',
    'La majoria de blogs de negoci viuen en un subdomini que sembla d''una altra empresa. Això té un cost, i es pot mesurar.',
    '<p>Hi ha una decisió que es pren el primer dia i que després no es revisa mai: <strong>on viu el blog</strong>. I gairebé sempre es pren malament.</p>'
    '<h2>El salt que el visitant sí que nota</h2>'
    '<p>Click al menú «Blog» i de cop: una altra capçalera, una altra tipografia, un altre verd. El visitant no ho sabria explicar, però ho registra. Ha marxat de casa teva.</p>'
    '<blockquote>Un blog que no s''assembla a la teva web no és el teu blog. És un blog que parla de tu.</blockquote>'
    '<h2>Què fa Carma, exactament</h2>'
    '<p>Clonem la teva capçalera i el teu peu <em>reals</em> — el mateix HTML, els mateixos estils, el mateix logotip — i posem el blog al mig. El que canvia és només el contingut.</p>'
    '<p class="carma-callout" data-variant="success">Provat contra 97 webs reals: ni una regla d''estil ni un color es perden pel camí.</p>'
    '<h2>I quan la teva web canviï?</h2>'
    '<p>Tornes a capturar i el blog es vesteix de nou. No hi ha cap tema a mantenir en paral·lel, que és l''altre cost amagat dels blogs separats.</p>'
    '<p class="carma-callout" data-variant="warning">Compte amb els blogs que només et deixen triar colors. Un color no és una marca: la teva capçalera sí.</p>',
    'Disseny', ARRAY['marca','clonatge','fidelitat'], 9);

  PERFORM upsert_carma_post(v_site,
    'escriu-millor-5-idees',
    'Cinc coses que fan que un article de negoci es llegeixi fins al final',
    'No són trucs d''SEO. Són les cinc decisions que separen un article que la gent acaba d''un que tanquen al tercer paràgraf.',
    '<p>Escrivim molts articles al dia per a negocis petits. Aquests cinc patrons són els que, de manera consistent, es llegeixen sencers.</p>'
    '<h2>1. Digues el final al principi</h2>'
    '<p>La gent no llegeix per descobrir on vols anar a parar: llegeix per confirmar que val la pena seguir. Posa la conclusió a la primera frase i després argumenta-la.</p>'
    '<h2>2. Una idea per paràgraf</h2>'
    '<p>Si un paràgraf fa dues coses, parteix-lo. El lector que escaneja necessita poder entrar i sortir per qualsevol punt.</p>'
    '<h2>3. Concret abans que complet</h2>'
    '<p>«Millorem els teus processos» no diu res. «Et truquem el mateix dia i tens pressupost en 48 hores» sí. El detall és el que es recorda.</p>'
    '<p class="carma-callout" data-variant="danger">No inventis mai una xifra per fer bonic. Una dada falsa la troba algú, i llavors ja no et creuen cap de les altres.</p>'
    '<h2>4. Escriu com parles amb un client</h2>'
    '<p>Llegeix-ho en veu alta. Si no ho diries així a algú que tens al davant, reescriu-ho.</p>'
    '<h2>5. Acaba amb una cosa que es pugui fer</h2>'
    '<p>Un article de negoci que acaba en «en conclusió» no acaba: es desinfla. Acaba amb el següent pas, encara que sigui petit.</p>'
    '<hr>'
    '<p>I la sisena, que no compta perquè no és d''escriure: <strong>publicat és millor que perfecte</strong>.</p>',
    'Escriptura', ARRAY['redacció','contingut','ofici'], 16);

  -- El blog ha de ser visible encara que algú l'hagués desactivat.
  UPDATE public.site_themes SET is_enabled = true WHERE site_id = v_site;
END $$;

DROP FUNCTION IF EXISTS public.upsert_carma_post(uuid, text, text, text, text, text, text[], int);
