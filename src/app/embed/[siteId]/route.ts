import { type NextRequest } from 'next/server'
import { PARAM_MAP } from '@/lib/render/embedParams'
import { LOCALES, LOCALE_META } from '@/lib/i18n/config'

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

export const dynamic = 'force-dynamic'

function buildScript(origin: string, siteId: string, params: string, localesJson: string): string {
  // Everything below is plain ES5-ish browser JS emitted as a string. We keep it
  // dependency-free and use string concatenation (no template literals) so it can
  // live safely inside this TS template literal.
  const ORIGIN = JSON.stringify(origin)
  const SITEID = JSON.stringify(siteId)
  const PARAMS = JSON.stringify(params ? '&' + params : '')

  return `(function(){
  var ORIGIN = ${ORIGIN};
  var SITEID = ${SITEID};
  var EXTRA = ${PARAMS};
  var LOC = ${localesJson};
  var CODES = LOC.codes || [];
  var ALIAS = LOC.alias || {};
  var current = document.currentScript;

  // Current view, so the cloned header's language switcher can re-render the
  // SAME page in another locale (not navigate away).
  var currentPath = '/render/' + SITEID;
  var currentLang = '';

  function fragUrl(path, lang){
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return ORIGIN + path + sep + 'format=fragment' + (lang ? ('&lang=' + lang) : '') + EXTRA;
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

  function render(root, frag){
    hoistFonts(frag.fonts);
    var style = document.createElement('style');
    style.textContent = frag.css || '';
    root.innerHTML = '';
    root.appendChild(style);
    var wrap = document.createElement('div');
    wrap.innerHTML = frag.html || '';
    root.appendChild(wrap);
  }

  function showMessage(root, msg){
    root.innerHTML = '<div style="font-family:system-ui,sans-serif;color:#888;padding:2rem;text-align:center;font-size:14px">' + msg + '</div>';
  }

  function load(root, url){
    showMessage(root, 'Carregant…');
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(r){ if(!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function(frag){
        if (frag && frag.error) { showMessage(root, frag.error); return; }
        render(root, frag);
      })
      .catch(function(){ showMessage(root, 'No s\\'ha pogut carregar el blog.'); });
  }

  function start(){
    var host = resolveMount();
    if (!host) return;
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    // Delegated click handler (also covers nodes added later — no MutationObserver
    // needed). Handles BOTH our intra-blog links AND the cloned header's native
    // language switcher.
    root.addEventListener('click', function(e){
      var t = e.target;
      var a = t && t.closest ? t.closest('a') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';

      // 1. Our own /render links (cards, breadcrumb, our language pills): swap the
      //    shadow content instead of following a dead relative link.
      if (href.indexOf('/render/' + SITEID) === 0){
        e.preventDefault();
        var p = parseRenderHref(href);
        currentPath = p.path; currentLang = p.lang;
        load(root, fragUrl(currentPath, currentLang));
        if (host.scrollIntoView) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      // 2. The cloned header's native language switcher: re-render the CURRENT
      //    view in the chosen locale instead of navigating to the source site.
      var header = a.closest ? a.closest('[data-carma-chrome="header"]') : null;
      if (header){
        var loc = detectHeaderLocale(a, header);
        if (loc && loc !== currentLang){
          e.preventDefault();
          currentLang = loc;
          load(root, fragUrl(currentPath, currentLang));
        }
      }
    });

    load(root, fragUrl(currentPath, currentLang));
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

  const script = buildScript(origin, siteId, sp.toString(), localesJson)

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
