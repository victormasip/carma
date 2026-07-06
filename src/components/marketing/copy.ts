// Landing copy — the ONLY place the marketing texts live, in the three UI
// languages. Voice (founder directive 2026-07-05): warm, direct, a bit cheeky,
// zero corporate filler — the landing should sound like Carma herself. Keys are
// a typed object (not the flat dashboard dict) because marketing copy carries
// structure: word-staggered headlines, step lists, FAQ pairs, the phone script.
//
// The locale is resolved server-side in app/page.tsx (cookie → Accept-Language
// → ca) and passed down; the nav switcher writes the same cookie the dashboard
// uses, so the language follows the visitor into the app.

import type { UiLocale } from '@/lib/i18n/config'

export type LandingCopy = {
  meta: { title: string; description: string }
  nav: { how: string; features: string; blog: string; pricing: string; login: string; signup: string; signupShort: string; menu: string }
  hero: { badge: string; h1a: string; h1b: string; sub: string; cta1: string; cta2: string; chips: string[] }
  how: { eyebrow: string; title: string; steps: { title: string; body: string }[] }
  bento: {
    eyebrow: string; title: string
    agentTitle: string; agentBody: string
    chatUser: string; chatDraftLead: string; chatDraftTitle: string; chatApprove: string; chatPublished: string; chatUrl: string
    cloneTitle: string; cloneBody: string
    editorTitle: string; editorBody: string
    modulesTitle: string; modulesBody: string
    langTitle: string; langBody: string
    statsTitle: string; statsBody: string
  }
  studio: { eyebrow: string; title: string; sub: string; bullets: string[]; cta: string; browserUrl: string; editBtn: string }
  clone: { eyebrow: string; title: string; sub: string; noSite: string }
  urlInput: { aria: string; placeholder: string; cta: string; ctaShort: string }
  pricing: {
    eyebrow: string; title: string
    freeName: string; freePrice: string; freePeriod: string; freePerks: string[]; freeCta: string
    premiumName: string; premiumPrice: string; premiumPeriod: string; premiumBadge: string; premiumPerks: string[]; premiumCta: string
    note: string
  }
  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] }
  waitlist: { title: string; sub: string; cloning: string }
  footer: { tagline: string; blog: string; login: string; signup: string; features: string }
  phone: {
    status: string; ack: string; badge: string; title: string; meta: string
    publish: string; edit: string; published: string; url: string; input: string
  }
}

const ca: LandingCopy = {
  meta: {
    title: 'Carma — El blog per WhatsApp',
    description:
      'Envia una nota de veu i publica un article SEO al teu blog. La Carma clona l’estil de la teva web, escriu per tu i publica quan tu ho dius. Sense codi, sense ordinador.',
  },
  nav: { how: 'Com funciona', features: 'Funcions', blog: 'Blog', pricing: 'Preus', login: 'Entra', signup: 'Comença gratis', signupShort: 'Comença', menu: 'Menú' },
  hero: {
    badge: 'El teu blog, per WhatsApp',
    h1a: 'Envia un WhatsApp.',
    h1b: 'Publica un article.',
    sub: 'La Carma viu al teu WhatsApp: li envies una idea — escrita o per àudio — i et torna un article a punt de publicar, amb el teu estil i el SEO fet. Tu només dius «publica».',
    cta1: 'Crea el meu blog',
    cta2: 'Clona la meva web',
    chips: ['Gratis per començar', 'Sense targeta', 'Clavat a la teva web', 'En el teu idioma'],
  },
  how: {
    eyebrow: 'Com funciona',
    title: 'De la idea a l’article publicat, sense obrir l’ordinador.',
    steps: [
      { title: 'Clona o crea el teu blog', body: 'Enganxa la teva URL i en 30 segons tens un blog que sembla fet pel teu dissenyador. Sense web? Tria una plantilla i llestos.' },
      { title: 'Connecta el teu WhatsApp', body: 'Un codi de sis xifres i ja està: la Carma és un contacte més. D’aquells que sempre responen.' },
      { title: 'Dicta. Revisa. Publica.', body: 'Li envies la idea mentre vas pel carrer. Quan arribes, l’esborrany t’espera amb dos botons: «Publicar» o «Editar». Tu manes.' },
    ],
  },
  bento: {
    eyebrow: 'Tot el que necessites',
    title: 'Ella escriu. Tu aproves. El blog creix.',
    agentTitle: 'Un agent que escriu per tu',
    agentBody: 'Text o nota de veu — la Carma et torna l’article sencer: títol, estructura, paraula clau i metadades. Vols canvis? Li ho dius com a una companya. I els fa.',
    chatUser: '🎙 «Un article sobre les novetats de la fira d’enguany…»',
    chatDraftLead: '✦ Esborrany a punt:',
    chatDraftTitle: '«La fira d’enguany: 7 novetats»',
    chatApprove: '✅ Publicar',
    chatPublished: 'Publicat!',
    chatUrl: 'la-teva-web.cat/fira-novetats',
    cloneTitle: 'Clonació amb vareta màgica',
    cloneBody: 'Capturem la capçalera i el peu reals de la teva web: el blog neix amb la teva identitat, no amb una plantilla que s’hi assembla.',
    editorTitle: 'Editor d’estil Notion',
    editorBody: 'Comandes «/», blocs rics, galeries i callouts. El dia que vulguis escriure tu, és un gust.',
    modulesTitle: 'Mòduls intel·ligents',
    modulesBody: 'Cerca, newsletter, paywall, articles relacionats… Cada peça s’activa amb un clic. Zero codi.',
    langTitle: 'Multi-idioma de veritat',
    langBody: 'El teu públic llegeix en català, castellà o anglès? La Carma detecta l’idioma i gestiona les traduccions amb un selector elegant.',
    statsTitle: 'Estadístiques clares',
    statsBody: 'Vistes, articles i creixement d’un cop d’ull. Sense cookies que espien.',
  },
  studio: {
    eyebrow: 'Carma Studio',
    title: 'Edita el blog tocant el blog.',
    sub: 'Res de panells infinits: cliques el que vols canviar i apareixen els seus controls. Cada retoc es veu a l’instant, sobre la pàgina de veritat.',
    bullets: [
      'Clica un títol, una targeta o el menú — i edites just allò',
      'Colors, lletres i disposició en directe, sense recarregar',
      'Doble clic i escrius sobre la pàgina mateixa',
    ],
    cta: 'Prova l’Studio',
    browserUrl: 'la-teva-web.cat/blog',
    editBtn: 'Edita aquest lloc',
  },
  clone: {
    eyebrow: 'Ja tens web?',
    title: 'Enganxa la URL. Mira néixer el teu blog.',
    sub: 'Capçalera, peu, colors i tipografies: clonats en 30 segons, amb l’agent ja a dins. Prova-ho — és gratis i fa una mica de màgia.',
    noSite: 'No tinc web · vull començar d’una plantilla',
  },
  urlInput: { aria: 'La URL del teu lloc web', placeholder: 'la-teva-web.cat', cta: 'Genera el meu blog', ctaShort: 'Generar' },
  pricing: {
    eyebrow: 'Preus',
    title: 'Comença gratis. Creix quan vulguis.',
    freeName: 'Free', freePrice: '0€', freePeriod: '/ per sempre',
    freePerks: ['1 blog clonat', 'Editor complet', 'Carma Studio', 'Subdomini Carma'],
    freeCta: 'Comença gratis',
    premiumName: 'Premium', premiumPrice: '19€', premiumPeriod: '/ mes', premiumBadge: 'Popular',
    premiumPerks: ['Agent de WhatsApp il·limitat', 'Tot el del pla Free', 'Blogs il·limitats', 'API i embed en directe', 'Domini propi', 'Múltiples editors'],
    premiumCta: 'Prova Premium',
    note: 'Preus de llançament orientatius · es confirmaran abans de cobrar res.',
  },
  faq: {
    eyebrow: 'Preguntes',
    title: 'El que tothom ens pregunta.',
    items: [
      {
        q: 'Què fa exactament la Carma?',
        a: 'Li envies una idea per WhatsApp — text o àudio — i et torna un article complet: títol, estructura, SEO i metadades. El revises amb un enllaç, el publiques amb un botó. I si vols canvis, li ho dius com li diries a una persona.',
      },
      {
        q: 'El blog es veurà com la meva web?',
        a: 'Sí. Clonem la teva capçalera i el teu peu reals i n’extraiem colors i tipografies. El blog neix amb la teva identitat, i el pots afinar tocant-lo amb el Carma Studio.',
      },
      {
        q: 'Necessito targeta per començar?',
        a: 'No. El pla Free és gratis per sempre: un blog, l’editor complet i l’Studio. Premium només quan tu vulguis.',
      },
      {
        q: 'Puc portar els articles del meu WordPress?',
        a: 'Sí — detectem el teu WordPress i n’importem els articles amb imatges, categories i SEO. També funciona amb altres blogs, via RSS o lectura directa.',
      },
    ],
  },
  waitlist: {
    title: 'Enganxa una URL.',
    sub: 'Un blog idèntic a la teva web en 30 segons — amb l’agent de WhatsApp a dins.',
    cloning: 'Clonant la teva web…',
  },
  footer: { tagline: 'Fet amb daurat a Catalunya', blog: 'Blog', login: 'Entra', signup: 'Comença', features: 'Funcions' },
  phone: {
    status: 'en línia',
    ack: 'Quina bona idea! M’hi poso ara mateix ✨',
    badge: '✦ Esborrany a punt',
    title: '5 rutes de tardor per descobrir el Berguedà',
    meta: 'SEO llest · 950 paraules · 3 seccions',
    publish: '✅ Publicar',
    edit: '✏️ Editar',
    published: 'Publicat! 🎉',
    url: 'la-teva-web.cat/rutes-tardor',
    input: 'Missatge…',
  },
}

const es: LandingCopy = {
  meta: {
    title: 'Carma — El blog por WhatsApp',
    description:
      'Envía una nota de voz y publica un artículo SEO en tu blog. Carma clona el estilo de tu web, escribe por ti y publica cuando tú lo dices. Sin código, sin ordenador.',
  },
  nav: { how: 'Cómo funciona', features: 'Funciones', blog: 'Blog', pricing: 'Precios', login: 'Entra', signup: 'Empieza gratis', signupShort: 'Empieza', menu: 'Menú' },
  hero: {
    badge: 'Tu blog, por WhatsApp',
    h1a: 'Envía un audio.',
    h1b: 'Publica un artículo.',
    sub: 'Carma vive en tu WhatsApp: le mandas una idea — escrita o hablada — y te devuelve un artículo listo para publicar, con tu estilo y el SEO hecho. Tú solo dices «publica».',
    cta1: 'Crea mi blog',
    cta2: 'Clona mi web',
    chips: ['Gratis para empezar', 'Sin tarjeta', 'Clavado a tu web', 'En tu idioma'],
  },
  how: {
    eyebrow: 'Cómo funciona',
    title: 'De la idea al artículo publicado, sin abrir el ordenador.',
    steps: [
      { title: 'Clona o crea tu blog', body: 'Pega tu URL y en 30 segundos tienes un blog que parece hecho por tu diseñador. ¿Sin web? Elige una plantilla y listo.' },
      { title: 'Conecta tu WhatsApp', body: 'Un código de seis cifras y ya está: Carma pasa a ser un contacto más. De los que siempre contestan.' },
      { title: 'Dicta. Revisa. Publica.', body: 'Le mandas la idea andando por la calle. Al llegar, el borrador te espera con dos botones: «Publicar» o «Editar». Tú mandas.' },
    ],
  },
  bento: {
    eyebrow: 'Todo lo que necesitas',
    title: 'Ella escribe. Tú apruebas. El blog crece.',
    agentTitle: 'Un agente que escribe por ti',
    agentBody: 'Texto o nota de voz — Carma te devuelve el artículo entero: título, estructura, palabra clave y metadatos. ¿Quieres cambios? Se lo dices como a una compañera. Y los hace.',
    chatUser: '🎙 «Un artículo sobre las novedades de la feria de este año…»',
    chatDraftLead: '✦ Borrador listo:',
    chatDraftTitle: '«La feria de este año: 7 novedades»',
    chatApprove: '✅ Publicar',
    chatPublished: '¡Publicado!',
    chatUrl: 'tu-web.es/feria-novedades',
    cloneTitle: 'Clonación con varita mágica',
    cloneBody: 'Capturamos la cabecera y el pie reales de tu web: el blog nace con tu identidad, no con una plantilla que se le parece.',
    editorTitle: 'Editor estilo Notion',
    editorBody: 'Comandos «/», bloques ricos, galerías y callouts. El día que quieras escribir tú, es un gusto.',
    modulesTitle: 'Módulos inteligentes',
    modulesBody: 'Búsqueda, newsletter, paywall, artículos relacionados… Cada pieza se activa con un clic. Cero código.',
    langTitle: 'Multi-idioma de verdad',
    langBody: '¿Tu público lee en catalán, castellano o inglés? Carma detecta el idioma y gestiona las traducciones con un selector elegante.',
    statsTitle: 'Estadísticas claras',
    statsBody: 'Visitas, artículos y crecimiento de un vistazo. Sin cookies que espían.',
  },
  studio: {
    eyebrow: 'Carma Studio',
    title: 'Edita el blog tocando el blog.',
    sub: 'Nada de paneles infinitos: haces clic en lo que quieres cambiar y aparecen sus controles. Cada retoque se ve al instante, sobre la página de verdad.',
    bullets: [
      'Haz clic en un título, una tarjeta o el menú — y editas justo eso',
      'Colores, letras y disposición en directo, sin recargar',
      'Doble clic y escribes sobre la página misma',
    ],
    cta: 'Prueba el Studio',
    browserUrl: 'tu-web.es/blog',
    editBtn: 'Edita este sitio',
  },
  clone: {
    eyebrow: '¿Ya tienes web?',
    title: 'Pega la URL. Mira nacer tu blog.',
    sub: 'Cabecera, pie, colores y tipografías: clonados en 30 segundos, con el agente ya dentro. Pruébalo — es gratis y hace un poco de magia.',
    noSite: 'No tengo web · quiero empezar de una plantilla',
  },
  urlInput: { aria: 'La URL de tu sitio web', placeholder: 'tu-web.es', cta: 'Genera mi blog', ctaShort: 'Generar' },
  pricing: {
    eyebrow: 'Precios',
    title: 'Empieza gratis. Crece cuando quieras.',
    freeName: 'Free', freePrice: '0€', freePeriod: '/ para siempre',
    freePerks: ['1 blog clonado', 'Editor completo', 'Carma Studio', 'Subdominio Carma'],
    freeCta: 'Empieza gratis',
    premiumName: 'Premium', premiumPrice: '19€', premiumPeriod: '/ mes', premiumBadge: 'Popular',
    premiumPerks: ['Agente de WhatsApp ilimitado', 'Todo lo del plan Free', 'Blogs ilimitados', 'API y embed en directo', 'Dominio propio', 'Varios editores'],
    premiumCta: 'Prueba Premium',
    note: 'Precios de lanzamiento orientativos · se confirmarán antes de cobrar nada.',
  },
  faq: {
    eyebrow: 'Preguntas',
    title: 'Lo que todo el mundo nos pregunta.',
    items: [
      {
        q: '¿Qué hace exactamente Carma?',
        a: 'Le mandas una idea por WhatsApp — texto o audio — y te devuelve un artículo completo: título, estructura, SEO y metadatos. Lo revisas con un enlace, lo publicas con un botón. Y si quieres cambios, se lo dices como se lo dirías a una persona.',
      },
      {
        q: '¿El blog se verá como mi web?',
        a: 'Sí. Clonamos tu cabecera y tu pie reales y extraemos colores y tipografías. El blog nace con tu identidad, y lo puedes afinar tocándolo con el Carma Studio.',
      },
      {
        q: '¿Necesito tarjeta para empezar?',
        a: 'No. El plan Free es gratis para siempre: un blog, el editor completo y el Studio. Premium solo cuando tú quieras.',
      },
      {
        q: '¿Puedo traer los artículos de mi WordPress?',
        a: 'Sí — detectamos tu WordPress e importamos los artículos con imágenes, categorías y SEO. También funciona con otros blogs, vía RSS o lectura directa.',
      },
    ],
  },
  waitlist: {
    title: 'Pega una URL.',
    sub: 'Un blog idéntico a tu web en 30 segundos — con el agente de WhatsApp dentro.',
    cloning: 'Clonando tu web…',
  },
  footer: { tagline: 'Hecho con dorado en Cataluña', blog: 'Blog', login: 'Entra', signup: 'Empieza', features: 'Funciones' },
  phone: {
    status: 'en línea',
    ack: '¡Qué buena idea! Me pongo ahora mismo ✨',
    badge: '✦ Borrador listo',
    title: '5 rutas de otoño para descubrir el Berguedà',
    meta: 'SEO listo · 950 palabras · 3 secciones',
    publish: '✅ Publicar',
    edit: '✏️ Editar',
    published: '¡Publicado! 🎉',
    url: 'tu-web.es/rutas-otono',
    input: 'Mensaje…',
  },
}

const en: LandingCopy = {
  meta: {
    title: 'Carma — The blog that writes itself on WhatsApp',
    description:
      'Send a voice note, publish an SEO article. Carma clones your website’s look, writes for you, and publishes when you say go. No code, no laptop.',
  },
  nav: { how: 'How it works', features: 'Features', blog: 'Blog', pricing: 'Pricing', login: 'Log in', signup: 'Start free', signupShort: 'Start', menu: 'Menu' },
  hero: {
    badge: 'Your blog, on WhatsApp',
    h1a: 'Send a voice note.',
    h1b: 'Publish an article.',
    sub: 'Carma lives in your WhatsApp: send an idea — typed or spoken — and get back an article ready to publish, in your style, SEO included. You just say «publish».',
    cta1: 'Create my blog',
    cta2: 'Clone my website',
    chips: ['Free to start', 'No card needed', 'Matches your website', 'In your language'],
  },
  how: {
    eyebrow: 'How it works',
    title: 'From idea to published article, without opening your laptop.',
    steps: [
      { title: 'Clone or create your blog', body: 'Paste your URL and 30 seconds later you have a blog that looks made by your designer. No website? Pick a template and go.' },
      { title: 'Connect your WhatsApp', body: 'A six-digit code and that’s it: Carma becomes one more contact. The kind that always replies.' },
      { title: 'Dictate. Review. Publish.', body: 'Send the idea while you walk. By the time you arrive, the draft is waiting with two buttons: «Publish» or «Edit». You’re in charge.' },
    ],
  },
  bento: {
    eyebrow: 'Everything you need',
    title: 'She writes. You approve. Your blog grows.',
    agentTitle: 'An agent that writes for you',
    agentBody: 'Text or voice note — Carma returns the full article: title, structure, keyword and metadata. Want changes? Tell her like you’d tell a colleague. She makes them.',
    chatUser: '🎙 “An article about what’s new at this year’s fair…”',
    chatDraftLead: '✦ Draft ready:',
    chatDraftTitle: '“This year’s fair: 7 highlights”',
    chatApprove: '✅ Publish',
    chatPublished: 'Published!',
    chatUrl: 'your-site.com/fair-highlights',
    cloneTitle: 'Magic-wand cloning',
    cloneBody: 'We capture your website’s real header and footer: your blog is born with your identity, not a lookalike template.',
    editorTitle: 'A Notion-style editor',
    editorBody: 'Slash commands, rich blocks, galleries and callouts. The day you feel like writing yourself, it’s a joy.',
    modulesTitle: 'Smart modules',
    modulesBody: 'Search, newsletter, paywall, related posts… every piece turns on with one click. Zero code.',
    langTitle: 'Truly multilingual',
    langBody: 'Your audience reads Catalan, Spanish or English? Carma detects the language and handles translations with an elegant switcher.',
    statsTitle: 'Clear analytics',
    statsBody: 'Views, posts and growth at a glance. No creepy cookies.',
  },
  studio: {
    eyebrow: 'Carma Studio',
    title: 'Edit the blog by touching the blog.',
    sub: 'No endless panels: click what you want to change and its controls appear. Every tweak shows instantly, on the real page.',
    bullets: [
      'Click a heading, a card or the menu — and edit exactly that',
      'Colors, fonts and layout live, no reloads',
      'Double-click and type right on the page',
    ],
    cta: 'Try the Studio',
    browserUrl: 'your-site.com/blog',
    editBtn: 'Edit this site',
  },
  clone: {
    eyebrow: 'Already have a website?',
    title: 'Paste your URL. Watch your blog be born.',
    sub: 'Header, footer, colors and fonts — cloned in 30 seconds, agent already inside. Try it: it’s free and slightly magical.',
    noSite: 'No website · I’ll start from a template',
  },
  urlInput: { aria: 'Your website URL', placeholder: 'your-site.com', cta: 'Generate my blog', ctaShort: 'Generate' },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Start free. Grow when you’re ready.',
    freeName: 'Free', freePrice: '€0', freePeriod: '/ forever',
    freePerks: ['1 cloned blog', 'Full editor', 'Carma Studio', 'Carma subdomain'],
    freeCta: 'Start free',
    premiumName: 'Premium', premiumPrice: '€19', premiumPeriod: '/ month', premiumBadge: 'Popular',
    premiumPerks: ['Unlimited WhatsApp agent', 'Everything in Free', 'Unlimited blogs', 'API & live embed', 'Custom domain', 'Multiple editors'],
    premiumCta: 'Try Premium',
    note: 'Launch prices, indicative · confirmed before any charge.',
  },
  faq: {
    eyebrow: 'Questions',
    title: 'What everyone asks us.',
    items: [
      {
        q: 'What exactly does Carma do?',
        a: 'You send an idea on WhatsApp — text or voice — and get back a complete article: title, structure, SEO and metadata. Review it with a link, publish it with a button. Want changes? Just tell her, like you would a person.',
      },
      {
        q: 'Will the blog look like my website?',
        a: 'Yes. We clone your real header and footer and extract your colors and fonts. The blog is born with your identity, and you can fine-tune it by touching it in Carma Studio.',
      },
      {
        q: 'Do I need a card to start?',
        a: 'No. The Free plan is free forever: one blog, the full editor and the Studio. Premium only when you want it.',
      },
      {
        q: 'Can I import my WordPress posts?',
        a: 'Yes — we detect your WordPress and import your posts with images, categories and SEO. Works with other blogs too, via RSS or direct read.',
      },
    ],
  },
  waitlist: {
    title: 'Paste a URL.',
    sub: 'A blog identical to your website in 30 seconds — WhatsApp agent included.',
    cloning: 'Cloning your website…',
  },
  footer: { tagline: 'Made with gold in Catalonia', blog: 'Blog', login: 'Log in', signup: 'Start', features: 'Features' },
  phone: {
    status: 'online',
    ack: 'Great idea! On it right now ✨',
    badge: '✦ Draft ready',
    title: '5 autumn trails to discover the Pyrenees',
    meta: 'SEO done · 950 words · 3 sections',
    publish: '✅ Publish',
    edit: '✏️ Edit',
    published: 'Published! 🎉',
    url: 'your-site.com/autumn-trails',
    input: 'Message…',
  },
}

export const LANDING: Record<UiLocale, LandingCopy> = { ca, es, en }
