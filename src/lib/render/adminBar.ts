// "Edit on your live site" affordance for the public render.
//
// The render HTML is CDN-cached and served to anonymous visitors, so we must NOT
// bake per-user state into it. Instead we inject a tiny, static script that asks a
// no-store endpoint whether the current session may edit this site, and only then
// reveals a floating "Edit" button that opens the full-screen Studio.
//
// Two subtleties this handles:
//  1. SUBDOMAINS — a blog on `<sub>.<root>` doesn't carry the app's auth cookie and
//     its `/edit` path is rewritten to the render route. So the button talks to the
//     APP ORIGIN (apex) for both the auth check (cross-origin, credentialed) and the
//     edit link. `appOrigin` is '' when the render is already same-origin with the
//     app (relative URLs then).
//  2. STYLE ISOLATION — the button is injected into the render's LIGHT DOM, which
//     carries the CLIENT's cloned CSS. So we mount it inside a SHADOW ROOT: the
//     site's stylesheet can't reach in, and the button always looks like Carma.
//
// Pure + dependency-free. `siteId` is a UUID; `appOrigin` is our own env-derived
// string — both injection-safe.

export function adminEditBarScript(siteId: string, appOrigin = ''): string {
  const id = encodeURIComponent(siteId)
  const base = appOrigin.replace(/'/g, '') // defensive; appOrigin is env-derived
  return `<script>(function(){
  try{
    var API=${JSON.stringify(base)}+'/api/admin/can-edit?site=${id}';
    var EDIT=${JSON.stringify(base)}+'/edit/${id}';
    fetch(API,{credentials:'include',cache:'no-store'})
      .then(function(r){return r&&r.ok?r.json():null;})
      .then(function(d){if(!d||!d.canEdit)return;
        var host=document.createElement('div');
        host.style.cssText='position:fixed;right:22px;bottom:22px;z-index:2147483000;opacity:0;transform:translateY(10px);transition:opacity .3s ease,transform .3s cubic-bezier(.2,.7,.2,1)';
        var sh=host.attachShadow?host.attachShadow({mode:'open'}):null;
        var css='a{all:initial;display:inline-flex;align-items:center;gap:9px;height:48px;padding:0 22px;border-radius:9999px;'+
          'background:linear-gradient(180deg,#ffd769,#f5bc00 58%,#e6ad00);color:#231404;'+
          "font:800 14px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:.01em;"+
          'text-decoration:none;cursor:pointer;border:1px solid rgba(180,130,0,.35);'+
          'box-shadow:0 10px 30px -6px rgba(245,188,0,.55),0 4px 12px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.55);'+
          'transition:box-shadow .2s ease,transform .3s cubic-bezier(.2,.7,.2,1)}'+
          'a:hover{box-shadow:0 14px 40px -6px rgba(245,188,0,.8),0 6px 16px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.6);transform:translateY(-1px)}'+
          '.p{font-size:16px;line-height:0}';
        var markup='<style>'+css+'</style><a href="'+EDIT+'"><span class="p">\\u270E</span><span>Edita aquest lloc</span></a>';
        if(sh){sh.innerHTML=markup;}else{host.innerHTML=markup;}
        document.body.appendChild(host);
        requestAnimationFrame(function(){host.style.opacity='1';host.style.transform='translateY(0)';});
      })
      .catch(function(){});
  }catch(e){}
})();</script>`
}
