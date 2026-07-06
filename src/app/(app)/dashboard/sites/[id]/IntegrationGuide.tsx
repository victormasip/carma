'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  Sparkles, Code2, Cloud, Copy, Check, Info, AlertTriangle,
  ChevronDown, ChevronUp, ExternalLink, MousePointerClick, Zap,
} from 'lucide-react'

type IconType = typeof Code2
type Path = 'render' | 'api'
type RenderMethod = 'cloudflare' | 'vercel' | 'netlify' | 'iframe' | 'nginx' | 'apache' | 'wordpress'
type ApiPlatform = 'nextjs' | 'react' | 'vue' | 'astro' | 'html' | 'php' | 'wordpress'

const FRAMEWORK_LABEL: Record<string, string> = {
  wordpress: 'WordPress', nextjs: 'Next.js', astro: 'Astro', gatsby: 'Gatsby',
  hugo: 'Hugo', jekyll: 'Jekyll', webflow: 'Webflow', squarespace: 'Squarespace',
  wix: 'Wix', shopify: 'Shopify', vue: 'Vue', react: 'React', html: 'HTML estàtic',
}

const HOSTING_LABEL: Record<string, string> = {
  vercel: 'Vercel', netlify: 'Netlify', cloudflare: 'Cloudflare',
  aws: 'AWS', github: 'GitHub Pages', wpengine: 'WP Engine',
}

// Decide the recommended path/method given the detected framework + hosting.
function getRecommendation(
  framework: string | null,
  hosting: string | null,
): { path: Path; method: RenderMethod | ApiPlatform; reason: string } {
  // Framework-specific recommendations (highest priority)
  if (framework === 'wordpress')  return { path: 'render', method: 'wordpress', reason: 'WordPress permet instal·lar un plugin proxy en 2 minuts.' }
  if (framework === 'webflow')    return { path: 'render', method: 'iframe',    reason: 'Webflow no permet codi al servidor; iframe és l\'única via.' }
  if (framework === 'squarespace')return { path: 'render', method: 'iframe',    reason: 'Squarespace no permet codi al servidor; iframe és l\'única via.' }
  if (framework === 'wix')        return { path: 'render', method: 'iframe',    reason: 'Wix no permet codi al servidor; iframe és l\'única via.' }

  // Hosting-driven (when framework allows it)
  if (hosting === 'vercel')     return { path: 'render', method: 'vercel',     reason: 'El client té el site a Vercel — afegir un rewrite és tan simple com editar un JSON.' }
  if (hosting === 'netlify')    return { path: 'render', method: 'netlify',    reason: 'El client té el site a Netlify — un fitxer _redirects ho resol.' }
  if (hosting === 'cloudflare') return { path: 'render', method: 'cloudflare', reason: 'El client ja té Cloudflare — un Worker és la via més neta.' }

  // Framework-driven API integration
  if (framework === 'nextjs') return { path: 'api', method: 'nextjs', reason: 'Next.js té suport natiu per fetch + ISR.' }
  if (framework === 'astro')  return { path: 'api', method: 'astro',  reason: 'Astro genera HTML estàtic a build time — integració SSG perfecta.' }
  if (framework === 'gatsby') return { path: 'api', method: 'react',  reason: 'Gatsby usa React — el hook funciona igual.' }
  if (framework === 'hugo' || framework === 'jekyll') return { path: 'api', method: 'html', reason: 'Site estàtic — JS vanilla és el camí més senzill.' }
  if (framework === 'vue')    return { path: 'api', method: 'vue',    reason: 'Component Vue 3 amb fetch.' }
  if (framework === 'react')  return { path: 'api', method: 'react',  reason: 'Hook React amb fetch.' }
  if (framework === 'shopify')return { path: 'api', method: 'php',    reason: 'Shopify Liquid permet incloure HTML extern; PHP fa de mostra del patró.' }

  // HTML / unknown: give them a ready-to-paste HTML file
  return { path: 'api', method: 'html', reason: 'Sense framework detectat — t\'oferim un fitxer HTML+JS llest per pujar al servidor.' }
}

export default function IntegrationGuide({
  siteId,
  apiKey,
  detectedFramework = null,
  detectedHosting = null,
}: {
  siteId: string
  apiKey: string
  detectedFramework?: string | null
  detectedHosting?: string | null
}) {
  const recommendation = getRecommendation(detectedFramework, detectedHosting)
  const [path, setPath] = useState<Path>(recommendation.path)
  const [renderMethod, setRenderMethod] = useState<RenderMethod>(
    recommendation.path === 'render' ? (recommendation.method as RenderMethod) : 'cloudflare',
  )
  const [apiPlatform, setApiPlatform] = useState<ApiPlatform>(
    recommendation.path === 'api' ? (recommendation.method as ApiPlatform) : 'nextjs',
  )

  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => 'https://your-carma.com',
  )

  const renderUrl = `${origin}/render/${siteId}`
  const apiUrl = `${origin}/api/v1/posts`

  const fwLabel = detectedFramework ? (FRAMEWORK_LABEL[detectedFramework] ?? detectedFramework) : null
  const hostLabel = detectedHosting ? (HOSTING_LABEL[detectedHosting] ?? detectedHosting) : null

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="text-base font-bold text-text">Connexió personalitzada</h3>
      </div>
      <p className="text-xs text-muted mb-5 leading-relaxed">
        Instruccions pas a pas adaptades a la web del client.
      </p>

      {/* Detection banner */}
      {fwLabel && (
        <div className="bg-accent-soft border border-accent/30 rounded-2xl p-5 mb-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Detectat al tema</p>
            <p className="text-sm font-bold text-text mt-0.5">
              {fwLabel}
              {hostLabel && <span className="font-normal text-muted"> · hosting {hostLabel}</span>}
            </p>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              <strong>Recomanació:</strong> {recommendation.reason}
            </p>
          </div>
        </div>
      )}

      {/* Path chooser */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <PathCard
          active={path === 'render'} onClick={() => setPath('render')}
          icon={Cloud}
          title="Servir des de Carma"
          subtitle="Sense codi al servidor del client"
          features={['DNS / proxy / iframe', 'Look & feel original via tema', 'Updates instantanis']}
          badge="MÉS FÀCIL"
          recommended={recommendation.path === 'render'}
        />
        <PathCard
          active={path === 'api'} onClick={() => setPath('api')}
          icon={Code2}
          title="Integració via API"
          subtitle="Codi al site del client"
          features={['Control total del HTML', 'Necessita un dev', 'SEO i caché propis']}
          badge="MÉS FLEXIBLE"
          recommended={recommendation.path === 'api'}
        />
      </div>

      {path === 'render' && (
        <RenderInstructions
          renderUrl={renderUrl}
          siteId={siteId}
          method={renderMethod}
          setMethod={setRenderMethod}
          recommendedMethod={recommendation.path === 'render' ? (recommendation.method as RenderMethod) : null}
        />
      )}
      {path === 'api' && (
        <ApiInstructions
          apiUrl={apiUrl}
          apiKey={apiKey}
          platform={apiPlatform}
          setPlatform={setApiPlatform}
          recommendedPlatform={recommendation.path === 'api' ? (recommendation.method as ApiPlatform) : null}
        />
      )}
    </div>
  )
}

function PathCard({
  active, onClick, icon: Icon, title, subtitle, features, badge, recommended = false,
}: {
  active: boolean
  onClick: () => void
  icon: IconType
  title: string
  subtitle: string
  features: string[]
  badge: string
  recommended?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer relative text-left p-5 rounded-2xl border-2 transition-all ${
        active ? 'bg-accent-soft border-accent shadow-md' : 'bg-surface border-border hover:border-border-strong hover:shadow-sm'
      }`}
    >
      {recommended && (
        <span className="absolute -top-2 left-4 text-xs font-bold uppercase tracking-widest bg-success text-white px-2 py-0.5 rounded-full shadow-sm">
          Recomanat
        </span>
      )}
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-accent text-white' : 'bg-surface-hover text-muted'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className={`text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded ${active ? 'bg-accent-soft text-accent' : 'bg-surface-hover text-muted'}`}>{badge}</span>
      </div>
      <h4 className="text-sm font-bold text-text mb-1">{title}</h4>
      <p className="text-xs text-muted mb-3">{subtitle}</p>
      <ul className="space-y-1">
        {features.map(f => (
          <li key={f} className="text-xs text-muted flex items-start gap-1.5">
            <span className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${active ? 'bg-accent' : 'bg-subtle'}`} />
            {f}
          </li>
        ))}
      </ul>
    </button>
  )
}

// ─── RENDER PATH ──────────────────────────────────────────────────────────────

function RenderInstructions({
  renderUrl, siteId, method, setMethod, recommendedMethod,
}: {
  renderUrl: string
  siteId: string
  method: RenderMethod
  setMethod: (m: RenderMethod) => void
  recommendedMethod: RenderMethod | null
}) {
  const METHODS: { key: RenderMethod; label: string; difficulty: 1 | 2 | 3; description: string }[] = [
    { key: 'cloudflare', label: 'Cloudflare Worker',    difficulty: 1, description: 'El més recomanat. Gratis fins a 100k peticions/dia.' },
    { key: 'vercel',     label: 'Vercel (Rewrites)',    difficulty: 1, description: 'Si el client té el site a Vercel.' },
    { key: 'netlify',    label: 'Netlify (_redirects)', difficulty: 1, description: 'Si el client té el site a Netlify.' },
    { key: 'iframe',     label: 'Iframe embed',         difficulty: 1, description: 'MVP ràpid. No recomanat per producció seriosa.' },
    { key: 'nginx',      label: 'Nginx',                difficulty: 2, description: 'Si el client té VPS propi amb Nginx.' },
    { key: 'apache',     label: 'Apache (.htaccess)',   difficulty: 2, description: 'Hosting compartit típic (cPanel, Plesk).' },
    { key: 'wordpress',  label: 'WordPress (plugin)',   difficulty: 2, description: 'Si el client té WordPress i pots instal·lar un plugin.' },
  ]

  const selected = METHODS.find(m => m.key === method)!

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* URL display */}
      <div className="bg-text rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-accent/10 blur-[60px] pointer-events-none rounded-full" />
        <div className="relative z-10">
          <p className="text-xs font-bold text-accent uppercase tracking-widest mb-2">URL de render del client</p>
          <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2 border border-white/15">
            <code className="text-xs font-mono text-subtle truncate flex-1">{renderUrl}</code>
            <InlineCopy text={renderUrl} dark />
          </div>
          <p className="text-xs text-subtle mt-3 leading-relaxed">
            Aquesta URL serveix els articles del client amb el seu look. <strong className="text-white">L&apos;objectiu</strong> és que apareguin a <code className="bg-surface/10 px-1.5 py-0.5 rounded text-xs">la-seva-web.cat/noticies</code> (o el path que prefereixis).
          </p>
        </div>
      </div>

      {/* Method picker */}
      <div>
        <p className="text-xs font-bold text-subtle uppercase tracking-widest mb-2">Tria el mètode</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          {METHODS.map(m => {
            const isRec = recommendedMethod === m.key
            return (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`cursor-pointer relative text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  method === m.key
                    ? 'bg-text text-white shadow-sm'
                    : isRec
                    ? 'bg-success-soft text-text border border-success/30 hover:bg-success-soft'
                    : 'bg-surface-subtle text-text hover:bg-surface-hover border border-border'
                }`}
              >
                {isRec && method !== m.key && (
                  <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold uppercase bg-success text-white px-1.5 py-0.5 rounded">★</span>
                )}
                <div className="flex items-center justify-between mb-0.5">
                  <span>{m.label}</span>
                  <span className="flex gap-0.5">
                    {[1,2,3].map(i => (
                      <span key={i} className={`w-1 h-1 rounded-full ${i <= m.difficulty ? (method === m.key ? 'bg-carma-400' : 'bg-surface-subtle') : 'bg-transparent'}`} />
                    ))}
                  </span>
                </div>
                <p className={`text-xs font-medium leading-tight ${method === m.key ? 'text-subtle' : 'text-muted'}`}>
                  {m.description}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="text-xs font-bold text-muted uppercase tracking-widest border-l-4 border-accent pl-3 py-1">
        Instruccions per a {selected.label}
      </div>

      {method === 'cloudflare' && <CloudflareGuide renderUrl={renderUrl} />}
      {method === 'vercel'     && <VercelGuide renderUrl={renderUrl} />}
      {method === 'netlify'    && <NetlifyGuide renderUrl={renderUrl} />}
      {method === 'iframe'     && <IframeGuide renderUrl={renderUrl} />}
      {method === 'nginx'      && <NginxGuide renderUrl={renderUrl} />}
      {method === 'apache'     && <ApacheGuide renderUrl={renderUrl} />}
      {method === 'wordpress'  && <WordPressGuide renderUrl={renderUrl} siteId={siteId} />}

      <Warning>
        <strong>Important:</strong> tots els mètodes requereixen que el <strong>tema visual</strong> estigui configurat a la pestanya <strong>Tema</strong>. Sense això els articles surten amb estil genèric.
      </Warning>
    </div>
  )
}

// ─── Cloudflare Worker — ULTRA DETALLAT ───────────────────────────────────────

function CloudflareGuide({ renderUrl }: { renderUrl: string }) {
  const code = `// Cloudflare Worker — proxy /noticies/* cap a Carma
export default {
  async fetch(request) {
    const url = new URL(request.url)

    // Si la ruta no comença per /noticies, passa la petició original al backend del client
    if (!url.pathname.startsWith('/noticies')) {
      return fetch(request)
    }

    // Reescriu la URL cap a Carma (treu el prefix /noticies)
    const slug = url.pathname.replace(/^\\/noticies\\/?/, '')
    const target = slug
      ? \`${renderUrl}/\${slug}\`
      : \`${renderUrl}\`

    // Fa la petició a Carma i retorna l'HTML
    const carmaResponse = await fetch(target, {
      headers: { 'User-Agent': request.headers.get('User-Agent') ?? '' },
    })

    return new Response(carmaResponse.body, {
      status: carmaResponse.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  },
}`

  return (
    <Steps>
      <Step n={0} title="Prerequisits" subtitle="Què necessites abans de començar">
        <ul className="space-y-1.5">
          <Li>Domini del client (ex: <Code>la-seva-web.cat</Code>) i accés al registrador on està comprat</Li>
          <Li>Compte de Cloudflare (gratis). Si no en tens: <ExtLink href="https://dash.cloudflare.com/sign-up">cloudflare.com/sign-up</ExtLink></Li>
        </ul>
      </Step>

      <Step n={1} title="Afegir el domini a Cloudflare" subtitle="Si el client ja l'usa, salta aquest pas">
        <ol className="space-y-2 list-none">
          <Li><Strong>1.1.</Strong> Entra a <ExtLink href="https://dash.cloudflare.com">dash.cloudflare.com</ExtLink> i fes login</Li>
          <Li><Strong>1.2.</Strong> Botó <Btn>+ Add a Site</Btn> (a dalt a la dreta o al menú principal)</Li>
          <Li><Strong>1.3.</Strong> Introdueix el domini SENSE protocol ni www: <Code>la-seva-web.cat</Code></Li>
          <Li><Strong>1.4.</Strong> Selecciona el pla <Strong>Free</Strong> i clica <Btn>Continue</Btn></Li>
          <Li><Strong>1.5.</Strong> Cloudflare escanejarà els DNS records actuals. Revisa que hi siguin tots i clica <Btn>Continue</Btn></Li>
          <Li><Strong>1.6.</Strong> Et donaran 2 nameservers (p.ex. <Code>lana.ns.cloudflare.com</Code> i <Code>tim.ns.cloudflare.com</Code>)</Li>
          <Li><Strong>1.7.</Strong> Ves al registrador del domini (GoDaddy / Namecheap / Hostinger / etc.) → Manage DNS → Nameservers → canvia&apos;ls pels que t&apos;ha donat Cloudflare</Li>
          <Li><Strong>1.8.</Strong> Torna a Cloudflare → clica <Btn>Done, check nameservers</Btn>. Espera entre 5 minuts i 24h. Rebràs un correu quan estigui activat.</Li>
        </ol>
        <Note>Mentre esperes, pots continuar amb el següent pas. El Worker el podràs assignar quan el domini estigui activat.</Note>
      </Step>

      <Step n={2} title="Crear el Worker">
        <ol className="space-y-2 list-none">
          <Li><Strong>2.1.</Strong> Al menú esquerre de Cloudflare, clica <Btn>Workers &amp; Pages</Btn> <span className="text-subtle">(icona de quadrats)</span></Li>
          <Li><Strong>2.2.</Strong> Botó taronja <Btn>Create application</Btn> a dalt a la dreta</Li>
          <Li><Strong>2.3.</Strong> Selecciona la pestanya <Btn>Workers</Btn> (NO &quot;Pages&quot;)</Li>
          <Li><Strong>2.4.</Strong> Clica <Btn>Create Worker</Btn></Li>
          <Li><Strong>2.5.</Strong> Posa un nom: <Code>carma-blog</Code> (o el que vulguis, sense espais)</Li>
          <Li><Strong>2.6.</Strong> Clica <Btn>Deploy</Btn> — això publica el Worker amb codi &quot;Hello World&quot; per defecte</Li>
        </ol>
      </Step>

      <Step n={3} title="Editar el codi del Worker">
        <ol className="space-y-2 list-none">
          <Li><Strong>3.1.</Strong> Un cop creat, veuràs un panell amb info del Worker. Clica el botó <Btn>Edit code</Btn> al cantó superior dret</Li>
          <Li><Strong>3.2.</Strong> S&apos;obre un editor amb un fitxer <Code>worker.js</Code>. <Strong>Esborra TOT el codi</Strong> (Ctrl+A → Delete)</Li>
          <Li><Strong>3.3.</Strong> Enganxa exactament aquest codi:</Li>
        </ol>
        <CodeBlock code={code} language="js" />
        <ol className="space-y-2 list-none">
          <Li><Strong>3.4.</Strong> Botó <Btn>Save and deploy</Btn> a dalt a la dreta (vermell o blau)</Li>
          <Li><Strong>3.5.</Strong> Espera a veure el missatge <Code>Success — Deploy complete</Code></Li>
        </ol>
      </Step>

      <Step n={4} title="Configurar la ruta del domini">
        <ol className="space-y-2 list-none">
          <Li><Strong>4.1.</Strong> Tanca l&apos;editor i torna al Worker (botó <Btn>← Back</Btn>)</Li>
          <Li><Strong>4.2.</Strong> Clica la pestanya <Btn>Settings</Btn> a dalt</Li>
          <Li><Strong>4.3.</Strong> Al menú esquerre busca <Btn>Triggers</Btn> i clica-hi</Li>
          <Li><Strong>4.4.</Strong> Secció <Strong>Routes</Strong> → clica <Btn>+ Add route</Btn></Li>
          <Li><Strong>4.5.</Strong> Camp <Code>Route</Code>: <Code>la-seva-web.cat/noticies*</Code> <span className="text-subtle">(asterisc final inclou totes les subrutes /noticies/article-1, etc.)</span></Li>
          <Li><Strong>4.6.</Strong> Camp <Code>Zone</Code>: selecciona <Code>la-seva-web.cat</Code> (només apareix si Cloudflare ja ha activat el domini)</Li>
          <Li><Strong>4.7.</Strong> Clica <Btn>Save</Btn></Li>
        </ol>
      </Step>

      <Step n={5} title="Verificar que funciona">
        <ol className="space-y-2 list-none">
          <Li><Strong>5.1.</Strong> Obre el navegador en <Strong>mode incògnit</Strong> (Ctrl+Shift+N) per evitar caché</Li>
          <Li><Strong>5.2.</Strong> Ves a <Code>https://la-seva-web.cat/noticies</Code></Li>
          <Li><Strong>5.3.</Strong> Hauries de veure el llistat d&apos;articles de Carma amb el look del client</Li>
          <Li><Strong>5.4.</Strong> Prova també d&apos;entrar a un article concret: <Code>la-seva-web.cat/noticies/un-slug</Code></Li>
        </ol>

        <Note>
          <Strong>Troubleshooting:</Strong><br />
          • <Strong>Error 522/523</Strong>: el Worker no està actiu, verifica el pas 3.5<br />
          • <Strong>Error 1101</Strong>: error JS al Worker, revisa que has enganxat el codi sencer del pas 3.3<br />
          • <Strong>Veus la pàgina d&apos;inici del client</Strong>: la ruta no captura, revisa el pas 4.5 (asterisc final!)<br />
          • <Strong>Estil genèric, sense disseny</Strong>: el tema no està configurat a la pestanya Tema de Carma
        </Note>
      </Step>
    </Steps>
  )
}

// ─── Vercel ───────────────────────────────────────────────────────────────────

function VercelGuide({ renderUrl }: { renderUrl: string }) {
  const code = `{
  "rewrites": [
    {
      "source": "/noticies",
      "destination": "${renderUrl}"
    },
    {
      "source": "/noticies/:slug",
      "destination": "${renderUrl}/:slug"
    }
  ]
}`
  return (
    <Steps>
      <Step n={0} title="Prerequisits">
        <ul className="space-y-1.5">
          <Li>El client té el site desplegat a Vercel</Li>
          <Li>Tens accés al repositori Git del client (o al projecte a vercel.com)</Li>
        </ul>
      </Step>

      <Step n={1} title="Editar (o crear) vercel.json">
        <ol className="space-y-2 list-none">
          <Li><Strong>1.1.</Strong> Obre el repositori del client al teu editor (VSCode, etc.)</Li>
          <Li><Strong>1.2.</Strong> Busca a l&apos;arrel un fitxer anomenat <Code>vercel.json</Code></Li>
          <Li><Strong>1.3.</Strong> Si <Strong>NO existeix</Strong>: crea&apos;l a l&apos;arrel del projecte amb aquest contingut:</Li>
        </ol>
        <CodeBlock code={code} language="json" />
        <ol className="space-y-2 list-none">
          <Li><Strong>1.4.</Strong> Si <Strong>ja existeix</Strong>: afegeix l&apos;array <Code>rewrites</Code> dins l&apos;objecte. Si ja tenia rewrites, només afegeix els 2 objects nous a l&apos;array.</Li>
        </ol>
      </Step>

      <Step n={2} title="Commit + push">
        <CodeBlock code={'git add vercel.json\ngit commit -m "feat: integrate Carma blog"\ngit push'} language="bash" />
        <p>Vercel detecta el push i re-desplega automàticament. Espera 1-2 minuts.</p>
      </Step>

      <Step n={3} title="Verificar al dashboard de Vercel">
        <ol className="space-y-2 list-none">
          <Li><Strong>3.1.</Strong> Entra a <ExtLink href="https://vercel.com/dashboard">vercel.com/dashboard</ExtLink></Li>
          <Li><Strong>3.2.</Strong> Selecciona el projecte del client</Li>
          <Li><Strong>3.3.</Strong> Pestanya <Btn>Deployments</Btn> → el deploy més recent ha de tenir l&apos;estat <Strong>Ready</Strong> (verd)</Li>
          <Li><Strong>3.4.</Strong> Obre <Code>la-seva-web.cat/noticies</Code> en mode incògnit</Li>
        </ol>
      </Step>

      <Step n={4} title="SEO check">
        <ol className="space-y-2 list-none">
          <Li><Strong>4.1.</Strong> Obre Inspector → Network → recarrega: la primera petició HTML ha de tenir status <Code>200</Code> i Content-Type <Code>text/html</Code></Li>
          <Li><Strong>4.2.</Strong> Afegeix la URL <Code>la-seva-web.cat/noticies</Code> al sitemap principal del client</Li>
        </ol>
      </Step>
    </Steps>
  )
}

// ─── Netlify ──────────────────────────────────────────────────────────────────

function NetlifyGuide({ renderUrl }: { renderUrl: string }) {
  const code = `# Format: source  destination  status
/noticies          ${renderUrl}                 200
/noticies/*        ${renderUrl}/:splat           200`

  return (
    <Steps>
      <Step n={0} title="Prerequisits">
        <ul className="space-y-1.5">
          <Li>El site del client està a Netlify</Li>
          <Li>Tens accés al repositori Git o al panell de Netlify</Li>
        </ul>
      </Step>

      <Step n={1} title="Crear o editar el fitxer _redirects">
        <ol className="space-y-2 list-none">
          <Li><Strong>1.1.</Strong> Identifica on van els fitxers estàtics del projecte:</Li>
          <ul className="ml-6 mt-1 space-y-1 text-xs text-muted list-disc">
            <li>Next.js / React (CRA): <Code>/public</Code></li>
            <li>Vite: <Code>/public</Code></li>
            <li>Astro: <Code>/public</Code></li>
            <li>Hugo / Jekyll / build estàtic: arrel del projecte</li>
          </ul>
          <Li><Strong>1.2.</Strong> Crea (o edita) un fitxer anomenat <Code>_redirects</Code> (sense extensió, comença per underscore!) en aquella carpeta amb aquest contingut:</Li>
        </ol>
        <CodeBlock code={code} language="bash" />
        <Note>
          El <Strong>200</Strong> al final és crític: significa &quot;rewrite&quot; (la URL al navegador es manté <Code>la-seva-web.cat/noticies</Code>). Si poses 301 o 302, el navegador es redirigeix a Carma i la URL canvia.
        </Note>
      </Step>

      <Step n={2} title="Commit + push">
        <CodeBlock code={'git add public/_redirects\ngit commit -m "feat: Carma blog rewrite"\ngit push'} language="bash" />
        <p>Netlify re-desplega automàticament (1-2 min).</p>
      </Step>

      <Step n={3} title="Verificar">
        <ol className="space-y-2 list-none">
          <Li><Strong>3.1.</Strong> Obre <Code>la-seva-web.cat/noticies</Code> en mode incògnit</Li>
          <Li><Strong>3.2.</Strong> Comprova que la URL al navegador NO canvia (ha de quedar <Code>la-seva-web.cat/noticies</Code>, no la URL de Carma)</Li>
          <Li><Strong>3.3.</Strong> Inspecciona-la → Network → la primera petició retorna el HTML del render de Carma amb status 200</Li>
        </ol>
        <Note>
          <Strong>Troubleshooting</Strong>: si la URL canvia a la de Carma, has posat 301/302 en lloc de 200. Edita el fitxer i torna a desplegar.
        </Note>
      </Step>
    </Steps>
  )
}

// ─── Iframe ───────────────────────────────────────────────────────────────────

function IframeGuide({ renderUrl }: { renderUrl: string }) {
  const code = `<!-- Enganxa això on vulguis a la pàgina del client -->
<iframe
  src="${renderUrl}"
  style="width: 100%; min-height: 800px; border: 0;"
  loading="lazy"
  title="Notícies"
></iframe>`

  return (
    <Steps>
      <Step n={0} title="Quan usar aquest mètode">
        <p>Només si el client NO pot tocar DNS, no té accés al servidor i té un CMS que permet incrustar HTML (WordPress amb un bloc HTML, Webflow, Wix, Squarespace, etc.).</p>
        <Warning small>
          <Strong>Limitacions importants:</Strong> la URL al navegador NO canvia entre articles (mal SEO), el header/footer del client apareix duplicat (un cop al site i un cop dins l&apos;iframe del tema), i l&apos;altura és fixa o calculada amb JS.
        </Warning>
      </Step>

      <Step n={1} title="Trobar on inserir l'HTML al CMS del client">
        <ul className="space-y-1.5">
          <Li><Strong>WordPress</Strong>: editor de pàgina → afegeix bloc → busca <Code>HTML personalitzat</Code> o <Code>Custom HTML</Code></Li>
          <Li><Strong>Webflow</Strong>: arrossega un component <Code>Embed</Code> al lloc desitjat</Li>
          <Li><Strong>Squarespace</Strong>: afegeix bloc <Code>Code</Code> (només plans Business+)</Li>
          <Li><Strong>Wix</Strong>: <Code>Add → Embed → Custom Embeds → Embed a Widget</Code></Li>
          <Li><Strong>HTML pur</Strong>: directament al teu fitxer <Code>.html</Code></Li>
        </ul>
      </Step>

      <Step n={2} title="Enganxar el codi">
        <CodeBlock code={code} language="html" />
      </Step>

      <Step n={3} title="Verificar">
        <p>Recarrega la pàgina pública on l&apos;has inserit. Hauries de veure el llistat dins un marc. Ajusta el <Code>min-height</Code> si veus barra de scroll dins l&apos;iframe.</p>
      </Step>
    </Steps>
  )
}

// ─── Nginx ────────────────────────────────────────────────────────────────────

function NginxGuide({ renderUrl }: { renderUrl: string }) {
  const carmaHost = new URL(renderUrl).host
  const code = `# Edita /etc/nginx/sites-available/la-seva-web.cat
server {
    listen 443 ssl http2;
    server_name la-seva-web.cat;

    # ... resta de la configuració del client ...

    # ── Proxy a Carma per a /noticies/* ──
    location /noticies {
        proxy_pass         ${renderUrl};
        proxy_set_header   Host              ${carmaHost};
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_cache_valid 200 60s;
    }
}`

  return (
    <Steps>
      <Step n={0} title="Prerequisits">
        <ul className="space-y-1.5">
          <Li>SSH al servidor del client amb permisos sudo</Li>
          <Li>Saber on és la config de Nginx (típicament <Code>/etc/nginx/sites-available/</Code> o <Code>/etc/nginx/conf.d/</Code>)</Li>
        </ul>
      </Step>

      <Step n={1} title="Localitzar el fitxer de configuració">
        <CodeBlock code={'ls /etc/nginx/sites-available/\n# o\nls /etc/nginx/conf.d/'} language="bash" />
        <p>Identifica el fitxer corresponent al domini del client (ex: <Code>la-seva-web.cat</Code> o <Code>default</Code>).</p>
      </Step>

      <Step n={2} title="Editar la config">
        <CodeBlock code={'sudo nano /etc/nginx/sites-available/la-seva-web.cat'} language="bash" />
        <p>Dins el bloc <Code>server {'{'}</Code> del HTTPS (port 443), afegeix aquest <Code>location</Code>:</p>
        <CodeBlock code={code} language="nginx" />
      </Step>

      <Step n={3} title="Validar la config + recarregar">
        <CodeBlock code={'sudo nginx -t                  # valida sintaxi\nsudo systemctl reload nginx    # aplica canvis sense downtime'} language="bash" />
        <p>Si <Code>nginx -t</Code> dóna error, NO recarreguis — corregeix l&apos;error abans.</p>
      </Step>

      <Step n={4} title="Provar">
        <CodeBlock code={'curl -I https://la-seva-web.cat/noticies'} language="bash" />
        <p>Ha de retornar <Code>HTTP/2 200</Code>. Després obre-ho al navegador.</p>
      </Step>
    </Steps>
  )
}

// ─── Apache ───────────────────────────────────────────────────────────────────

function ApacheGuide({ renderUrl }: { renderUrl: string }) {
  const code = `RewriteEngine On

# Proxy /noticies/* cap a Carma (requereix mod_proxy + mod_proxy_http)
RewriteRule ^noticies/?$              ${renderUrl}                 [P,L]
RewriteRule ^noticies/(.+)$           ${renderUrl}/$1               [P,L]`

  return (
    <Steps>
      <Step n={0} title="Prerequisits">
        <ul className="space-y-1.5">
          <Li>Accés FTP/SSH al hosting del client</Li>
          <Li>Apache amb <Code>mod_proxy</Code>, <Code>mod_proxy_http</Code> i <Code>mod_rewrite</Code> activats</Li>
        </ul>
      </Step>

      <Step n={1} title="Activar mòduls (si tens SSH amb sudo)">
        <CodeBlock code={'sudo a2enmod proxy proxy_http rewrite ssl\nsudo systemctl restart apache2'} language="bash" />
        <p>Si el client té cPanel/Plesk, normalment ja estan activats. Si no en tens SSH, demana al provider.</p>
      </Step>

      <Step n={2} title="Crear o editar .htaccess">
        <ol className="space-y-2 list-none">
          <Li><Strong>2.1.</Strong> Connecta via FTP (FileZilla, etc.) o cPanel File Manager</Li>
          <Li><Strong>2.2.</Strong> Ves a l&apos;arrel del web (típicament <Code>public_html/</Code>)</Li>
          <Li><Strong>2.3.</Strong> Busca el fitxer <Code>.htaccess</Code>. Si NO existeix, crea&apos;l (el nom comença amb punt!)</Li>
          <Li><Strong>2.4.</Strong> Afegeix aquest contingut al <Strong>principi</Strong> del fitxer:</Li>
        </ol>
        <CodeBlock code={code} language="apache" />
      </Step>

      <Step n={3} title="Provar">
        <p>Obre <Code>https://la-seva-web.cat/noticies</Code>. Si veus error 500, possiblement:</p>
        <ul className="space-y-1 mt-2">
          <Li><Code>mod_proxy</Code> no està actiu (demana-ho al provider)</Li>
          <Li><Code>AllowOverride All</Code> no està al VirtualHost (cal accés a la config principal d&apos;Apache)</Li>
        </ul>
      </Step>
    </Steps>
  )
}

// ─── WordPress ────────────────────────────────────────────────────────────────

function WordPressGuide({ renderUrl, siteId }: { renderUrl: string; siteId: string }) {
  const pluginCode = `<?php
/**
 * Plugin Name: Carma Blog Proxy
 * Description: Serveix /noticies des de Carma mantenint el domini del client.
 * Version: 1.0
 */

if (!defined('ABSPATH')) exit;

// 1. Registrar les rewrite rules de WordPress
add_action('init', function () {
    add_rewrite_rule('^noticies/?$',          'index.php?carma_render=__INDEX__', 'top');
    add_rewrite_rule('^noticies/([^/]+)/?$',  'index.php?carma_render=$matches[1]', 'top');
});

// 2. Exposar el query var perquè WordPress no l'ignori
add_filter('query_vars', function ($vars) {
    $vars[] = 'carma_render';
    return $vars;
});

// 3. Quan la query var està present, fer fetch a Carma i tornar l'HTML
add_action('template_redirect', function () {
    $slug = get_query_var('carma_render');
    if (!$slug) return;

    $url = $slug === '__INDEX__'
        ? '${renderUrl}'
        : '${renderUrl}/' . urlencode($slug);

    $response = wp_remote_get($url, ['timeout' => 15]);
    if (is_wp_error($response)) {
        status_header(502);
        echo 'Servei temporalment no disponible';
        exit;
    }

    status_header(wp_remote_retrieve_response_code($response));
    header('Content-Type: text/html; charset=utf-8');
    echo wp_remote_retrieve_body($response);
    exit;
});

// 4. Flush rewrites en activar/desactivar
register_activation_hook(__FILE__,   fn() => flush_rewrite_rules());
register_deactivation_hook(__FILE__, fn() => flush_rewrite_rules());`

  return (
    <Steps>
      <Step n={0} title="Prerequisits">
        <ul className="space-y-1.5">
          <Li>Accés FTP, SSH o cPanel File Manager al WordPress del client</Li>
          <Li>Permís per instal·lar plugins (rol Admin)</Li>
        </ul>
      </Step>

      <Step n={1} title="Crear el plugin">
        <ol className="space-y-2 list-none">
          <Li><Strong>1.1.</Strong> Al servidor del client, ves a <Code>wp-content/plugins/</Code></Li>
          <Li><Strong>1.2.</Strong> Crea una carpeta nova: <Code>carma-proxy/</Code></Li>
          <Li><Strong>1.3.</Strong> Dins, crea un fitxer <Code>carma-proxy.php</Code> amb aquest contingut:</Li>
        </ol>
        <CodeBlock code={pluginCode} language="php" />
      </Step>

      <Step n={2} title="Activar el plugin">
        <ol className="space-y-2 list-none">
          <Li><Strong>2.1.</Strong> Entra a WordPress Admin (<Code>la-seva-web.cat/wp-admin</Code>)</Li>
          <Li><Strong>2.2.</Strong> Menú esquerre → <Btn>Plugins → Installed Plugins</Btn></Li>
          <Li><Strong>2.3.</Strong> Busca <Strong>Carma Blog Proxy</Strong> a la llista → clica <Btn>Activate</Btn></Li>
        </ol>
      </Step>

      <Step n={3} title="Refrescar permalinks (crític!)">
        <ol className="space-y-2 list-none">
          <Li><Strong>3.1.</Strong> Menú esquerre → <Btn>Settings → Permalinks</Btn></Li>
          <Li><Strong>3.2.</Strong> Sense canviar res, clica el botó <Btn>Save Changes</Btn> a baix</Li>
          <Li><Strong>3.3.</Strong> Això aplica les noves rewrite rules del plugin</Li>
        </ol>
      </Step>

      <Step n={4} title="Verificar">
        <ol className="space-y-2 list-none">
          <Li><Strong>4.1.</Strong> Obre <Code>la-seva-web.cat/noticies</Code> en mode incògnit</Li>
          <Li><Strong>4.2.</Strong> Has de veure el llistat de Carma sense el chrome de WordPress</Li>
        </ol>
        <Note>
          <Strong>Troubleshooting:</Strong> si WordPress mostra un 404 propi, no s&apos;han aplicat les rules — repeteix el pas 3.<br />
          <Strong>Site ID</Strong>: el codi integrat apunta a aquest site: <Code>{siteId}</Code>
        </Note>
      </Step>
    </Steps>
  )
}

// ─── API PATH ─────────────────────────────────────────────────────────────────

function ApiInstructions({
  apiUrl, apiKey, platform, setPlatform, recommendedPlatform,
}: {
  apiUrl: string
  apiKey: string
  platform: ApiPlatform
  setPlatform: (p: ApiPlatform) => void
  recommendedPlatform: ApiPlatform | null
}) {
  const PLATFORMS: { key: ApiPlatform; label: string }[] = [
    { key: 'nextjs',    label: 'Next.js' },
    { key: 'react',     label: 'React (Vite/CRA)' },
    { key: 'vue',       label: 'Vue 3' },
    { key: 'astro',     label: 'Astro' },
    { key: 'html',      label: 'HTML + JS pur' },
    { key: 'php',       label: 'PHP' },
    { key: 'wordpress', label: 'WordPress shortcode' },
  ]

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="bg-warning-soft border border-warning/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div className="text-xs text-warning">
          <strong>Capçalera obligatòria a totes les peticions:</strong>{' '}
          <code className="bg-warning-soft px-1.5 py-0.5 rounded font-mono">x-api-key: {apiKey.slice(0, 12)}…</code>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-subtle uppercase tracking-widest mb-2">Tria el stack del client</p>
        <div className="flex gap-1.5 flex-wrap">
          {PLATFORMS.map(p => {
            const isRec = recommendedPlatform === p.key
            return (
              <button
                key={p.key}
                onClick={() => setPlatform(p.key)}
                className={`cursor-pointer relative px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  platform === p.key
                    ? 'bg-text text-white shadow-sm'
                    : isRec
                    ? 'bg-success-soft text-text border border-success/30 hover:bg-success-soft'
                    : 'bg-surface-hover text-muted hover:bg-surface-hover'
                }`}
              >
                {isRec && platform !== p.key && (
                  <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-success text-white px-1 rounded">★</span>
                )}
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {platform === 'nextjs'    && <NextjsApiGuide apiUrl={apiUrl} apiKey={apiKey} />}
      {platform === 'react'     && <ReactApiGuide apiUrl={apiUrl} apiKey={apiKey} />}
      {platform === 'vue'       && <VueApiGuide apiUrl={apiUrl} apiKey={apiKey} />}
      {platform === 'astro'     && <AstroApiGuide apiUrl={apiUrl} apiKey={apiKey} />}
      {platform === 'html'      && <HtmlApiGuide apiUrl={apiUrl} apiKey={apiKey} />}
      {platform === 'php'       && <PhpApiGuide apiUrl={apiUrl} apiKey={apiKey} />}
      {platform === 'wordpress' && <WordPressApiGuide apiUrl={apiUrl} apiKey={apiKey} />}
    </div>
  )
}

function NextjsApiGuide({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  return (
    <Steps>
      <Step n={0} title="Prerequisits">
        <ul className="space-y-1.5">
          <Li>Projecte Next.js 13+ (App Router) del client al teu editor</Li>
          <Li>Node.js i npm/pnpm instal·lats</Li>
        </ul>
      </Step>

      <Step n={1} title="Configurar variables d'entorn">
        <ol className="space-y-2 list-none">
          <Li><Strong>1.1.</Strong> A l&apos;arrel del projecte, obre (o crea) el fitxer <Code>.env.local</Code></Li>
          <Li><Strong>1.2.</Strong> Afegeix aquestes línies:</Li>
        </ol>
        <CodeBlock code={`CARMA_API_URL=${apiUrl}\nCARMA_API_KEY=${apiKey}`} language="bash" />
        <Note>El fitxer <Code>.env.local</Code> NO es puja a Git (ja està al .gitignore per defecte). Per producció: configura aquestes variables al panell de Vercel/Netlify.</Note>
      </Step>

      <Step n={2} title="Crear el helper compartit">
        <ol className="space-y-2 list-none">
          <Li><Strong>2.1.</Strong> Crea el fitxer <Code>lib/carma.ts</Code></Li>
        </ol>
        <CodeBlock code={`export type CarmaPost = {
  id: string
  title: string
  slug: string
  content: { html: string }
  excerpt?: string
  featured_image?: string
  created_at: string
}

const headers = { 'x-api-key': process.env.CARMA_API_KEY! }

export async function getPosts(limit = 20): Promise<CarmaPost[]> {
  const res = await fetch(\`\${process.env.CARMA_API_URL}?limit=\${limit}\`, {
    headers,
    next: { revalidate: 60 }, // re-render cada 60s (ISR)
  })
  if (!res.ok) throw new Error('Carma API error')
  const { posts } = await res.json()
  return posts
}

export async function getPostBySlug(slug: string): Promise<CarmaPost | null> {
  const res = await fetch(\`\${process.env.CARMA_API_URL}?slug=\${slug}\`, {
    headers,
    next: { revalidate: 60 },
  })
  if (!res.ok) return null
  const { post } = await res.json()
  return post
}`} language="ts" />
      </Step>

      <Step n={3} title="Pàgina de llistat">
        <ol className="space-y-2 list-none">
          <Li><Strong>3.1.</Strong> Crea <Code>app/noticies/page.tsx</Code>:</Li>
        </ol>
        <CodeBlock code={`import Link from 'next/link'
import { getPosts } from '@/lib/carma'

export const revalidate = 60

export default async function NoticiesPage() {
  const posts = await getPosts(20)
  return (
    <main className="container">
      <h1>Notícies</h1>
      <div className="grid">
        {posts.map(p => (
          <Link key={p.id} href={\`/noticies/\${p.slug}\`} className="card">
            {p.featured_image && <img src={p.featured_image} alt="" />}
            <h2>{p.title}</h2>
            {p.excerpt && <p>{p.excerpt}</p>}
          </Link>
        ))}
      </div>
    </main>
  )
}`} language="tsx" />
      </Step>

      <Step n={4} title="Pàgina dinàmica per a cada article">
        <ol className="space-y-2 list-none">
          <Li><Strong>4.1.</Strong> Crea <Code>app/noticies/[slug]/page.tsx</Code>:</Li>
        </ol>
        <CodeBlock code={`import { notFound } from 'next/navigation'
import { getPostBySlug } from '@/lib/carma'

export const revalidate = 60

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  return (
    <article className="container">
      <h1>{post.title}</h1>
      <time>{new Date(post.created_at).toLocaleDateString('ca-ES')}</time>
      {post.featured_image && <img src={post.featured_image} alt="" />}
      <div dangerouslySetInnerHTML={{ __html: post.content.html }} />
    </article>
  )
}`} language="tsx" />
      </Step>

      <Step n={5} title="Provar en local">
        <CodeBlock code={'npm run dev'} language="bash" />
        <p>Obre <Code>http://localhost:3000/noticies</Code> al navegador.</p>
      </Step>

      <Step n={6} title="Desplegar">
        <CodeBlock code={'git add lib/carma.ts app/noticies\ngit commit -m "feat: integrate Carma blog"\ngit push'} language="bash" />
        <ol className="space-y-2 list-none">
          <Li><Strong>6.1.</Strong> Si està a Vercel/Netlify: configura les variables d&apos;entorn al panell (Settings → Environment Variables)</Li>
          <Li><Strong>6.2.</Strong> Re-desplega</Li>
        </ol>
      </Step>
    </Steps>
  )
}

function ReactApiGuide({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  return (
    <Steps>
      <Step n={0} title="Prerequisits">
        <ul className="space-y-1.5">
          <Li>Projecte React (Vite, Create React App, Remix...)</Li>
          <Li>L&apos;API key serà visible al bundle del client</Li>
        </ul>
        <Warning small>L&apos;<Code>API_KEY</Code> queda exposada al frontend. Aquesta clau només dóna accés en lectura als articles publicats — no és secret crític, però considera fer proxy via el teu backend si necessites privacitat absoluta.</Warning>
      </Step>

      <Step n={1} title="Crear el hook">
        <ol className="space-y-2 list-none">
          <Li><Strong>1.1.</Strong> Crea <Code>src/hooks/useCarmaPosts.ts</Code>:</Li>
        </ol>
        <CodeBlock code={`import { useEffect, useState } from 'react'

const API_URL = '${apiUrl}'
const API_KEY = '${apiKey}'

export function useCarmaPosts(limit = 20) {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(\`\${API_URL}?limit=\${limit}\`, { headers: { 'x-api-key': API_KEY } })
      .then(r => {
        if (!r.ok) throw new Error('Error API')
        return r.json()
      })
      .then(({ posts }) => { setPosts(posts); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [limit])

  return { posts, loading, error }
}`} language="ts" />
      </Step>

      <Step n={2} title="Usar el hook a un component">
        <CodeBlock code={`import { useCarmaPosts } from './hooks/useCarmaPosts'

export function Blog() {
  const { posts, loading, error } = useCarmaPosts(20)

  if (loading) return <p>Carregant...</p>
  if (error)   return <p>Error: {error}</p>

  return (
    <div className="grid">
      {posts.map(p => (
        <article key={p.id}>
          {p.featured_image && <img src={p.featured_image} alt="" />}
          <h2>{p.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: p.content.html }} />
        </article>
      ))}
    </div>
  )
}`} language="tsx" />
      </Step>

      <Step n={3} title="Provar">
        <p>Inclou <Code>{'<Blog />'}</Code> a una pàgina i executa <Code>npm run dev</Code>.</p>
      </Step>
    </Steps>
  )
}

function VueApiGuide({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  return (
    <Steps>
      <Step n={1} title="Component Vue 3 (Composition API)">
        <CodeBlock code={`<script setup lang="ts">
import { ref, onMounted } from 'vue'

const posts = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  const res = await fetch('${apiUrl}?limit=20', {
    headers: { 'x-api-key': '${apiKey}' },
  })
  const data = await res.json()
  posts.value = data.posts
  loading.value = false
})
</script>

<template>
  <p v-if="loading">Carregant...</p>
  <div v-else class="grid">
    <article v-for="post in posts" :key="post.id">
      <img v-if="post.featured_image" :src="post.featured_image" alt="" />
      <h2>{{ post.title }}</h2>
      <div v-html="post.content.html" />
    </article>
  </div>
</template>`} language="vue" />
      </Step>
      <Step n={2} title="Usar al teu router">
        <p>Importa el component a una route i ja està.</p>
      </Step>
    </Steps>
  )
}

function AstroApiGuide({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  return (
    <Steps>
      <Step n={1} title="Pàgina de llistat (SSG)">
        <p>Crea <Code>src/pages/noticies/index.astro</Code>:</p>
        <CodeBlock code={`---
const res = await fetch('${apiUrl}?limit=20', {
  headers: { 'x-api-key': '${apiKey}' },
})
const { posts } = await res.json()
---

<html lang="ca">
  <head><title>Notícies</title></head>
  <body>
    <main>
      <h1>Notícies</h1>
      {posts.map(post => (
        <a href={\`/noticies/\${post.slug}\`}>
          <article>
            <h2>{post.title}</h2>
            <p>{post.excerpt}</p>
          </article>
        </a>
      ))}
    </main>
  </body>
</html>`} language="astro" />
      </Step>

      <Step n={2} title="Pàgina d'article (dinàmica + SSG)">
        <p>Crea <Code>src/pages/noticies/[slug].astro</Code>:</p>
        <CodeBlock code={`---
export async function getStaticPaths() {
  const res = await fetch('${apiUrl}?limit=100', {
    headers: { 'x-api-key': '${apiKey}' },
  })
  const { posts } = await res.json()
  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post },
  }))
}

const { post } = Astro.props
---

<html lang="ca">
  <body>
    <article>
      <h1>{post.title}</h1>
      <Fragment set:html={post.content.html} />
    </article>
  </body>
</html>`} language="astro" />
      </Step>

      <Step n={3} title="Build">
        <CodeBlock code={'npm run build'} language="bash" />
        <p>Astro generarà HTML estàtic per a cada article. Re-build cada cop que el client publiqui (futura feature: webhook).</p>
      </Step>
    </Steps>
  )
}

function HtmlApiGuide({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  // Complete file: handles both listing AND individual article via query string (?slug=...)
  const fullFile = `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title id="page-title">Notícies</title>
  <style>
    /* Estil bàsic — substitueix per CSS del client */
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem 1rem; color: #222; }
    h1 { font-size: 2.25rem; margin: 0 0 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: #fff; border: 1px solid #eee; border-radius: 12px; overflow: hidden; transition: transform .2s, box-shadow .2s; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.08); }
    .card a { display: block; text-decoration: none; color: inherit; padding: 1.25rem; }
    .card img { width: calc(100% + 2.5rem); margin: -1.25rem -1.25rem 1rem; aspect-ratio: 16/9; object-fit: cover; display: block; }
    .card h2 { margin: 0 0 .5rem; font-size: 1.125rem; }
    .card p { margin: 0 0 .5rem; color: #666; font-size: .9rem; }
    .card time { font-size: .75rem; color: #999; }
    .article { background: #fff; padding: 2rem; border-radius: 12px; border: 1px solid #eee; }
    .article img { max-width: 100%; height: auto; border-radius: 8px; margin: 1rem 0; }
    .back { display: inline-block; margin-bottom: 1rem; color: #666; text-decoration: none; font-size: .875rem; }
    .back:hover { color: #222; }
    .loading, .error { text-align: center; padding: 3rem 1rem; color: #999; }
    .error { color: #c00; }
  </style>
</head>
<body>
  <div id="app">
    <p class="loading">Carregant...</p>
  </div>

  <script>
    // ─────────────────────────────────────────────────────────
    // Configuració — generada per Carma per a aquest site
    // ─────────────────────────────────────────────────────────
    const CARMA_API_URL = '${apiUrl}';
    const CARMA_API_KEY = '${apiKey}';

    // ─────────────────────────────────────────────────────────
    // Routing per query string
    //   noticies.html              → llistat
    //   noticies.html?slug=foo     → article individual
    // ─────────────────────────────────────────────────────────
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');

    function escapeHtml(s) {
      return (s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    function formatDate(iso) {
      try { return new Date(iso).toLocaleDateString('ca-ES', { year: 'numeric', month: 'long', day: 'numeric' }); }
      catch { return iso; }
    }

    async function carmaFetch(query) {
      const res = await fetch(CARMA_API_URL + query, {
        headers: { 'x-api-key': CARMA_API_KEY }
      });
      if (!res.ok) throw new Error('Error API: ' + res.status);
      return res.json();
    }

    async function renderList() {
      try {
        const { posts } = await carmaFetch('?limit=20');
        if (!posts.length) {
          document.getElementById('app').innerHTML = '<p class="loading">Encara no hi ha articles publicats.</p>';
          return;
        }
        document.getElementById('app').innerHTML = \`
          <h1>Notícies</h1>
          <div class="grid">
            \${posts.map(p => \`
              <article class="card">
                <a href="?slug=\${encodeURIComponent(p.slug)}">
                  \${p.featured_image ? \`<img src="\${escapeHtml(p.featured_image)}" alt="" />\` : ''}
                  <h2>\${escapeHtml(p.title)}</h2>
                  \${p.excerpt ? \`<p>\${escapeHtml(p.excerpt)}</p>\` : ''}
                  <time>\${escapeHtml(formatDate(p.created_at))}</time>
                </a>
              </article>
            \`).join('')}
          </div>
        \`;
      } catch (err) {
        document.getElementById('app').innerHTML = '<p class="error">Error carregant articles: ' + escapeHtml(err.message) + '</p>';
      }
    }

    async function renderArticle(slug) {
      try {
        const { post } = await carmaFetch('?slug=' + encodeURIComponent(slug));
        if (!post) {
          document.getElementById('app').innerHTML = '<p class="error">Article no trobat. <a href="?">Tornar al llistat</a></p>';
          return;
        }
        document.title = post.title + ' · Notícies';
        document.getElementById('page-title').textContent = document.title;
        document.getElementById('app').innerHTML = \`
          <article class="article">
            <a class="back" href="?">← Tornar al llistat</a>
            <h1>\${escapeHtml(post.title)}</h1>
            <time>\${escapeHtml(formatDate(post.created_at))}</time>
            \${post.featured_image ? \`<img src="\${escapeHtml(post.featured_image)}" alt="" />\` : ''}
            <div>\${post.content?.html ?? ''}</div>
          </article>
        \`;
      } catch (err) {
        document.getElementById('app').innerHTML = '<p class="error">Error carregant article: ' + escapeHtml(err.message) + '</p>';
      }
    }

    // Bootstrap
    if (slug) renderArticle(slug);
    else renderList();
  </script>
</body>
</html>`

  return (
    <Steps>
      <Step n={0} title="Què fa aquest fitxer">
        <p>És un fitxer HTML <strong>autocontingut</strong> que el client pot pujar al seu hosting. Inclou:</p>
        <ul className="space-y-1.5">
          <Li>El llistat d&apos;articles a <Code>noticies.html</Code></Li>
          <Li>L&apos;article individual a <Code>noticies.html?slug=el-meu-article</Code></Li>
          <Li>Estil bàsic responsive (substitueix-lo pel CSS del client)</Li>
          <Li>La teva clau API ja inserida</Li>
        </ul>
        <Warning small>
          Els crawlers no sempre executen JavaScript. Si SEO és crític, considera el mètode <strong>Servir des de Carma</strong> (render proxy) que entrega HTML pre-renderitzat.
        </Warning>
      </Step>

      <Step n={1} title="Copiar el fitxer noticies.html">
        <p>Aquest és el contingut sencer del fitxer. Clica <Btn>Copiar</Btn> a dalt a la dreta del bloc:</p>
        <CodeBlock code={fullFile} language="html" />
      </Step>

      <Step n={2} title="Pujar al servidor del client">
        <p>Tens varies opcions segons com gestionen el hosting:</p>
        <div className="space-y-2 mt-2">
          <ul className="space-y-1.5">
            <Li><Strong>Opció A — FTP/SFTP</Strong> (FileZilla, Cyberduck): connecta amb les credencials del hosting, ves a <Code>public_html/</Code> (o <Code>htdocs/</Code> o <Code>www/</Code>), arrossega el fitxer.</Li>
            <Li><Strong>Opció B — cPanel</Strong>: entra a cPanel → <Btn>File Manager</Btn> → <Code>public_html/</Code> → <Btn>Upload</Btn>.</Li>
            <Li><Strong>Opció C — Git</Strong>: si el site està a un repo, fes commit del fitxer i push.</Li>
            <Li><Strong>Opció D — sense FTP/SSH</Strong>: si el client té WordPress, instal·la el plugin gratuït <Code>WPCode</Code> i pega-hi el contingut amb el shortcode.</Li>
          </ul>
        </div>
      </Step>

      <Step n={3} title="Provar">
        <ol className="space-y-2 list-none">
          <Li><Strong>3.1.</Strong> Obre <Code>https://la-seva-web.cat/noticies.html</Code> en mode incògnit</Li>
          <Li><Strong>3.2.</Strong> Has de veure el llistat amb les 20 últimes publicacions</Li>
          <Li><Strong>3.3.</Strong> Clica un article — la URL canvia a <Code>noticies.html?slug=...</Code> i es mostra el contingut sencer</Li>
          <Li><Strong>3.4.</Strong> Clica <Strong>← Tornar al llistat</Strong> per tornar enrere</Li>
        </ol>
      </Step>

      <Step n={4} title="Adaptar l'estil (opcional però recomanat)">
        <p>El fitxer porta un CSS bàsic dins l&apos;etiqueta <Code>{'<style>'}</Code>. Per integrar-lo amb la identitat visual del client:</p>
        <ol className="space-y-2 list-none">
          <Li><Strong>4.1.</Strong> Esborra el bloc <Code>{'<style>...</style>'}</Code> sencer</Li>
          <Li><Strong>4.2.</Strong> Al <Code>{'<head>'}</Code> afegeix un link al CSS del client: <Code>{'<link rel="stylesheet" href="/css/main.css" />'}</Code></Li>
          <Li><Strong>4.3.</Strong> Canvia les classes <Code>.card</Code>, <Code>.grid</Code>, <Code>.article</Code> dins el JavaScript per les classes del client (ex: <Code>.news-card</Code>, <Code>.news-grid</Code>...)</Li>
        </ol>
        <Note>
          <strong>Alternativa més neta:</strong> en lloc d&apos;aquest fitxer, configura el <strong>tema</strong> i usa el mètode <strong>Render proxy</strong> (Cloudflare Worker). Carma servirà l&apos;HTML amb el look del client automàticament.
        </Note>
      </Step>
    </Steps>
  )
}

function PhpApiGuide({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  return (
    <Steps>
      <Step n={1} title="Fitxer PHP">
        <p>Crea <Code>noticies.php</Code>:</p>
        <CodeBlock code={`<?php
function carma_get_posts(int $limit = 20): array {
    $ch = curl_init('${apiUrl}?limit=' . $limit);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['x-api-key: ${apiKey}'],
        CURLOPT_TIMEOUT        => 10,
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    return json_decode($body, true)['posts'] ?? [];
}

$posts = carma_get_posts();
?>
<!doctype html>
<html lang="ca">
<head><meta charset="utf-8" /><title>Notícies</title></head>
<body>
  <h1>Notícies</h1>
  <?php foreach ($posts as $post): ?>
    <article>
      <?php if (!empty($post['featured_image'])): ?>
        <img src="<?= htmlspecialchars($post['featured_image']) ?>" alt="" />
      <?php endif; ?>
      <h2><?= htmlspecialchars($post['title']) ?></h2>
      <?php if (!empty($post['excerpt'])): ?>
        <p><?= htmlspecialchars($post['excerpt']) ?></p>
      <?php endif; ?>
      <?= $post['content']['html'] ?? '' ?>
    </article>
  <?php endforeach; ?>
</body>
</html>`} language="php" />
      </Step>

      <Step n={2} title="Pujar al servidor i provar">
        <p>Puja el fitxer via FTP a l&apos;arrel del site i obre <Code>la-seva-web.cat/noticies.php</Code></p>
      </Step>
    </Steps>
  )
}

function WordPressApiGuide({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  return (
    <Steps>
      <Step n={0} title="Prerequisits">
        <ul className="space-y-1.5">
          <Li>Accés FTP/cPanel al WordPress</Li>
          <Li>Coneixement bàsic d&apos;editar <Code>functions.php</Code> o saber crear plugins</Li>
        </ul>
      </Step>

      <Step n={1} title="Crear el codi del shortcode">
        <p>Opció A: afegir-ho a <Code>wp-content/themes/EL-TEMA/functions.php</Code>. Opció B (recomanada): crear un plugin nou a <Code>wp-content/plugins/carma-shortcode/carma-shortcode.php</Code>.</p>
        <CodeBlock code={`<?php
/**
 * Plugin Name: Carma Shortcode
 * Description: Shortcode [carma_blog limit="10"] per inserir articles de Carma.
 */
if (!defined('ABSPATH')) exit;

function carma_fetch_posts(int $limit = 20): array {
    $cache_key = "carma_posts_$limit";
    $cached = get_transient($cache_key);
    if ($cached !== false) return $cached;

    $response = wp_remote_get(
        '${apiUrl}?limit=' . $limit,
        [
            'headers' => ['x-api-key' => '${apiKey}'],
            'timeout' => 10,
        ]
    );
    if (is_wp_error($response)) return [];

    $posts = json_decode(wp_remote_retrieve_body($response), true)['posts'] ?? [];
    set_transient($cache_key, $posts, 5 * MINUTE_IN_SECONDS);
    return $posts;
}

add_shortcode('carma_blog', function ($atts) {
    $a = shortcode_atts(['limit' => 10], $atts);
    $posts = carma_fetch_posts((int) $a['limit']);

    ob_start(); ?>
    <div class="carma-blog">
      <?php foreach ($posts as $post): ?>
        <article class="carma-post">
          <h2><?= esc_html($post['title']) ?></h2>
          <?php if (!empty($post['featured_image'])): ?>
            <img src="<?= esc_url($post['featured_image']) ?>" alt="" />
          <?php endif; ?>
          <?= wp_kses_post($post['content']['html'] ?? '') ?>
        </article>
      <?php endforeach; ?>
    </div>
    <?php return ob_get_clean();
});`} language="php" />
      </Step>

      <Step n={2} title="Activar (només si has fet plugin)">
        <p>WordPress Admin → Plugins → activa <Strong>Carma Shortcode</Strong>.</p>
      </Step>

      <Step n={3} title="Inserir el shortcode al lloc desitjat">
        <ol className="space-y-2 list-none">
          <Li><Strong>3.1.</Strong> Crea una pàgina nova (o edita una existent)</Li>
          <Li><Strong>3.2.</Strong> Afegeix un bloc <Code>Shortcode</Code> (al editor Gutenberg)</Li>
          <Li><Strong>3.3.</Strong> Enganxa: <Code>[carma_blog limit=&quot;20&quot;]</Code></Li>
          <Li><Strong>3.4.</Strong> Publica</Li>
        </ol>
      </Step>
    </Steps>
  )
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function Steps({ children }: { children: ReactNode }) {
  return <div className="space-y-2.5">{children}</div>
}

function Step({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: ReactNode }) {
  const [open, setOpen] = useState(n <= 1)
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="cursor-pointer w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-subtle transition-colors text-left"
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${n === 0 ? 'bg-warning-soft text-warning' : 'bg-text text-white'}`}>
          {n === 0 ? '!' : n}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-subtle shrink-0" /> : <ChevronDown className="w-4 h-4 text-subtle shrink-0" />}
      </button>
      {open && (
        <div className="px-4 py-4 border-t border-border bg-surface-subtle/40 space-y-3 text-xs text-text leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}

function Li({ children }: { children: ReactNode }) {
  return <li className="flex items-start gap-1.5">
    <span className="w-1 h-1 rounded-full bg-subtle mt-2 shrink-0" />
    <span className="flex-1">{children}</span>
  </li>
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="text-text font-bold">{children}</strong>
}

function Btn({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-text text-white font-mono text-xs font-bold border border-white/15">
    <MousePointerClick className="w-2.5 h-2.5" />{children}
  </span>
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="relative bg-text rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-bold text-subtle uppercase tracking-widest">{language}</span>
        <InlineCopy text={code} dark />
      </div>
      <pre className="p-3 text-xs font-mono text-subtle overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  )
}

function InlineCopy({ text, dark = false }: { text: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* */ }
  }
  return (
    <button
      onClick={copy}
      className={`cursor-pointer flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-colors ${
        dark
          ? 'bg-white/15 hover:bg-white/25 text-subtle'
          : 'bg-surface border border-border hover:bg-surface-subtle text-muted'
      }`}
    >
      {copied ? <><Check className="w-3 h-3 text-accent" />Copiat</> : <><Copy className="w-3 h-3" />Copiar</>}
    </button>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="bg-surface-hover text-text px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="text-accent hover:text-accent underline inline-flex items-center gap-0.5 font-semibold">
      {children}<ExternalLink className="w-3 h-3" />
    </a>
  )
}

function Warning({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <div className={`bg-warning-soft border border-warning/30 rounded-xl flex items-start gap-3 ${small ? 'p-3' : 'p-4'}`}>
      <AlertTriangle className={`text-warning shrink-0 ${small ? 'w-3.5 h-3.5 mt-0.5' : 'w-4 h-4 mt-0.5'}`} />
      <div className={`text-warning ${small ? 'text-xs' : 'text-xs'} leading-relaxed`}>{children}</div>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="bg-accent-soft border border-accent/20 rounded-lg p-3 flex items-start gap-2">
      <Info className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
      <div className="text-xs text-muted leading-relaxed">{children}</div>
    </div>
  )
}
