// Landing copy — the ONLY place the marketing texts live, in the three UI
// languages.
//
// VOICE (founder directive 2026-07-05, re-affirmed 2026-09-16): warm, direct, a
// bit cheeky, zero corporate filler. The landing should sound like Carma herself,
// not like a landing page. Short sentences. Concrete nouns. No "empower", no
// "seamless", no "revolutionise", no exclamation marks except where a human would
// actually use one.
//
// CATALAN IS WRITTEN FIRST AND TRANSLATED SECOND, never the reverse. A Catalan
// page translated out of English reads like a translation, and this product's
// entire positioning is that it does not.
//
// The locale is resolved server-side in app/page.tsx (cookie → Accept-Language →
// ca) and passed down; the nav switcher writes the same cookie the dashboard
// uses, so the language follows the visitor into the app.
//
// TYPOGRAPHY NOTE: Catalan's geminated L is written `l·l` (l + U+00B7 + l), which
// lives in Latin-1 and is covered by the `latin` Google-Fonts subset. Never use
// the precomposed U+0140 `ŀ` here — it is outside the subset we load and would
// render in the fallback face mid-word.

import type { UiLocale } from '@/lib/i18n/config'

export type Beat = { lead: string; body: string }
export type Denial = { claim: string; truth: string }
export type LoopStep = { title: string; body: string }

export type LandingCopy = {
  meta: { title: string; description: string }
  nav: {
    /** The map of the page. `tier` decides where a link survives the squeeze:
     *  1 = always in the bar, 2 = from lg, 3 = from xl. The mobile sheet shows
     *  every one of them, which is the whole point of having a sheet. */
    how: string; estudi: string; voice: string; comunitat: string; punts: string
    faq: string; blog: string
    login: string; signup: string; signupShort: string; menu: string; close: string
    /** The dual-choice modal behind "Comença gratis" (founder, 2026-09-17).
     *  A CTA that scrolls somewhere is not an answer to "how do I start?" — the
     *  two real starting points are "I have a brand" and "I have nothing yet",
     *  and until now only one of them was ever offered above the fold. */
    start: {
      title: string
      sub: string
      brandTitle: string
      brandBody: string
      brandPoints: string[]
      brandCta: string
      scratchTitle: string
      scratchBody: string
      scratchPoints: string[]
      scratchCta: string
      foot: string
    }
  }

  hero: {
    h1a: string
    h1b: string
    sub: string
    trust: string
  }

  /** The Door — the one ask, used at the top and at the close. */
  door: {
    title: string
    titleClose: string
    placeholder: string
    hint: string
    cta: string
    ctaShort: string
    aria: string
    voiceCta: string
    voiceHint: string
    /** Strings for the on-demand recorder, so an English visitor never meets a
     *  Catalan button. Shape mirrors VoiceRecorderLabels (kept structural, not
     *  imported, so this file stays free of component dependencies). */
    voice: {
      cta: string; ctaHint: string; stop: string; note: string; noteHint: string
      discard: string; play: string; pause: string; tooShort: string; denied: string
    }
    /** Live reactions — the page listening before you press anything. */
    sawUrl: string
    sawText: string
    /** Plain strings with a {n} placeholder — NEVER functions. This object
     *  crosses into a client component, and a function prop throws there. */
    sawFileOne: string
    sawFileMany: string
    sawVoice: string
    dropTitle: string
    dropBody: string
    /** While the glimpse runs. */
    reading: string
    /** The reveal. */
    revealTitle: string
    revealPagesOne: string
    revealPagesMany: string
    /** Brand Brain 2.0 — what she understood, and the three pitches. */
    thinking: string
    understoodTitle: string
    sectorLabel: string
    audienceLabel: string
    edgeLabel: string
    gapsLabel: string
    pitchesTitle: string
    pitchesLead: string
    pitchWhy: string
    pitchKeyword: string
    revealCta: string
    revealBack: string
    /** Failure, stated plainly and never as a dead end. */
    failTitle: string
    failBody: string
    failCta: string
    tooFast: string
    /** The other front door: no website at all. Never a footnote. */
    noWebLead: string
    noWebCta: string
  }

  conversa: {
    title: string
    sub: string
    beats: Beat[]
    phone: {
      contact: string
      status: string
      voiceLen: string
      ack: string
      draftBadge: string
      draftTitle: string
      draftMeta: string
      approve: string
      revise: string
      published: string
      url: string
      composer: string
    }
    /** SCENE 2's PHONE — the REVISION, performed.
     *
     *  It used to be the hero's conversation again with different words: a voice
     *  note, an ack, a draft, done. Founder, 2026-09-17: the second mockup has to
     *  "demonstrate the actual WhatsApp editing process". So this one starts where
     *  the hero ends — a draft already exists — and shows the thing an owner
     *  actually does every week: type what to change, in words, and watch it come
     *  back changed. Same six beats, so the pinned scroll timeline is untouched. */
    phoneEdit: {
      contact: string
      status: string
      draftBadge: string
      draftTitle: string
      draftMeta: string
      /** Beat 2 — the owner's change request, outgoing. */
      ask: string
      /** Beat 4 — she confirms exactly what changed, then re-sends the draft. */
      ack: string
      newBadge: string
      newTitle: string
      newMeta: string
      /** Beat 5 — the two buttons, and the thumb picks one. */
      approve: string
      revise: string
      published: string
      url: string
      composer: string
    }
  }

  /** One band, not a scene: the blog lives inside the site you already have. */
  fidelitat: {
    title: string
    body: string
    proof: string
    noWeb: string
    noWebCta: string
  }

  veu: {
    title: string
    body: string
    /** The three inputs, each with the ONE thing it is good for. The old version
     *  was three bare chips and a reader had to guess why a PDF mattered. */
    sources: { label: string; body: string }[]
    /** The output, named: a voice sheet. Making the result a THING you can
     *  picture is what the old copy was missing. */
    cardTitle: string
    cardSub: string
    keeps: { label: string; body: string }[]
    /** The promise that replaces the "we save your literal sentences" line,
     *  which was both confusing and the exact thing it claimed not to do. */
    guarantee: string
    caption: string
    foot: string
  }

  estudi: {
    title: string
    body: string
    colorLabel: string
    fontLabel: string
    layoutLabel: string
    radiusLabel: string
    /** The real-Studio demo: selection labels, the hint, and the save state. */
    selectHint: string
    selBrand: string
    selNav: string
    selTitle: string
    selCard: string
    saved: string
    reset: string
    persistNote: string
    selSection: string
    selExcerpt: string
    selImage: string
    selPage: string
    imageLabel: string
    panelTitle: string
    editHint: string
    done: string
    sizeLabel: string
    sizeS: string
    sizeM: string
    sizeL: string
    cardLabel: string
    cardBorder: string
    cardShadow: string
    cardFlat: string
    alignLabel: string
    alignLeft: string
    alignCenter: string
    /** The modules, switchable one by one — an archetype you cannot modify is a
     *  screenshot with extra steps (founder, 2026-09-17). */
    modLabel: string
    modHint: string
    modOn: string
    /** Human names for every toggleable module, keyed by its registry id. */
    modNames: Record<string, string>
    groundLabel: string
    groundLight: string
    groundDark: string
    widthLabel: string
    widthNarrow: string
    widthWide: string
    /** Shown on the archetype rail once the visitor has made it their own. */
    archCustom: string
    /** The content the demo blog starts from. Neutral on purpose: borrowing a
     *  real company's identity added nothing and put their brand on our page. */
    demoBrand: string
    demoNav: string[]
    demoSection: string
    demoPosts: { title: string; excerpt: string }[]
    fontSerif: string
    fontSans: string
    layoutGrid: string
    layoutList: string
    browserUrl: string
    more: string
    cta: string
    /** The three ready-to-play archetypes (ARCHETYPES in lib/render/archetypes).
     *  Names and tiers come from that file — the SERVER reads it and passes the
     *  data down, so the client island never imports the module registry. Only
     *  the words live here. */
    arch: {
      label: string
      note: string
      tierFree: string
      tierPremium: string
      tierGold: string
      /** One line per archetype id, in ARCHETYPES order. */
      pitch: { essencial: string; revista: string; creador: string }
      /** Micro-copy for the module chrome the demo page actually renders. */
      mod: {
        search: string
        all: string
        featured: string
        announce: string
        newsTitle: string
        newsBody: string
        newsCta: string
        newsEmail: string
        locked: string
        unlock: string
        clap: string
        comments: string
        commentBody: string
        count: string
      }
    }
  }

  noEs: { title: string; items: Denial[] }

  comunitat: {
    title: string
    body: string
    loopTitle: string
    loop: LoopStep[]
    loopFoot: string
    /** THE WALL. It used to paint the eight starter TEMPLATES and call them
     *  "Fet amb Carma", which is a claim about members made out of our own
     *  design files. It now reads the real ones (lib/marketing/wall.ts). */
    wallTitle: string
    wallNote: string
    wallModules: string
    wallPosts: string
    wallVisit: string
    /** Before the first member blog is public enough to show. */
    wallEmpty: string
  }

  punts: {
    title: string
    body: string
    /** All four tiers. The punt numbers are NOT here — they come from
     *  KARMA_ALLOCATIONS so the page and the wallet can never disagree. */
    plans: {
      id: 'free' | 'premium' | 'gold' | 'agency'
      name: string
      price: string
      period: string
      perks: string[]
      cta: string
      /** The one the eye should land on. */
      featured?: boolean
    }[]
    allowanceUnit: string
    cta: string
    ctaFree: string
    note: string
    costsTitle: string
    costs: { label: string; punts: string }[]
  }

  faq: { title: string; items: { q: string; a: string }[] }

  close: { title: string; sub: string; micro: string }

  footer: { tagline: string; blog: string; login: string; signup: string; madeIn: string }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  CATALÀ — the original                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

const ca: LandingCopy = {
  meta: {
    title: 'Carma — Tot el teu blog, des d’un sol missatge',
    description:
      'Envia una nota de veu per WhatsApp i publica un article al teu blog. La Carma llegeix la teva web, n’aprèn el to i escriu com tu. Sense codi, sense ordinador.',
  },
  nav: {
    how: 'Com funciona', estudi: 'L’Estudi', voice: 'La veu', comunitat: 'Comunitat',
    punts: 'Punts', faq: 'Preguntes', blog: 'Blog',
    login: 'Entra', signup: 'Comença gratis', signupShort: 'Comença', menu: 'Menú', close: 'Tanca',
    start: {
      title: 'Per on comences?',
      sub: 'Dues portes, i totes dues acaben amb el teu blog viu.',
      brandTitle: 'Ja tinc marca',
      brandBody: 'Tens web, catàleg o documents. Els llegim, n’aprenem el to i el blog neix amb la teva cara.',
      brandPoints: ['La teva capçalera i el teu peu, clonats', 'Colors i tipografies, els teus', 'L’agent aprèn com escrius'],
      brandCta: 'Llegeix la meva marca',
      scratchTitle: 'Començo de zero',
      scratchBody: 'Encara no tens res a internet. Tries un blog ja muntat i li expliques qui sou parlant.',
      scratchPoints: ['Vuit identitats a punt', 'Mòduls engegats i escrits', 'Publicat en un domini teu'],
      scratchCta: 'Tria un blog muntat',
      foot: 'Gratis les dues · sense targeta · pots canviar d’idea quan vulguis',
    },
  },

  hero: {
    h1a: 'El teu blog',
    h1b: 'per WhatsApp.',
    sub: 'Li envies una idea — escrita o parlada — i te la torna feta: article, títol, SEO i portada. Tu només dius «publica».',
    trust: 'Gratis · sense targeta · el teu blog en 60 segons',
  },

  door: {
    title: 'Comencem. Qui sou?',
    titleClose: 'Va. Digues-li qui sou.',
    placeholder: 'la-teva-web.cat',
    hint: 'Enganxa la teva web · deixa anar un PDF · o prem i parla',
    cta: 'Llegeix la meva web',
    ctaShort: 'Llegeix-la',
    aria: 'La teva web, un document o una descripció',
    voiceCta: 'Prem i parla',
    voiceHint: 'Trenta segons explicant què feu ja ens serveixen.',
    voice: {
      cta: 'Prem i parla', ctaHint: '· 30 segons expliquant què feu',
      stop: 'Parar', note: 'Nota de veu', noteHint: 'La faré servir per entendre com parles del teu negoci.',
      discard: 'Descartar la nota de veu', play: 'Escoltar', pause: 'Pausar',
      tooShort: 'Massa curt — mantén premut mentre parles.',
      denied: 'No podem accedir al micròfon. Revisa els permisos del navegador.',
    },
    sawUrl: 'Perfecte. Ja la miro.',
    sawText: 'També ens serveix. Explica’ns una mica més.',
    sawFileOne: 'Rebut. Un document diu molt.',
    sawFileMany: 'Rebuts: {n} documents. Això ens diu molt.',
    sawVoice: 'T’he sentit. Ja ho tinc.',
    dropTitle: 'Deixa’l anar',
    dropBody: 'PDF, Word, text o markdown. El llegeixo jo.',
    reading: 'Llegint-te',
    revealTitle: 'Això és el que he entès',
    revealPagesOne: 'He llegit 1 pàgina de la teva web',
    revealPagesMany: 'He llegit {n} pàgines de la teva web',
    thinking: 'Pensant-hi',
    understoodTitle: 'El que he entès',
    sectorLabel: 'Sector',
    audienceLabel: 'Qui us llegeix',
    edgeLabel: 'El que us fa diferents',
    gapsLabel: 'El que la vostra web encara no explica',
    pitchesTitle: 'Tres articles que hauríeu de publicar',
    pitchesLead: 'No són idees genèriques: surten del que he llegit a casa vostra.',
    pitchWhy: 'Per què funciona',
    pitchKeyword: 'Paraula clau',
    revealCta: 'Vull el meu blog',
    revealBack: 'Provar amb una altra web',
    failTitle: 'Aquesta no me la deixa llegir',
    failBody: 'Passa: hi ha webs blindades, o simplement caigudes. No és cap problema — m’ho pots explicar tu mateix quan entrem.',
    failCta: 'Continua igualment',
    tooFast: 'Frena una mica: has provat massa webs seguides. Torna-ho a provar d’aquí una estona.',
    noWebLead: 'Encara no tens web?',
    noWebCta: 'Comença de zero — tria una plantilla',
  },

  conversa: {
    title: 'No s’aprèn. Es parla.',
    sub: 'Baixa i mira com es fa un article. Tan de pressa com vulguis.',
    beats: [
      { lead: 'Li parles.', body: 'Una nota de veu de trenta segons, mentre condueixes o tanques la persiana.' },
      { lead: 'T’escolta.', body: 'Sense formularis, sense camps obligatoris, sense res per aprendre.' },
      { lead: 'Escriu.', body: 'Article sencer: títol, estructura, paraula clau, metadades i portada.' },
      { lead: 'Tu manes.', body: 'O el publiques, o li escrius què vols canviar amb les teves paraules. Ho torna fet.' },
      { lead: 'Publicat.', body: 'A la teva web, amb el teu disseny, i a Google des del primer minut.' },
    ],
    phone: {
      contact: 'Carma',
      status: 'en línia',
      voiceLen: '0:31',
      ack: 'Rebut. T’ho escric i te’l passo en un minut.',
      draftBadge: 'Esborrany a punt',
      draftTitle: '«La fira d’enguany: 7 novetats que no et pots perdre»',
      draftMeta: '1.240 paraules · clau: fira 2026 · 6 min de lectura',
      approve: 'Publicar',
      revise: 'Canviar-hi coses',
      published: 'Publicat!',
      url: 'la-teva-web.cat/fira-novetats',
      composer: 'Escriu un missatge',
    },
    phoneEdit: {
      contact: 'Carma',
      status: 'en línia',
      draftBadge: 'Esborrany a punt',
      draftTitle: '«Per què cobrem el que cobrem»',
      draftMeta: '1.310 paraules · de vostè · to neutre',
      ask: 'Escurça’l, tuteja i treu-ne la introducció. I posa-hi què feu quan dieu que no.',
      ack: 'Fet: 980 paraules, de tu, sense introducció i amb un apartat nou sobre quan dieu que no.',
      newBadge: 'Segona versió',
      newTitle: '«Per què cobrem el que cobrem (i quan diem que no)»',
      newMeta: '980 paraules · de tu · +1 apartat',
      approve: 'Ara sí, publica',
      revise: 'Un altre canvi',
      published: 'Publicat!',
      url: 'la-teva-web.cat/com-fixem-preus',
      composer: 'Escriu-li què vols canviar',
    },
  },

  fidelitat: {
    title: 'El blog viu dins la teva web. No en una altra banda.',
    body: 'La teva capçalera i el teu peu es queden exactament com són — logo, menú, tipografies i colors. L’únic que canvia és el que hi ha al mig.',
    proof: 'Provat amb 97 webs reals: ni una regla d’estil ni un color s’hi perden pel camí',
    noWeb: 'I si encara no en tens, de web?',
    noWebCta: 'Comença de zero amb una plantilla',
  },

  veu: {
    title: 'Primer t’escolta. Després escriu.',
    body: 'Abans del primer article, la Carma es fa una fitxa de com parles. No és una opinió sobre el teu to: són quatre decisions concretes que pren un cop i no canvia a mitja frase.',
    sources: [
      { label: 'La teva web', body: 'D’aquí surt com tractes qui et llegeix i com anomenes el que fas.' },
      { label: 'Els teus documents', body: 'Pressupostos, catàlegs, dossiers: el vocabulari de casa, el de veritat.' },
      { label: 'Trenta segons de veu', body: 'Com ho expliques quan no escrius. És el que més s’assembla a tu.' },
    ],
    cardTitle: 'La teva fitxa de veu',
    cardSub: 'Una pàgina. La fa un cop i la consulta a cada article.',
    keeps: [
      { label: 'A qui parles', body: 'De tu o de vostè, en singular o en plural. Ho decideix un cop i ho manté de la primera línia a l’última.' },
      { label: 'Les paraules de casa', body: 'Com anomenes els teus serveis, els teus llocs i la teva gent. Sense traduïr-ho a l’idioma del sector.' },
      { label: 'El ritme', body: 'Frases curtes o llargues, exemples o dades, un títol sobri o un de descarat. El teu compàs, no el seu.' },
      { label: 'El que no diries mai', body: 'Les paraules que no són teves queden fora. És per això que el primer article no sona a fullet.' },
    ],
    guarantee: 'No copia res de ningú. La fitxa descriu com escrius; les frases les escriu de nou, cada cop.',
    caption: 'Tot això passa abans del primer article, no després de queixar-te’n.',
    foot: 'Vols veure la teva? Enganxa la teva web aquí dalt i te la fa en deu segons.',
  },

  estudi: {
    title: 'Ho canvies tocant-ho.',
    body: 'Res de panells infinits. Cliques el que vols canviar i apareixen els seus controls, sobre la pàgina de veritat. Prova-ho aquí mateix:',
    colorLabel: 'Color',
    fontLabel: 'Lletra',
    layoutLabel: 'Disposició',
    radiusLabel: 'Cantonades',
    selectHint: 'Clica qualsevol cosa del blog i apareixeran els seus controls.',
    selBrand: 'La marca',
    selNav: 'El menú',
    selTitle: 'El títol',
    selCard: 'Les targetes',
    saved: 'Guardat',
    reset: 'Reinicia',
    persistNote: 'El que canviïs es queda guardat al teu navegador. Torna-hi quan vulguis: hi serà.',
    selSection: 'El títol del blog',
    selExcerpt: 'El resum',
    selImage: 'La imatge',
    selPage: 'Tota la pàgina',
    imageLabel: 'Tria una imatge',
    panelTitle: 'Res seleccionat',
    editHint: 'Escriu-hi el que vulguis. Prem Enter i es guarda.',
    done: 'Fet',
    sizeLabel: 'Mida', sizeS: 'Compacte', sizeM: 'Normal', sizeL: 'Ample',
    cardLabel: 'Targetes', cardBorder: 'Vora', cardShadow: 'Ombra', cardFlat: 'Plana',
    alignLabel: 'Alineació', alignLeft: 'Esquerra', alignCenter: 'Centre',
    modLabel: 'Mòduls d’aquest blog',
    modHint: 'Encén i apaga el que vulguis — la pàgina de sota canvia de debò.',
    modOn: 'encesos',
    modNames: {
      announcementBar: 'Barra d’avís',
      featuredHero: 'Article destacat',
      search: 'Cercador',
      categoryFilters: 'Filtres per tema',
      tableOfContents: 'Índex de l’article',
      keyTakeaways: 'Punts clau',
      pullQuote: 'Frase destacada',
      readingProgress: 'Progrés de lectura',
      authorCard: 'Fitxa de l’autor',
      socialShare: 'Compartir',
      whatsappShare: 'Compartir per WhatsApp',
      relatedPosts: 'Articles relacionats',
      readNext: 'Llegeix ara',
      prevNext: 'Anterior i següent',
      likes: 'Aplaudiments',
      comments: 'Comentaris',
      newsletter: 'Newsletter',
      paywall: 'Mur de pagament',
      backToTop: 'Tornar a dalt',
    },
    groundLabel: 'Fons', groundLight: 'Clar', groundDark: 'Fosc',
    widthLabel: 'Amplada', widthNarrow: 'Estreta', widthWide: 'Ampla',
    archCustom: 'A la teva manera',
    demoBrand: 'El teu negoci',
    demoNav: ['Nosaltres', 'Serveis', 'Blog', 'Contacte'],
    demoSection: 'El blog',
    demoPosts: [
      { title: 'Per què cobrem el que cobrem', excerpt: 'El preu no surt d’un full de càlcul: surt del temps que hi posem i del que no acceptem fer.' },
      { title: 'Tres coses que mirem abans de dir que sí', excerpt: 'Si les tres fallen, el projecte no acaba bé per a ningú. Val més dir-ho el primer dia.' },
      { title: 'Què passa la primera setmana', excerpt: 'Res de misteris: qui t’atén, què necessitem de tu i quan veuràs la primera cosa feta.' },
    ],
    fontSerif: 'Serif',
    fontSans: 'Sans',
    layoutGrid: 'Graella',
    layoutList: 'Llista',
    browserUrl: 'la-teva-web.cat/blog',
    more: 'I també: cerca, newsletter, articles relacionats, paywall, multi-idioma i estadístiques. Un clic cadascun.',
    cta: 'Obre l’Estudi',
    arch: {
      label: 'O comença amb un blog ja muntat',
      note: 'Cada arquetip arriba amb els seus mòduls engegats i escrits. Canvia-ho tot després, si vols.',
      tierFree: 'Gratis',
      tierPremium: 'Premium',
      tierGold: 'Or',
      pitch: {
        essencial: 'Només el que fa que es llegeixi: cercador, progrés i el següent article.',
        revista: 'Amb gent a dins: comentaris verificats, aplaudiments i relacionats.',
        creador: 'El blog com a negoci: newsletter a cada article i mur de pagament.',
      },
      mod: {
        search: 'Cerca articles…',
        all: 'Tots',
        featured: 'Destacat',
        announce: 'Nou aquesta setmana',
        newsTitle: 'Rep-ho abans que ningú',
        newsBody: 'Un correu quan surt alguna cosa que val la pena. Res més.',
        newsCta: 'Apunta-m’hi',
        newsEmail: 'El teu correu',
        locked: 'La resta d’aquest article és per a subscriptors.',
        unlock: 'Desbloquejar-lo',
        clap: 'Aplaudeix',
        comments: 'La conversa',
        commentBody: 'Això és exactament el que necessitava llegir avui. Gràcies.',
        count: 'mòduls',
      },
    },
  },

  noEs: {
    title: 'Què NO és la Carma.',
    items: [
      { claim: 'No és un ChatGPT amb logo.', truth: 'Escriu amb la teva veu perquè abans ha llegit la teva.' },
      { claim: 'No és una plantilla que s’assembla a la teva web.', truth: 'És la teva capçalera i el teu peu. Els de debò.' },
      { claim: 'No és una eina més que has d’aprendre.', truth: 'Ja saps fer servir el WhatsApp. Amb això n’hi ha prou.' },
    ],
  },

  comunitat: {
    title: 'Omplim internet en català.',
    body: 'Internet s’ha omplert de textos que no diu ningú. Nosaltres el tornem a omplir de gent: forns, tallers, consultes, botigues i associacions que han tornat a escriure.',
    loopTitle: 'I la comunitat no és un grup. És un tracte.',
    loop: [
      { title: 'Llegeix algú', body: 'T’obrim l’article d’un altre membre. Un de veritat, no una notificació.' },
      { title: 'Digues-hi la teva', body: 'Una cosa que funciona i una per millorar. Res de «molt bo!»: dues frases amb cara i ulls.' },
      { title: 'Guanya punts', body: 'Els punts que guanyes llegint els gastes escrivint. Ningú no escriu al buit.' },
    ],
    loopFoot: 'El dolor number u d’un blog nou no és escriure. És que no el llegeixi ningú. Això ho arregla el primer dia.',
    wallTitle: 'Fet amb Carma',
    wallModules: 'mòduls actius',
    wallPosts: 'articles',
    wallVisit: 'Visita’l',
    wallNote: 'Blogs de membres, en directe. Cada targeta va pintada amb els colors i la lletra del seu blog, i porta al lloc de veritat.',
    wallEmpty: 'Els primers blogs de la comunitat s’estan escrivint ara mateix. El teu hi pot ser abans que aquesta frase canviï.',
  },

  punts: {
    title: 'Un article sencer són 100 punts.',
    body: 'El pla gratuït en regala 100 cada mes: un article complet, cada mes, per sempre. I els punts que guanyes amb la comunitat no caduquen mai.',
    plans: [
      { id: 'free', name: 'Gratis', price: '0 €', period: 'per sempre',
        perks: ['Un blog clonat', 'Editor complet', 'L’Estudi', 'WhatsApp il·limitat'],
        cta: 'Comença gratis' },
      { id: 'premium', name: 'Premium', price: '19 €', period: 'al mes', featured: true,
        perks: ['3 blogs', 'Domini propi', 'Newsletter i articles relacionats', 'API i embed'],
        cta: 'Prova Premium' },
      { id: 'gold', name: 'Or', price: '49 €', period: 'al mes',
        perks: ['10 blogs', 'Paywall i contingut premium', 'Tots els mòduls', '10 editors'],
        cta: 'Passa a Or' },
      { id: 'agency', name: 'Agència', price: '149 €', period: 'al mes',
        perks: ['100 blogs', 'Editors il·limitats', 'Marca blanca', 'Suport dedicat'],
        cta: 'Parlem-ne' },
    ],
    allowanceUnit: 'punts cada mes',
    cta: 'Prova Premium',
    ctaFree: 'Comença gratis',
    note: 'Preus de llançament · es confirmaran abans de cobrar res.',
    costsTitle: 'Què val cada cosa',
    costs: [
      { label: 'Esborrany d’article', punts: '80' },
      { label: 'Una revisió', punts: '20' },
      { label: 'Nota de veu', punts: '2' },
      { label: 'Imatge de portada', punts: '25' },
      { label: 'Clonar la teva web', punts: 'gratis' },
    ],
  },

  faq: {
    title: 'El que tothom pregunta.',
    items: [
      {
        q: 'Què fa exactament la Carma?',
        a: 'Li envies una idea per WhatsApp — text o àudio — i et torna un article complet: títol, estructura, SEO i metadades. El revises amb un enllaç i el publiques amb un botó. Si vols canvis, li ho dius com li diries a una persona.',
      },
      {
        q: 'El blog es veurà com la meva web?',
        a: 'Sí. Clonem la teva capçalera i el teu peu reals i n’extraiem colors i tipografies. El blog neix amb la teva identitat, i el pots afinar tocant-lo des de l’Estudi.',
      },
      {
        q: 'I si no tinc web?',
        a: 'Tries una de les vuit plantilles i llestos. Explica’ns qui sou parlant o amb un document i la Carma aprèn igual: la veu no surt del disseny, surt del que expliques.',
      },
      {
        q: 'Necessito targeta per començar?',
        a: 'No. El pla gratuït és gratuït de veritat: 100 punts cada mes, que és un article complet. Premium només si un dia et fa falta.',
      },
      {
        q: 'Els articles els escriu una màquina. Es nota?',
        a: 'Es nota quan qui escriu no sap res de tu. Per això el primer que fem és llegir-te i fer-te una fitxa de com parles, i per això tot passa per tu abans de publicar-se. Tu ets l’editor; la Carma és qui pica pedra.',
      },
    ],
  },

  close: {
    title: 'Ja ho tens tot.',
    sub: 'Només falta que li diguis alguna cosa.',
    micro: 'Gratis. Sense targeta. I si no t’agrada, no has perdut res: la teva web segueix on era.',
  },

  footer: {
    tagline: 'La gestora de continguts que estima el teu lloc web',
    blog: 'Blog', login: 'Entra', signup: 'Comença',
    madeIn: 'Fet a Catalunya, en català',
  },
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  CASTELLANO                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

const es: LandingCopy = {
  meta: {
    title: 'Carma — Todo tu blog, desde un solo mensaje',
    description:
      'Manda una nota de voz por WhatsApp y publica un artículo en tu blog. Carma lee tu web, aprende tu tono y escribe como tú. Sin código, sin ordenador.',
  },
  nav: {
    how: 'Cómo funciona', estudi: 'El Estudio', voice: 'La voz', comunitat: 'Comunidad',
    punts: 'Puntos', faq: 'Preguntas', blog: 'Blog',
    login: 'Entra', signup: 'Empieza gratis', signupShort: 'Empieza', menu: 'Menú', close: 'Cerrar',
    start: {
      title: '¿Por dónde empiezas?',
      sub: 'Dos puertas, y las dos acaban con tu blog vivo.',
      brandTitle: 'Ya tengo marca',
      brandBody: 'Tienes web, catálogo o documentos. Los leemos, aprendemos tu tono y el blog nace con tu cara.',
      brandPoints: ['Tu cabecera y tu pie, clonados', 'Colores y tipografías, los tuyos', 'La agente aprende cómo escribes'],
      brandCta: 'Lee mi marca',
      scratchTitle: 'Empiezo de cero',
      scratchBody: 'Todavía no tienes nada en internet. Eliges un blog ya montado y le cuentas quiénes sois hablando.',
      scratchPoints: ['Ocho identidades listas', 'Módulos encendidos y escritos', 'Publicado en un dominio tuyo'],
      scratchCta: 'Elige un blog montado',
      foot: 'Gratis las dos · sin tarjeta · puedes cambiar de idea cuando quieras',
    },
  },

  hero: {
    h1a: 'Todo tu blog,',
    h1b: 'desde un solo mensaje.',
    sub: 'Le mandas una idea — escrita o hablada — y te la devuelve hecha: artículo, título, SEO y portada. Tú solo dices «publica».',
    trust: 'Gratis · sin tarjeta · tu blog en 60 segundos',
  },

  door: {
    title: 'Empecemos. ¿Quiénes sois?',
    titleClose: 'Venga. Dile quiénes sois.',
    placeholder: 'tu-web.com',
    hint: 'Pega tu web · suelta un PDF · o pulsa y habla',
    cta: 'Lee mi web',
    ctaShort: 'Léela',
    aria: 'Tu web, un documento o una descripción',
    voiceCta: 'Pulsa y habla',
    voiceHint: 'Con treinta segundos contando qué hacéis nos sobra.',
    voice: {
      cta: 'Pulsa y habla', ctaHint: '· 30 segundos contando qué hacéis',
      stop: 'Parar', note: 'Nota de voz', noteHint: 'La usaré para entender cómo hablas de tu negocio.',
      discard: 'Descartar la nota de voz', play: 'Escuchar', pause: 'Pausar',
      tooShort: 'Demasiado corto — mantén pulsado mientras hablas.',
      denied: 'No podemos acceder al micrófono. Revisa los permisos del navegador.',
    },
    sawUrl: 'Perfecto. Ya la miro.',
    sawText: 'También nos sirve. Cuéntanos un poco más.',
    sawFileOne: 'Recibido. Un documento dice mucho.',
    sawFileMany: 'Recibidos: {n} documentos. Eso dice mucho.',
    sawVoice: 'Te he oído. Ya lo tengo.',
    dropTitle: 'Suéltalo',
    dropBody: 'PDF, Word, texto o markdown. Ya lo leo yo.',
    reading: 'Leyéndote',
    revealTitle: 'Esto es lo que he entendido',
    revealPagesOne: 'He leído 1 página de tu web',
    revealPagesMany: 'He leído {n} páginas de tu web',
    thinking: 'Pensando',
    understoodTitle: 'Lo que he entendido',
    sectorLabel: 'Sector',
    audienceLabel: 'Quién os lee',
    edgeLabel: 'Lo que os hace diferentes',
    gapsLabel: 'Lo que vuestra web aún no cuenta',
    pitchesTitle: 'Tres artículos que deberíais publicar',
    pitchesLead: 'No son ideas genéricas: salen de lo que he leído en vuestra casa.',
    pitchWhy: 'Por qué funciona',
    pitchKeyword: 'Palabra clave',
    revealCta: 'Quiero mi blog',
    revealBack: 'Probar con otra web',
    failTitle: 'Esta no me deja leerla',
    failBody: 'Pasa: hay webs blindadas, o simplemente caídas. No es ningún problema — me lo puedes contar tú cuando entremos.',
    failCta: 'Sigue igualmente',
    tooFast: 'Frena un poco: has probado demasiadas webs seguidas. Vuelve a intentarlo en un rato.',
    noWebLead: '¿Todavía no tienes web?',
    noWebCta: 'Empieza de cero — elige una plantilla',
  },

  conversa: {
    title: 'No se aprende. Se habla.',
    sub: 'Baja y mira cómo se hace un artículo. Tan rápido como quieras.',
    beats: [
      { lead: 'Le hablas.', body: 'Una nota de voz de treinta segundos, mientras conduces o cierras la persiana.' },
      { lead: 'Te escucha.', body: 'Sin formularios, sin campos obligatorios, sin nada que aprender.' },
      { lead: 'Escribe.', body: 'Artículo entero: título, estructura, palabra clave, metadatos y portada.' },
      { lead: 'Tú mandas.', body: 'O lo publicas, o le escribes qué quieres cambiar con tus palabras. Te lo devuelve hecho.' },
      { lead: 'Publicado.', body: 'En tu web, con tu diseño, y en Google desde el primer minuto.' },
    ],
    phone: {
      contact: 'Carma',
      status: 'en línea',
      voiceLen: '0:31',
      ack: 'Recibido. Te lo escribo y te lo paso en un minuto.',
      draftBadge: 'Borrador listo',
      draftTitle: '«La feria de este año: 7 novedades que no te puedes perder»',
      draftMeta: '1.240 palabras · clave: feria 2026 · 6 min de lectura',
      approve: 'Publicar',
      revise: 'Cambiar cosas',
      published: '¡Publicado!',
      url: 'tu-web.com/feria-novedades',
      composer: 'Escribe un mensaje',
    },
    phoneEdit: {
      contact: 'Carma',
      status: 'en línea',
      draftBadge: 'Borrador listo',
      draftTitle: '«Por qué cobramos lo que cobramos»',
      draftMeta: '1.310 palabras · de usted · tono neutro',
      ask: 'Acórtalo, tutéame y quita la introducción. Y mete qué hacéis cuando decís que no.',
      ack: 'Hecho: 980 palabras, de tú, sin introducción y con un apartado nuevo sobre cuándo decís que no.',
      newBadge: 'Segunda versión',
      newTitle: '«Por qué cobramos lo que cobramos (y cuándo decimos que no)»',
      newMeta: '980 palabras · de tú · +1 apartado',
      approve: 'Ahora sí, publica',
      revise: 'Otro cambio',
      published: '¡Publicado!',
      url: 'tu-web.com/como-fijamos-precios',
      composer: 'Escríbele qué quieres cambiar',
    },
  },

  fidelitat: {
    title: 'El blog vive dentro de tu web. No en otro sitio.',
    body: 'Tu cabecera y tu pie se quedan exactamente como están — logo, menú, tipografías y colores. Lo único que cambia es lo que hay en medio.',
    proof: 'Probado con 97 webs reales: ni una regla de estilo ni un color se pierden por el camino',
    noWeb: '¿Y si todavía no tienes web?',
    noWebCta: 'Empieza de cero con una plantilla',
  },

  veu: {
    title: 'Primero te escucha. Luego escribe.',
    body: 'Antes del primer artículo, Carma se hace una ficha de cómo hablas. No es una opinión sobre tu tono: son cuatro decisiones concretas que toma una vez y no cambia a media frase.',
    sources: [
      { label: 'Tu web', body: 'De ahí sale cómo tratas a quien te lee y cómo llamas a lo que haces.' },
      { label: 'Tus documentos', body: 'Presupuestos, catálogos, dosieres: el vocabulario de casa, el de verdad.' },
      { label: 'Treinta segundos de voz', body: 'Cómo lo cuentas cuando no escribes. Es lo que más se parece a ti.' },
    ],
    cardTitle: 'Tu ficha de voz',
    cardSub: 'Una página. La hace una vez y la consulta en cada artículo.',
    keeps: [
      { label: 'A quién hablas', body: 'De tú o de usted, en singular o en plural. Lo decide una vez y lo mantiene de la primera línea a la última.' },
      { label: 'Las palabras de casa', body: 'Cómo llamas a tus servicios, a tus sitios y a tu gente. Sin traducirlo al idioma del sector.' },
      { label: 'El ritmo', body: 'Frases cortas o largas, ejemplos o datos, un título sobrio o uno descarado. Tu compás, no el suyo.' },
      { label: 'Lo que no dirías nunca', body: 'Las palabras que no son tuyas se quedan fuera. Por eso el primer artículo no suena a folleto.' },
    ],
    guarantee: 'No copia nada de nadie. La ficha describe cómo escribes; las frases las escribe de nuevo, cada vez.',
    caption: 'Todo esto pasa antes del primer artículo, no después de que te quejes.',
    foot: '¿Quieres ver la tuya? Pega tu web aquí arriba y te la hace en diez segundos.',
  },

  estudi: {
    title: 'Lo cambias tocándolo.',
    body: 'Nada de paneles infinitos. Clicas lo que quieres cambiar y aparecen sus controles, sobre la página de verdad. Pruébalo aquí mismo:',
    colorLabel: 'Color',
    fontLabel: 'Letra',
    layoutLabel: 'Disposición',
    radiusLabel: 'Esquinas',
    selectHint: 'Clica cualquier cosa del blog y aparecerán sus controles.',
    selBrand: 'La marca',
    selNav: 'El menú',
    selTitle: 'El título',
    selCard: 'Las tarjetas',
    saved: 'Guardado',
    reset: 'Reiniciar',
    persistNote: 'Lo que cambies se queda guardado en tu navegador. Vuelve cuando quieras: seguirá ahí.',
    selSection: 'El título del blog',
    selExcerpt: 'El resumen',
    selImage: 'La imagen',
    selPage: 'Toda la página',
    imageLabel: 'Elige una imagen',
    panelTitle: 'Nada seleccionado',
    editHint: 'Escribe lo que quieras. Pulsa Enter y se guarda.',
    done: 'Hecho',
    sizeLabel: 'Tamaño', sizeS: 'Compacto', sizeM: 'Normal', sizeL: 'Amplio',
    cardLabel: 'Tarjetas', cardBorder: 'Borde', cardShadow: 'Sombra', cardFlat: 'Plana',
    alignLabel: 'Alineación', alignLeft: 'Izquierda', alignCenter: 'Centro',
    modLabel: 'Módulos de este blog',
    modHint: 'Enciende y apaga lo que quieras — la página de abajo cambia de verdad.',
    modOn: 'encendidos',
    modNames: {
      announcementBar: 'Barra de aviso',
      featuredHero: 'Artículo destacado',
      search: 'Buscador',
      categoryFilters: 'Filtros por tema',
      tableOfContents: 'Índice del artículo',
      keyTakeaways: 'Puntos clave',
      pullQuote: 'Frase destacada',
      readingProgress: 'Progreso de lectura',
      authorCard: 'Ficha del autor',
      socialShare: 'Compartir',
      whatsappShare: 'Compartir por WhatsApp',
      relatedPosts: 'Artículos relacionados',
      readNext: 'Lee ahora',
      prevNext: 'Anterior y siguiente',
      likes: 'Aplausos',
      comments: 'Comentarios',
      newsletter: 'Newsletter',
      paywall: 'Muro de pago',
      backToTop: 'Volver arriba',
    },
    groundLabel: 'Fondo', groundLight: 'Claro', groundDark: 'Oscuro',
    widthLabel: 'Ancho', widthNarrow: 'Estrecho', widthWide: 'Amplio',
    archCustom: 'A tu manera',
    demoBrand: 'Tu negocio',
    demoNav: ['Nosotros', 'Servicios', 'Blog', 'Contacto'],
    demoSection: 'El blog',
    demoPosts: [
      { title: 'Por qué cobramos lo que cobramos', excerpt: 'El precio no sale de una hoja de cálculo: sale del tiempo que ponemos y de lo que no aceptamos hacer.' },
      { title: 'Tres cosas que miramos antes de decir que sí', excerpt: 'Si las tres fallan, el proyecto no acaba bien para nadie. Mejor decirlo el primer día.' },
      { title: 'Qué pasa la primera semana', excerpt: 'Sin misterios: quién te atiende, qué necesitamos de ti y cuándo verás lo primero hecho.' },
    ],
    fontSerif: 'Serif',
    fontSans: 'Sans',
    layoutGrid: 'Rejilla',
    layoutList: 'Lista',
    browserUrl: 'tu-web.com/blog',
    more: 'Y también: buscador, newsletter, artículos relacionados, paywall, multi-idioma y estadísticas. Un clic cada uno.',
    cta: 'Abre el Estudio',
    arch: {
      label: 'O empieza con un blog ya montado',
      note: 'Cada arquetipo llega con sus módulos encendidos y escritos. Cámbialo todo después, si quieres.',
      tierFree: 'Gratis',
      tierPremium: 'Premium',
      tierGold: 'Oro',
      pitch: {
        essencial: 'Solo lo que hace que se lea: buscador, progreso y el siguiente artículo.',
        revista: 'Con gente dentro: comentarios verificados, aplausos y relacionados.',
        creador: 'El blog como negocio: newsletter en cada artículo y muro de pago.',
      },
      mod: {
        search: 'Busca artículos…',
        all: 'Todos',
        featured: 'Destacado',
        announce: 'Nuevo esta semana',
        newsTitle: 'Recíbelo antes que nadie',
        newsBody: 'Un correo cuando sale algo que vale la pena. Nada más.',
        newsCta: 'Apúntame',
        newsEmail: 'Tu correo',
        locked: 'El resto de este artículo es para suscriptores.',
        unlock: 'Desbloquearlo',
        clap: 'Aplaude',
        comments: 'La conversación',
        commentBody: 'Esto es exactamente lo que necesitaba leer hoy. Gracias.',
        count: 'módulos',
      },
    },
  },

  noEs: {
    title: 'Qué NO es Carma.',
    items: [
      { claim: 'No es un ChatGPT con logo.', truth: 'Escribe con tu voz porque antes ha leído la tuya.' },
      { claim: 'No es una plantilla que se parece a tu web.', truth: 'Es tu cabecera y tu pie. Los de verdad.' },
      { claim: 'No es otra herramienta que tienes que aprender.', truth: 'Ya sabes usar WhatsApp. Con eso basta.' },
    ],
  },

  comunitat: {
    title: 'Llenamos internet en catalán.',
    body: 'Internet se ha llenado de textos que no dice nadie. Nosotros lo volvemos a llenar de gente: hornos, talleres, consultas, tiendas y asociaciones que han vuelto a escribir.',
    loopTitle: 'Y la comunidad no es un grupo. Es un trato.',
    loop: [
      { title: 'Lee a alguien', body: 'Te abrimos el artículo de otro miembro. Uno de verdad, no una notificación.' },
      { title: 'Di lo tuyo', body: 'Algo que funciona y algo por mejorar. Nada de «¡muy bueno!»: dos frases con fundamento.' },
      { title: 'Gana puntos', body: 'Los puntos que ganas leyendo los gastas escribiendo. Nadie escribe al vacío.' },
    ],
    loopFoot: 'El dolor número uno de un blog nuevo no es escribir. Es que no lo lea nadie. Eso se arregla el primer día.',
    wallTitle: 'Hecho con Carma',
    wallModules: 'módulos activos',
    wallPosts: 'artículos',
    wallVisit: 'Vísitalo',
    wallNote: 'Blogs de miembros, en directo. Cada tarjeta va pintada con los colores y la letra de su blog, y lleva al sitio de verdad.',
    wallEmpty: 'Los primeros blogs de la comunidad se están escribiendo ahora mismo. El tuyo puede estar antes de que esta frase cambie.',
  },

  punts: {
    title: 'Un artículo entero son 100 puntos.',
    body: 'El plan gratuito regala 100 cada mes: un artículo completo, cada mes, para siempre. Y los puntos que ganas con la comunidad no caducan nunca.',
    plans: [
      { id: 'free', name: 'Gratis', price: '0 €', period: 'para siempre',
        perks: ['Un blog clonado', 'Editor completo', 'El Estudio', 'WhatsApp ilimitado'],
        cta: 'Empieza gratis' },
      { id: 'premium', name: 'Premium', price: '19 €', period: 'al mes', featured: true,
        perks: ['3 blogs', 'Dominio propio', 'Newsletter y artículos relacionados', 'API y embed'],
        cta: 'Prueba Premium' },
      { id: 'gold', name: 'Oro', price: '49 €', period: 'al mes',
        perks: ['10 blogs', 'Paywall y contenido premium', 'Todos los módulos', '10 editores'],
        cta: 'Pasa a Oro' },
      { id: 'agency', name: 'Agencia', price: '149 €', period: 'al mes',
        perks: ['100 blogs', 'Editores ilimitados', 'Marca blanca', 'Soporte dedicado'],
        cta: 'Hablemos' },
    ],
    allowanceUnit: 'puntos al mes',
    cta: 'Prueba Premium',
    ctaFree: 'Empieza gratis',
    note: 'Precios de lanzamiento · se confirmarán antes de cobrar nada.',
    costsTitle: 'Qué vale cada cosa',
    costs: [
      { label: 'Borrador de artículo', punts: '80' },
      { label: 'Una revisión', punts: '20' },
      { label: 'Nota de voz', punts: '2' },
      { label: 'Imagen de portada', punts: '25' },
      { label: 'Clonar tu web', punts: 'gratis' },
    ],
  },

  faq: {
    title: 'Lo que pregunta todo el mundo.',
    items: [
      {
        q: '¿Qué hace exactamente Carma?',
        a: 'Le mandas una idea por WhatsApp — texto o audio — y te devuelve un artículo completo: título, estructura, SEO y metadatos. Lo revisas con un enlace y lo publicas con un botón. Si quieres cambios, se los dices como se los dirías a una persona.',
      },
      {
        q: '¿El blog se verá como mi web?',
        a: 'Sí. Clonamos tu cabecera y tu pie reales y extraemos colores y tipografías. El blog nace con tu identidad, y lo puedes afinar tocándolo desde el Estudio.',
      },
      {
        q: '¿Y si no tengo web?',
        a: 'Eliges una de las ocho plantillas y listo. Cuéntanos quiénes sois hablando o con un documento y Carma aprende igual: la voz no sale del diseño, sale de lo que cuentas.',
      },
      {
        q: '¿Necesito tarjeta para empezar?',
        a: 'No. El plan gratuito es gratuito de verdad: 100 puntos cada mes, que es un artículo completo. Premium solo si algún día te hace falta.',
      },
      {
        q: 'Los artículos los escribe una máquina. ¿Se nota?',
        a: 'Se nota cuando quien escribe no sabe nada de ti. Por eso lo primero que hacemos es leerte y hacer una ficha de cómo hablas, y por eso todo pasa por ti antes de publicarse. Tú eres el editor; Carma es quien pica piedra.',
      },
    ],
  },

  close: {
    title: 'Ya lo tienes todo.',
    sub: 'Solo falta que le digas algo.',
    micro: 'Gratis. Sin tarjeta. Y si no te gusta, no has perdido nada: tu web sigue donde estaba.',
  },

  footer: {
    tagline: 'El gestor de contenidos que ama tu sitio web',
    blog: 'Blog', login: 'Entra', signup: 'Empieza',
    madeIn: 'Hecho en Cataluña, en catalán',
  },
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  ENGLISH                                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

const en: LandingCopy = {
  meta: {
    title: 'Carma — Your whole blog, from one message',
    description:
      'Send a voice note on WhatsApp and publish an article to your blog. Carma reads your site, learns your tone and writes like you. No code, no computer.',
  },
  nav: {
    how: 'How it works', estudi: 'The Studio', voice: 'The voice', comunitat: 'Community',
    punts: 'Points', faq: 'Questions', blog: 'Blog',
    login: 'Log in', signup: 'Start free', signupShort: 'Start', menu: 'Menu', close: 'Close',
    start: {
      title: 'Where do you start?',
      sub: 'Two doors, and both of them end with your blog live.',
      brandTitle: 'I already have a brand',
      brandBody: 'A website, a catalogue, some documents. We read them, learn your tone, and the blog is born with your face on it.',
      brandPoints: ['Your real header and footer, cloned', 'Your colours and your type', 'The agent learns how you write'],
      brandCta: 'Read my brand',
      scratchTitle: 'I’m starting from nothing',
      scratchBody: 'Nothing online yet. Pick a blog that arrives fully built and tell it who you are, out loud.',
      scratchPoints: ['Eight ready identities', 'Modules switched on and written', 'Published on a domain of your own'],
      scratchCta: 'Pick a ready blog',
      foot: 'Both free · no card · change your mind whenever you like',
    },
  },

  hero: {
    h1a: 'Your whole blog,',
    h1b: 'from one message.',
    sub: 'Send an idea — typed or spoken — and it comes back finished: article, headline, SEO and cover. All you say is «publish».',
    trust: 'Free · no card · your blog in 60 seconds',
  },

  door: {
    title: 'Let’s start. Who are you?',
    titleClose: 'Go on. Tell her who you are.',
    placeholder: 'your-site.com',
    hint: 'Paste your site · drop a PDF · or hold and talk',
    cta: 'Read my site',
    ctaShort: 'Read it',
    aria: 'Your website, a document or a description',
    voiceCta: 'Hold and talk',
    voiceHint: 'Thirty seconds about what you do is plenty.',
    voice: {
      cta: 'Hold and talk', ctaHint: '· 30 seconds on what you do',
      stop: 'Stop', note: 'Voice note', noteHint: 'I’ll use it to learn how you talk about your business.',
      discard: 'Discard the voice note', play: 'Play', pause: 'Pause',
      tooShort: 'Too short — hold it down while you talk.',
      denied: 'We can’t reach the microphone. Check your browser permissions.',
    },
    sawUrl: 'Perfect. Taking a look.',
    sawText: 'That works too. Tell us a bit more.',
    sawFileOne: 'Got it. One document says a lot.',
    sawFileMany: 'Got {n} documents. That says a lot.',
    sawVoice: 'Heard you. Got it.',
    dropTitle: 'Drop it',
    dropBody: 'PDF, Word, text or markdown. I’ll read it.',
    reading: 'Reading you',
    revealTitle: 'Here’s what I understood',
    revealPagesOne: 'I read 1 page of your site',
    revealPagesMany: 'I read {n} pages of your site',
    thinking: 'Thinking',
    understoodTitle: 'What I understood',
    sectorLabel: 'Sector',
    audienceLabel: 'Who reads you',
    edgeLabel: 'What sets you apart',
    gapsLabel: 'What your site does not cover yet',
    pitchesTitle: 'Three articles you should publish',
    pitchesLead: 'Not generic ideas: these come out of what I read on your own pages.',
    pitchWhy: 'Why it works',
    pitchKeyword: 'Keyword',
    revealCta: 'I want my blog',
    revealBack: 'Try another site',
    failTitle: 'This one won’t let me read it',
    failBody: 'It happens: some sites are locked down, some are simply down. No problem — you can tell me yourself once we’re inside.',
    failCta: 'Carry on anyway',
    tooFast: 'Easy there: too many sites in a row. Give it a few minutes and try again.',
    noWebLead: 'No website yet?',
    noWebCta: 'Start from scratch — pick a look',
  },

  conversa: {
    title: 'Nothing to learn. You just talk.',
    sub: 'Scroll and watch an article get written. As fast as you like.',
    beats: [
      { lead: 'You talk.', body: 'A thirty-second voice note, while you drive or lock up the shop.' },
      { lead: 'She listens.', body: 'No forms, no required fields, nothing to learn.' },
      { lead: 'She writes.', body: 'A whole article: headline, structure, keyword, metadata and cover.' },
      { lead: 'You decide.', body: 'Two buttons: publish, or tell her what to change. Like you would a colleague.' },
      { lead: 'Published.', body: 'On your site, in your design, and in Google from minute one.' },
    ],
    phone: {
      contact: 'Carma',
      status: 'online',
      voiceLen: '0:31',
      ack: 'Got it. Writing it up — one minute.',
      draftBadge: 'Draft ready',
      draftTitle: '«This year’s fair: 7 things you shouldn’t miss»',
      draftMeta: '1,240 words · keyword: fair 2026 · 6 min read',
      approve: 'Publish',
      revise: 'Change something',
      published: 'Published!',
      url: 'your-site.com/fair-news',
      composer: 'Type a message',
    },
    phoneEdit: {
      contact: 'Carma',
      status: 'online',
      draftBadge: 'Draft ready',
      draftTitle: '«Why we charge what we charge»',
      draftMeta: '1,310 words · formal · neutral tone',
      ask: 'Cut it down, talk to me directly, drop the intro. And add what you do when you say no.',
      ack: 'Done: 980 words, second person, no intro, and a new section on when you turn work down.',
      newBadge: 'Second draft',
      newTitle: '«Why we charge what we charge (and when we say no)»',
      newMeta: '980 words · second person · +1 section',
      approve: 'Now publish it',
      revise: 'One more change',
      published: 'Published!',
      url: 'your-site.com/how-we-price',
      composer: 'Tell her what to change',
    },
  },

  fidelitat: {
    title: 'The blog lives inside the site you already have.',
    body: 'Your header and your footer stay exactly as they are — logo, menu, typefaces, colours. The only thing that changes is what sits between them.',
    proof: 'Tested against 97 real sites: not one style rule or colour is lost on the way',
    noWeb: 'And if you have no website yet?',
    noWebCta: 'Start from scratch with a look',
  },

  veu: {
    title: 'She listens first. Then she writes.',
    body: 'Before the first article, Carma writes herself a record of how you talk. Not an opinion about your tone — four concrete decisions, taken once, and never flipped halfway through a paragraph.',
    sources: [
      { label: 'Your website', body: 'This is where how you address your readers, and what you call your work, comes from.' },
      { label: 'Your documents', body: 'Quotes, catalogues, decks: the vocabulary of the house, the real one.' },
      { label: 'Thirty seconds of voice', body: 'How you explain it when you are not writing. It is the closest thing to you there is.' },
    ],
    cardTitle: 'Your voice sheet',
    cardSub: 'One page. Written once, consulted on every article.',
    keeps: [
      { label: 'Who you are talking to', body: 'Formal or familiar, "we" or "I". Decided once, and held from the first line to the last.' },
      { label: 'The words of the house', body: 'What you call your services, your places and your people — not their translation into industry-speak.' },
      { label: 'The rhythm', body: 'Short sentences or long ones, examples or figures, a sober headline or a cheeky one. Your measure, not hers.' },
      { label: 'What you would never say', body: 'Words that are not yours stay out. That is why the first article does not read like a leaflet.' },
    ],
    guarantee: 'Nothing is copied from anyone. The sheet describes how you write; the sentences are written fresh, every time.',
    caption: 'All of it happens before the first article, not after you complain about one.',
    foot: 'Want to see yours? Paste your site at the top and it writes one in ten seconds.',
  },

  estudi: {
    title: 'You change it by touching it.',
    body: 'No endless panels. Click the thing you want to change and its controls appear, right on the real page. Try it here:',
    colorLabel: 'Colour',
    fontLabel: 'Type',
    layoutLabel: 'Layout',
    radiusLabel: 'Corners',
    selectHint: 'Click anything in the blog and its controls appear.',
    selBrand: 'The brand',
    selNav: 'The menu',
    selTitle: 'The headline',
    selCard: 'The cards',
    saved: 'Saved',
    reset: 'Reset',
    persistNote: 'What you change is saved in your browser. Come back whenever: it will still be here.',
    selSection: 'The blog title',
    selExcerpt: 'The excerpt',
    selImage: 'The image',
    selPage: 'The whole page',
    imageLabel: 'Pick an image',
    panelTitle: 'Nothing selected',
    editHint: 'Type whatever you like. Press Enter and it saves.',
    done: 'Done',
    sizeLabel: 'Size', sizeS: 'Compact', sizeM: 'Normal', sizeL: 'Roomy',
    cardLabel: 'Cards', cardBorder: 'Border', cardShadow: 'Shadow', cardFlat: 'Flat',
    alignLabel: 'Alignment', alignLeft: 'Left', alignCenter: 'Centre',
    modLabel: 'This blog’s modules',
    modHint: 'Switch them on and off — the page below really changes.',
    modOn: 'on',
    modNames: {
      announcementBar: 'Announcement bar',
      featuredHero: 'Featured post',
      search: 'Search',
      categoryFilters: 'Topic filters',
      tableOfContents: 'Table of contents',
      keyTakeaways: 'Key takeaways',
      pullQuote: 'Pull quote',
      readingProgress: 'Reading progress',
      authorCard: 'Author card',
      socialShare: 'Share',
      whatsappShare: 'Share on WhatsApp',
      relatedPosts: 'Related posts',
      readNext: 'Read next',
      prevNext: 'Previous and next',
      likes: 'Applause',
      comments: 'Comments',
      newsletter: 'Newsletter',
      paywall: 'Paywall',
      backToTop: 'Back to top',
    },
    groundLabel: 'Ground', groundLight: 'Light', groundDark: 'Dark',
    widthLabel: 'Width', widthNarrow: 'Narrow', widthWide: 'Wide',
    archCustom: 'Your own way',
    demoBrand: 'Your business',
    demoNav: ['About', 'Services', 'Blog', 'Contact'],
    demoSection: 'The blog',
    demoPosts: [
      { title: 'Why we charge what we charge', excerpt: 'The price does not come out of a spreadsheet. It comes out of the hours we put in and the work we turn down.' },
      { title: 'Three things we check before saying yes', excerpt: 'If all three fail, the project ends badly for everyone. Better to say so on day one.' },
      { title: 'What happens in the first week', excerpt: 'No mystery: who looks after you, what we need from you, and when you see the first thing finished.' },
    ],
    fontSerif: 'Serif',
    fontSans: 'Sans',
    layoutGrid: 'Grid',
    layoutList: 'List',
    browserUrl: 'your-site.com/blog',
    more: 'Also: search, newsletter, related posts, paywall, multi-language and analytics. One click each.',
    cta: 'Open the Studio',
    arch: {
      label: 'Or start from a blog that is already built',
      note: 'Every archetype arrives with its modules switched on and written. Change all of it afterwards, if you like.',
      tierFree: 'Free',
      tierPremium: 'Premium',
      tierGold: 'Gold',
      pitch: {
        essencial: 'Only what makes a blog readable: search, progress and the next article.',
        revista: 'With people inside: verified comments, applause and related posts.',
        creador: 'The blog as a business: a newsletter on every article and a paywall.',
      },
      mod: {
        search: 'Search articles…',
        all: 'All',
        featured: 'Featured',
        announce: 'New this week',
        newsTitle: 'Get it before anyone else',
        newsBody: 'One email when something worth reading comes out. Nothing else.',
        newsCta: 'Sign me up',
        newsEmail: 'Your email',
        locked: 'The rest of this article is for subscribers.',
        unlock: 'Unlock it',
        clap: 'Applaud',
        comments: 'The conversation',
        commentBody: 'This is exactly what I needed to read today. Thank you.',
        count: 'modules',
      },
    },
  },

  noEs: {
    title: 'What Carma is NOT.',
    items: [
      { claim: 'Not a ChatGPT with a logo on it.', truth: 'It writes in your voice because it read yours first.' },
      { claim: 'Not a template that resembles your site.', truth: 'It is your header and your footer. The real ones.' },
      { claim: 'Not one more tool you have to learn.', truth: 'You already know how to use WhatsApp. That’s the whole training.' },
    ],
  },

  comunitat: {
    title: 'Filling the internet back up, in Catalan.',
    body: 'The internet filled up with text nobody actually says. We are filling it back up with people: bakeries, workshops, clinics, shops and associations that started writing again.',
    loopTitle: 'And the community isn’t a group chat. It’s a deal.',
    loop: [
      { title: 'Read someone', body: 'We open another member’s article for you. A real one, not a notification.' },
      { title: 'Say your piece', body: 'One thing that works, one thing to improve. No «great post!»: two sentences with something in them.' },
      { title: 'Earn points', body: 'The points you earn reading are the points you spend writing. Nobody writes into the void.' },
    ],
    loopFoot: 'The number one pain of a new blog isn’t writing it. It’s that nobody reads it. This fixes that on day one.',
    wallTitle: 'Made with Carma',
    wallModules: 'modules on',
    wallPosts: 'articles',
    wallVisit: 'Visit it',
    wallNote: 'Member blogs, live. Each card is painted in its own blog’s colours and typeface, and takes you to the real thing.',
    wallEmpty: 'The community’s first blogs are being written right now. Yours could be here before this sentence changes.',
  },

  punts: {
    title: 'A whole article is 100 points.',
    body: 'The free plan gives you 100 every month: one complete article, every month, forever. And the points you earn in the community never expire.',
    plans: [
      { id: 'free', name: 'Free', price: '€0', period: 'forever',
        perks: ['One cloned blog', 'Full editor', 'The Studio', 'Unlimited WhatsApp'],
        cta: 'Start free' },
      { id: 'premium', name: 'Premium', price: '€19', period: 'a month', featured: true,
        perks: ['3 blogs', 'Your own domain', 'Newsletter and related posts', 'API and embed'],
        cta: 'Try Premium' },
      { id: 'gold', name: 'Gold', price: '€49', period: 'a month',
        perks: ['10 blogs', 'Paywall and premium content', 'Every module', '10 editors'],
        cta: 'Go Gold' },
      { id: 'agency', name: 'Agency', price: '€149', period: 'a month',
        perks: ['100 blogs', 'Unlimited editors', 'White label', 'Dedicated support'],
        cta: 'Talk to us' },
    ],
    allowanceUnit: 'points a month',
    cta: 'Try Premium',
    ctaFree: 'Start free',
    note: 'Launch pricing · confirmed before anything is ever charged.',
    costsTitle: 'What things cost',
    costs: [
      { label: 'Article draft', punts: '80' },
      { label: 'One revision', punts: '20' },
      { label: 'Voice note', punts: '2' },
      { label: 'Cover image', punts: '25' },
      { label: 'Cloning your site', punts: 'free' },
    ],
  },

  faq: {
    title: 'What everybody asks.',
    items: [
      {
        q: 'What does Carma actually do?',
        a: 'You send an idea over WhatsApp — text or audio — and get back a complete article: headline, structure, SEO and metadata. You review it through a link and publish it with a button. Want changes? Tell her the way you would tell a person.',
      },
      {
        q: 'Will the blog look like my site?',
        a: 'Yes. We clone your real header and footer and extract colours and typefaces. The blog is born with your identity, and you can fine-tune it by touching it in the Studio.',
      },
      {
        q: 'What if I don’t have a website?',
        a: 'Pick one of the eight templates and you’re done. Tell us who you are out loud or with a document and Carma learns anyway: the voice doesn’t come from the design, it comes from what you say.',
      },
      {
        q: 'Do I need a card to start?',
        a: 'No. The free plan is genuinely free: 100 points a month, which is one complete article. Premium only if you ever need it.',
      },
      {
        q: 'A machine writes the articles. Can you tell?',
        a: 'You can tell when the writer knows nothing about you. So the first thing we do is read you and write a record of how you talk, and everything passes through you before it publishes. You’re the editor; Carma does the digging.',
      },
    ],
  },

  close: {
    title: 'That’s everything.',
    sub: 'All that’s left is to say something to her.',
    micro: 'Free. No card. And if you don’t like it you’ve lost nothing: your site is exactly where it was.',
  },

  footer: {
    tagline: 'The content manager that loves your website',
    blog: 'Blog', login: 'Log in', signup: 'Start',
    madeIn: 'Made in Catalonia, in Catalan',
  },
}

export const LANDING: Record<UiLocale, LandingCopy> = { ca, es, en }
