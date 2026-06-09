import { type NextRequest } from 'next/server'
import { PARAM_MAP } from '@/lib/render/embedParams'
import { LOCALES, LOCALE_META, normalizeLocale } from '@/lib/i18n/config'
import { tr } from '@/lib/i18n/messages'

// The Magic Wand embed loader.
//
// A single <script> tag the customer drops anywhere on their site. It renders
// the Carma blog into a Shadow DOM right where the tag sits, so OUR token-driven
// styles are injected and isolated: the customer's native CSS cannot bleed in,
// and ours cannot leak out. The blog looks identical to the standalone /render
// page on ANY external site — solving the "raw HTML loses all styles" problem
// without an iframe.
//
// It fetches the style-isolated fragment ({ css, html, fonts }) from the
// /render route (format=fragment), hoists font stylesheets to the host <head>,
// and handles intra-blog navigation (listing ⇄ article) by swapping the shadow
// content in place — no full page reload.
//
// Mounting (two paths):
//   · Mount divs (preferred, used by the Carma WordPress plugin): the host emits
//     one or more `<div data-carma-embed="<siteId>" data-carma-params="…">` and the
//     loader renders EACH into its own shadow root. Placement never depends on
//     document.currentScript, so it survives WP script optimizers (defer/combine)
//     and works for several embeds on one page.
//   · Legacy bare <script> (the dashboard's classic snippet): no mount div, so the
//     loader positions relative to its own <script> tag (document.currentScript),
//     honouring an optional data-carma-target. Unchanged behaviour.

export const dynamic = 'force-dynamic'

function buildScript(origin: string, siteId: string, params: string, localesJson: string, uiLocale: string, msgJson: string): string {
  // Everything below is plain ES5-ish browser JS emitted as a string. We keep it
  // dependency-free and use string concatenation (no template literals) so it can
  // live safely inside this TS template literal.
  const ORIGIN = JSON.stringify(origin)
  const SITEID = JSON.stringify(siteId)
  const PARAMS = JSON.stringify(params ? '&' + params : '')
  const UI = JSON.stringify(uiLocale)

  return `(function(){
  var ORIGIN = ${ORIGIN};
  var SITEID = ${SITEID};
  var EXTRA = ${PARAMS};
  var UI = ${UI};
  var MSG = ${msgJson};
  var LOC = ${localesJson};
  var CODES = LOC.codes || [];
  var ALIAS = LOC.alias || {};
  var current = document.currentScript;

  function fragUrl(path, lang, extra){
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    // Forward UI so the content engine localises its own 404 strings to match
    // the host's language, same as the loader's baked-in status messages.
    return ORIGIN + path + sep + 'format=fragment' + (lang ? ('&lang=' + lang) : '') + (UI ? ('&ui=' + UI) : '') + (extra || '');
  }

  // Map any token (code, native name, label, region-tagged) to a supported locale.
  function normLocale(s){
    if (!s) return null;
    s = String(s).toLowerCase().trim();
    if (ALIAS[s]) return ALIAS[s];
    var base = s.split('-')[0];
    if (ALIAS[base]) return ALIAS[base];
    if (CODES.indexOf(base) >= 0) return base;
    return null;
  }

  // Split an internal /render href into its path + lang query.
  function parseRenderHref(href){
    var q = href.indexOf('?');
    var path = q >= 0 ? href.slice(0, q) : href;
    var lang = '';
    var m = href.match(/[?&]lang=([a-zA-Z-]+)/);
    if (m){ var c = normLocale(m[1]); if (c) lang = c; }
    return { path: path, lang: lang };
  }

  // Is the link inside a "language switcher"-ish container (class/id hint)?
  function inLangContext(a, stop){
    var n = a;
    while (n && n !== stop){
      var cls = (n.getAttribute && n.getAttribute('class')) || '';
      var id = (n.getAttribute && n.getAttribute('id')) || '';
      if (/lang|locale|idiom|language|lengua|lleng/i.test(cls + ' ' + id)) return true;
      n = n.parentNode;
    }
    return false;
  }

  // Detect the target locale of a clicked header link, if it's a language switch.
  function detectHeaderLocale(a, header){
    var attr = a.getAttribute('hreflang') || a.getAttribute('data-locale') || a.getAttribute('data-lang') || a.getAttribute('lang');
    var c = normLocale(attr);
    if (c) return c;
    var href = a.getAttribute('href') || '';
    var m = href.match(/[?&](?:lang|locale|hl|lng)=([a-zA-Z-]+)/);
    if (m){ c = normLocale(m[1]); if (c) return c; }
    var txt = (a.textContent || '').replace(/\\s+/g, ' ').trim();
    if (txt && txt.length <= 14){ c = normLocale(txt); if (c) return c; }
    // Path-based (/en/, /es) only when the link sits in a language-ish container,
    // so we never hijack ordinary nav links that happen to start with 2 letters.
    if (inLangContext(a, header)){
      var seg = href.match(/\\/([a-zA-Z]{2})(?:[\\/?#]|$)/);
      if (seg){ c = normLocale(seg[1]); if (c) return c; }
    }
    return null;
  }

  // Resolve the mount point: an explicit data-carma-target, else right after the
  // script tag, else <body>. Guard against double-mounting.
  function resolveMount(){
    if (current && current.getAttribute('data-carma-mounted')) return null;
    var host = document.createElement('div');
    host.className = 'carma-embed';
    host.setAttribute('data-carma-embed', SITEID);
    // Flag the host itself (not just the script) as mounted, so a second
    // identical legacy <script> — whose start() scan now sees this created div —
    // skips it instead of calling attachShadow() on an already-shadowed node.
    host.setAttribute('data-carma-mounted', '1');
    var targetSel = current && current.getAttribute('data-carma-target');
    var anchor = targetSel ? document.querySelector(targetSel) : null;
    if (anchor) { anchor.appendChild(host); }
    else if (current && current.parentNode) { current.parentNode.insertBefore(host, current.nextSibling); }
    else { document.body.appendChild(host); }
    if (current) current.setAttribute('data-carma-mounted', '1');
    return host;
  }

  function hoistFonts(fonts){
    if (!fonts || !fonts.length) return;
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    for (var i = 0; i < fonts.length; i++){
      var href = fonts[i];
      if (!href) continue;
      if (head.querySelector('link[data-carma-font="' + cssEscape(href) + '"]')) continue;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-carma-font', href);
      head.appendChild(link);
    }
  }
  function cssEscape(s){ return String(s).replace(/["\\\\]/g, '\\\\$&'); }

  // The cloned header/footer ship as Declarative Shadow DOM (<template
  // shadowrootmode>). Set via innerHTML those templates are inert, so we attach
  // each shadow root ourselves and wire its menu interactivity.
  function wireMenu(sr){
    try{
      sr.addEventListener('click', function(e){
        var t=e.target; if(!t||!t.closest) return;
        var trg=t.closest('[aria-expanded],[aria-haspopup],[data-toggle],.menu-toggle,.hamburger,.nav-toggle,[class*="burger"]');
        if(!trg||!sr.contains(trg)) return;
        if(trg.tagName==='A' && trg.getAttribute('href') && trg.getAttribute('href')!=='#') return;
        try{
          var open=trg.getAttribute('aria-expanded')==='true';
          trg.setAttribute('aria-expanded', open?'false':'true');
          ['open','is-open','active','is-active','show'].forEach(function(c){ trg.classList.toggle(c,!open); });
          var ctl=trg.getAttribute('aria-controls');
          var tgt=ctl?sr.getElementById(ctl):(trg.nextElementSibling||trg.parentNode);
          if(tgt&&tgt.classList){ ['open','is-open','active','is-active','show'].forEach(function(c){ tgt.classList.toggle(c,!open); }); }
          e.preventDefault();
        }catch(err){}
      });
    }catch(e){}
  }
  function attachShadows(scope){
    try{
      var tpls=scope.querySelectorAll('template[shadowrootmode]');
      for(var i=0;i<tpls.length;i++){
        var tpl=tpls[i]; var host=tpl.parentNode;
        if(!host||!host.attachShadow||host.shadowRoot) continue;
        try{ var s=host.attachShadow({mode:tpl.getAttribute('shadowrootmode')||'open'}); s.appendChild(tpl.content); tpl.remove(); wireMenu(s); }catch(e){}
      }
    }catch(e){}
  }

  function render(root, frag){
    hoistFonts(frag.fonts);
    var style = document.createElement('style');
    style.textContent = frag.css || '';
    root.innerHTML = '';
    root.appendChild(style);
    var wrap = document.createElement('div');
    wrap.innerHTML = frag.html || '';
    root.appendChild(wrap);
    // The embed fragment is OUR blog only (no client chrome / nested shadow), but
    // attach any declarative shadow roots defensively in case future content uses
    // them — a no-op otherwise.
    attachShadows(wrap);
  }

  function showMessage(root, msg){
    root.innerHTML = '<div style="font-family:system-ui,sans-serif;color:#888;padding:2rem;text-align:center;font-size:14px">' + msg + '</div>';
  }

  function load(root, url){
    showMessage(root, MSG.loading);
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(r){ if(!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function(frag){
        if (frag && frag.error) { showMessage(root, frag.error); return; }
        render(root, frag);
      })
      .catch(function(){ showMessage(root, MSG.loadError); });
  }

  function shadowOf(el){ return el.attachShadow ? el.attachShadow({ mode: 'open' }) : el; }

  // Mount ONE blog instance into a shadow root. Each instance keeps its OWN view
  // state (path + locale) and its OWN param payload, so several embeds can live on
  // one page without sharing state. NOTHING here depends on document.currentScript
  // — placement is decided by the caller (an explicit mount div, or the legacy
  // fallback), which is what makes the WP plugin path robust to script optimizers.
  function mountInstance(hostEl, root, extra){
    var st = { path: '/render/' + SITEID, lang: '' };

    // Delegated click handler (also covers nodes added later — no MutationObserver
    // needed). Handles BOTH our intra-blog links AND the cloned header's native
    // language switcher.
    root.addEventListener('click', function(e){
      // composedPath() surfaces the real <a> even when it lives inside the cloned
      // header/footer's nested shadow root (events retarget at shadow boundaries).
      var path = (e.composedPath && e.composedPath()) || [e.target];
      var a = null, header = null;
      for (var i = 0; i < path.length; i++){
        var n = path[i];
        if (!n || !n.tagName) continue;
        if (!a && n.tagName === 'A') a = n;
        if (!header && n.getAttribute && n.getAttribute('data-carma-chrome') === 'header') header = n;
      }
      if (!a) return;
      var href = a.getAttribute('href') || '';

      // 1. Our own /render links (cards, breadcrumb, language pills — including the
      //    switcher inside the cloned header): swap the shadow content in place.
      if (href.indexOf('/render/' + SITEID) === 0){
        e.preventDefault();
        var p = parseRenderHref(href);
        st.path = p.path; st.lang = p.lang;
        load(root, fragUrl(st.path, st.lang, extra));
        if (hostEl && hostEl.scrollIntoView) hostEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      // 2. A native language switcher reused inside the cloned header: re-render
      //    the CURRENT view in the chosen locale instead of leaving for the source.
      if (header){
        var loc = detectHeaderLocale(a, header);
        if (loc && loc !== st.lang){
          e.preventDefault();
          st.lang = loc;
          load(root, fragUrl(st.path, st.lang, extra));
        }
      }
    });

    load(root, fragUrl(st.path, st.lang, extra));
  }

  function start(){
    // Preferred path: explicit mount divs (emitted by the Carma WordPress plugin,
    // or any host wanting deterministic placement). Mount EVERY still-unmounted div
    // for THIS site. This is robust to optimizer/defer plugins that null
    // document.currentScript, and to combiners that dedupe identical <script> src
    // across multiple shortcodes — one surviving execution mounts them all.
    var divs = document.querySelectorAll('div[data-carma-embed]');
    var sawOurDiv = false;
    for (var i = 0; i < divs.length; i++){
      var el = divs[i];
      var sid = el.getAttribute('data-carma-embed');
      if (sid && sid !== SITEID) continue; // belongs to another site's loader
      sawOurDiv = true;
      if (el.getAttribute('data-carma-mounted')) continue; // already handled by a sibling script
      el.setAttribute('data-carma-mounted', '1');
      // Per-div params override the script-baked EXTRA, so two embeds of the same
      // site with different token tweaks never cross-contaminate.
      var dp = el.getAttribute('data-carma-params');
      var extra = dp != null ? (dp ? '&' + dp : '') : EXTRA;
      mountInstance(el, shadowOf(el), extra);
    }
    // If ANY mount div for this site exists, the divs own placement — never fall
    // back to the legacy path (a second identical <script> must not add a stray
    // blog after the tag).
    if (sawOurDiv) return;

    // Legacy path: a bare <script> with no mount div (the dashboard's classic
    // snippet, including its optional data-carma-target). Positioned relative to
    // the script tag via document.currentScript — unchanged behaviour.
    var host = resolveMount();
    if (!host) return;
    mountInstance(host, shadowOf(host), EXTRA);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const origin = request.nextUrl.origin

  // Forward only the known design-token overrides (drop anything unrecognized so
  // we never bake arbitrary query junk into the loader's fetch URLs).
  const sp = new URLSearchParams()
  for (const key of Object.keys(PARAM_MAP)) {
    const v = request.nextUrl.searchParams.get(key)
    if (v != null) sp.set(key, v)
  }
  sp.sort()

  // Alias table so the loader can map a clicked header link (code / native name /
  // label / region tag) to one of our supported locales.
  const alias: Record<string, string> = {}
  for (const code of LOCALES) {
    alias[code] = code
    alias[LOCALE_META[code].label.toLowerCase()] = code
    alias[LOCALE_META[code].native.toLowerCase()] = code
  }
  const localesJson = JSON.stringify({ codes: [...LOCALES], alias })

  // Host UI language for the loader's status strings (the WordPress plugin passes
  // its get_locale() as ?ui). Defaults to Catalan; the content locale is decided
  // separately by /render from ?lang / the site's default.
  const uiLocale = normalizeLocale(request.nextUrl.searchParams.get('ui'))
  const msgJson = JSON.stringify({
    loading: tr(uiLocale, 'embed.loading'),
    loadError: tr(uiLocale, 'embed.loadError'),
  })

  const script = buildScript(origin, siteId, sp.toString(), localesJson, uiLocale, msgJson)

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
