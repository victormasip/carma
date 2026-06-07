-- =============================================================================
-- MIGRACIÓ 018: Blog d'exemple de Carma, assignat al superadmin
-- Executar al Supabase SQL Editor.
-- =============================================================================
-- "Com pot ser que Carma, un SaaS de blogs, no tingui blog?" — aquí el tens.
-- Crea un lloc «Carma» amb la identitat oficial de casa (paper càlid, daurat,
-- Plus Jakarta Sans), tres articles publicats i l'assigna al primer superadmin.
-- Idempotent: re-executar-la no duplica res (refresca el tema i els articles).
-- =============================================================================

-- Idempotent single-post seeder (insert only if the slug doesn't exist yet).
CREATE OR REPLACE FUNCTION public.seed_carma_post(
  p_site uuid, p_slug text, p_title text, p_excerpt text, p_content text, p_category text, p_days_ago int
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.posts WHERE site_id = p_site AND slug = p_slug) THEN
    RETURN;
  END IF;
  -- `content` is jsonb shaped { "html": "<…>" } (the render reads `.html`).
  INSERT INTO public.posts (site_id, title, slug, content, excerpt, is_published, author_name, categories, default_locale, created_at, updated_at)
  VALUES (p_site, p_title, p_slug, jsonb_build_object('html', p_content), p_excerpt, true, 'Equip Carma', ARRAY[p_category], 'ca',
          now() - (p_days_ago || ' days')::interval, now() - (p_days_ago || ' days')::interval);
END;
$fn$;

DO $$
DECLARE
  v_admin uuid;
  v_site  uuid;
BEGIN
  -- 1. El superadmin que serà propietari del blog d'exemple.
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'superadmin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE NOTICE 'Cap perfil superadmin trobat — s''omet el seed del blog Carma.';
    RETURN;
  END IF;

  -- 2. El lloc (idempotent pel nom). El insert només posa `name`, exactament com
  --    fa l'app (createSite), perquè la resta de columnes tinguin els seus defaults.
  SELECT id INTO v_site FROM public.sites WHERE name = 'Carma' LIMIT 1;
  IF v_site IS NULL THEN
    INSERT INTO public.sites (name) VALUES ('Carma') RETURNING id INTO v_site;
  END IF;

  -- 3. Assignar-lo al superadmin.
  INSERT INTO public.site_users (site_id, user_id) VALUES (v_site, v_admin)
  ON CONFLICT DO NOTHING;

  -- 4. Tema: la identitat oficial de Carma. La capçalera/peu s'emmagatzemen com a
  --    HTML "raw" amb classes úniques cx-ca-* (sense fuites de CSS). Upsert.
  INSERT INTO public.site_themes (
    site_id, design_tokens, extracted_header, extracted_footer,
    section_title, font_links, default_locale, is_enabled
  )
  VALUES (
    v_site,
    $json${
      "colorPrimary":"#1c1917","colorAccent":"#f5bc00","colorBg":"#F9F8F6","colorSurface":"#ffffff",
      "colorText":"#1c1917","colorMuted":"#78716c","colorBorder":"#ece8e1",
      "fontHeading":"'Plus Jakarta Sans', system-ui, sans-serif","fontBody":"'Plus Jakarta Sans', system-ui, sans-serif",
      "baseFontSize":"18px","radius":"14px","radiusLg":"24px","maxWidth":"1180px",
      "layout":"grid","columns":"3",
      "sectionTitleColor":"#1c1917","sectionTitleSize":"2.7rem","sectionTitleWeight":"800","sectionTitleAlign":"left",
      "headingWeight":"800","linkColor":"#a87f00","linkUnderline":"hover","blockquoteBorderColor":"#f5bc00"
    }$json$::jsonb,
    $hdr$<style>
.cx-cl-h{position:sticky;top:0;z-index:30;padding:.75rem 1rem;background:rgba(249,248,246,.6);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.cx-cl-bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:72rem;margin:0 auto;background:rgba(255,255,255,.82);border:1px solid rgba(28,25,23,.07);border-radius:1rem;box-shadow:0 1px 2px rgba(28,25,23,.05),0 4px 12px -8px rgba(28,25,23,.1);-webkit-backdrop-filter:saturate(180%) blur(14px);backdrop-filter:saturate(180%) blur(14px);padding:.6rem .9rem}
.cx-cl-brand{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:1.25rem;font-weight:800;letter-spacing:-.03em;color:#1c1917;text-decoration:none}
.cx-cl-dot{color:#f5bc00}
.cx-cl-nav{display:flex;align-items:center;gap:.25rem}
.cx-cl-nav a{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.9rem;font-weight:600;color:#57534e;text-decoration:none;padding:.5rem .75rem;border-radius:.5rem;transition:color .15s,background .15s}
.cx-cl-nav a:hover{color:#1c1917;background:#f5f4f1}
.cx-cl-nav a.on{color:#1c1917}
.cx-cl-actions{display:flex;align-items:center;gap:.5rem}
.cx-cl-login{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.9rem;font-weight:600;color:#1c1917;text-decoration:none;padding:.5rem .85rem;border-radius:.75rem}
.cx-cl-login:hover{background:#f5f4f1}
.cx-cl-cta{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.9rem;font-weight:800;color:#1a1400;background:linear-gradient(100deg,#b58f27,#f5bc00 30%,#ffe066 50%,#f5bc00 70%,#b58f27);background-size:200% 100%;padding:.6rem 1rem;border-radius:.75rem;text-decoration:none;box-shadow:0 10px 30px -6px rgba(245,188,0,.4)}
@media (max-width:820px){.cx-cl-nav,.cx-cl-login{display:none}}
</style>
<header class="cx-cl-h"><div class="cx-cl-bar">
  <a class="cx-cl-brand" href="/">Carma<span class="cx-cl-dot">.</span></a>
  <nav class="cx-cl-nav"><a href="/#com-funciona">Com funciona</a><a href="/#funcions">Funcions</a><a href="/blog" class="on">Blog</a><a href="/#preus">Preus</a></nav>
  <div class="cx-cl-actions"><a class="cx-cl-login" href="/login">Entra</a><a class="cx-cl-cta" href="/registre">Comença gratis</a></div>
</div></header>$hdr$,
    $ftr$<style>
.cx-cl-f{border-top:1px solid rgba(28,25,23,.07);background:#F9F8F6;padding:3rem 1rem}
.cx-cl-fin{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1.5rem;max-width:72rem;margin:0 auto}
.cx-cl-fbrand{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.cx-cl-fbrand .cx-cl-brand{font-size:1.15rem}
.cx-cl-fcopy{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.85rem;color:#a8a29e}
.cx-cl-fnav{display:flex;align-items:center;gap:1.25rem}
.cx-cl-fnav a{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.9rem;font-weight:600;color:#57534e;text-decoration:none}
.cx-cl-fnav a:hover{color:#a87f00}
</style>
<footer class="cx-cl-f"><div class="cx-cl-fin">
  <div class="cx-cl-fbrand"><a class="cx-cl-brand" href="/">Carma<span class="cx-cl-dot">.</span></a><span class="cx-cl-fcopy">© 2026 Carma · Fet amb daurat a Catalunya</span></div>
  <nav class="cx-cl-fnav"><a href="/blog">Blog</a><a href="/login">Entra</a><a href="/registre">Comença</a><a href="/#funcions">Funcions</a></nav>
</div></footer>$ftr$,
    'El blog',
    ARRAY['https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'],
    'ca',
    true
  )
  ON CONFLICT (site_id) DO UPDATE SET
    design_tokens    = EXCLUDED.design_tokens,
    extracted_header = EXCLUDED.extracted_header,
    extracted_footer = EXCLUDED.extracted_footer,
    section_title    = EXCLUDED.section_title,
    font_links       = EXCLUDED.font_links,
    default_locale   = EXCLUDED.default_locale,
    is_enabled       = true;

  -- 5. Tres articles publicats (idempotents pel slug dins del lloc).
  PERFORM seed_carma_post(v_site,
    'benvingut-al-teu-blog-carma',
    'Benvingut al teu nou blog amb Carma',
    'Enganxa una URL i tindràs un blog idèntic a la teva marca en 30 segons. Així funciona Carma.',
    '<p>Carma converteix la identitat visual del teu lloc web en un blog natiu, ràpid i preciós — sense que toquis ni una línia de codi. Enganxes una URL, clonem la teva capçalera, el teu peu, els teus colors i les teves tipografies, i et lliurem un espai a punt per escriure.</p><h2>Tot el que ja t''agrada, ara escrivible</h2><p>El nostre editor d''estil Notion fa que publicar sigui un plaer: comandes «/», blocs rics, galeries i destacats. Tu escrius; nosaltres ens encarreguem que es vegi impecable a tots els dispositius.</p><blockquote>El millor disseny és el que ni notes: simplement funciona, i la teva veu brilla.</blockquote><p>Quan publiques, el teu article apareix al teu domini amb la teva marca. Cap fricció, cap CSS trencat.</p>',
    'Producte', 2);

  PERFORM seed_carma_post(v_site,
    'per-que-el-disseny-del-teu-blog-importa',
    'Per què el disseny del teu blog importa (més del que penses)',
    'La primera impressió es decideix en mil·lisegons. Un blog ben dissenyat genera confiança abans de la primera paraula.',
    '<p>El contingut és el rei, però el disseny és el palau on viu. Un blog coherent amb la teva marca transmet professionalitat i fa que la gent es quedi a llegir.</p><h2>Coherència de marca</h2><p>Quan el blog respira els mateixos colors i tipografies que la teva web, el visitant no nota cap salt. És casa teva, de principi a fi.</p><h2>Llegibilitat primer</h2><p>Espai en blanc generós, una bona alçada de línia i una mida de lletra còmoda. Llegir hauria de ser fàcil, sempre.</p><p>Amb Carma tot això ve de sèrie — i ho pots afinar al Theme Studio en directe.</p>',
    'Disseny', 9);

  PERFORM seed_carma_post(v_site,
    'escriu-millor-5-idees',
    'Escriu millor: 5 idees per a articles que enganxen',
    'Un bon article no s''improvisa. Aquestes cinc idees t''ajudaran a escriure peces que la gent vol llegir fins al final.',
    '<p>Escriure per a un blog és un ofici que es pot aprendre. Aquí tens cinc principis que funcionen.</p><h2>1. Comença pel final</h2><p>Tingues clara la idea que vols que el lector s''emporti. Tota la peça hi ha de remar.</p><h2>2. Frases curtes</h2><p>El ritme curt es llegeix sol. Reserva les frases llargues per a quan vulguis que el lector respiri.</p><h2>3. Subtítols que guien</h2><p>La gent escaneja. Uns bons subtítols són un mapa del teu article.</p><h2>4. Una idea per paràgraf</h2><p>Si un paràgraf fa dues coses, parteix-lo.</p><h2>5. Revisa en veu alta</h2><p>Si tropeces llegint-ho, el lector també ho farà.</p><p>I recorda: publicat és millor que perfecte.</p>',
    'Escriptura', 16);
END $$;

-- Helper no longer needed once the seed has run.
DROP FUNCTION IF EXISTS public.seed_carma_post(uuid, text, text, text, text, text, int);
