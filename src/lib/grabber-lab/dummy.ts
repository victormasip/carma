// Ten visually rich DUMMY articles for the Grabber Lab preview.
//
// Injected into the blog slot of a render assembled from a captured theme, so the
// operator can immediately see whether the client's CSS breaks our feed layout
// (or our feed breaks their chrome). Real images (picsum), varied categories,
// tags, authors and lengths exercise the card grid + article typography the way
// production content would. Absolute image URLs so they resolve inside the
// preview iframe regardless of origin.

import type { buildListingPage } from '@/lib/render/theme'

// Structurally matches the (unexported) Post type buildListingPage expects.
type LabPost = Parameters<typeof buildListingPage>[3][number]

/** A constant id namespace so a fake "site" never collides with a real UUID and
 *  the preview's tracking beacon (stripped server-side anyway) stays inert. */
export const LAB_SITE_ID = 'lab-preview'
export const LAB_SITE_NAME = 'Lab Preview'

const IMG = (seed: string) => `https://picsum.photos/seed/${seed}/1280/860`

function body(paragraphs: string[], opts: { quote?: string; list?: string[] } = {}): string {
  const parts: string[] = []
  parts.push(`<p>${paragraphs[0]}</p>`)
  parts.push(`<h2>El context que importa</h2>`)
  parts.push(`<p>${paragraphs[1] ?? paragraphs[0]}</p>`)
  if (opts.quote) parts.push(`<blockquote><p>${opts.quote}</p></blockquote>`)
  if (opts.list) parts.push(`<ul>${opts.list.map(i => `<li>${i}</li>`).join('')}</ul>`)
  parts.push(`<h3>Cap a on anem</h3>`)
  parts.push(`<p>${paragraphs[2] ?? paragraphs[0]}</p>`)
  parts.push(`<p>${paragraphs[3] ?? ''}</p>`)
  return parts.filter(Boolean).join('\n')
}

type Seed = {
  title: string
  excerpt: string
  categories: string[]
  tags: string[]
  author: string
  img: string
  paragraphs: string[]
  quote?: string
  list?: string[]
}

const SEEDS: Seed[] = [
  {
    title: 'Com el disseny silenciós guanya la cursa de l’atenció',
    excerpt: 'Menys soroll visual, més intenció. Una mirada al minimalisme funcional que converteix visitants en lectors fidels.',
    categories: ['Disseny'], tags: ['UX', 'minimalisme', 'tipografia'], author: 'Laia Ferran', img: IMG('carma-design'),
    paragraphs: [
      'El bon disseny no crida: acompanya. Quan retirem el que sobra, el que queda parla amb claredat.',
      'Cada element que afegim té un cost cognitiu. La disciplina de treure és més difícil —i més valuosa— que la d’afegir.',
      'El futur de les interfícies és invisible: ritme, jerarquia i espai en blanc fent la feina sense demanar protagonisme.',
      'La propera vegada que dubtis entre afegir o treure, tria treure. El teu lector t’ho agrairà.',
    ],
    quote: 'La perfecció s’assoleix no quan no hi ha res més a afegir, sinó quan no hi ha res més a treure.',
    list: ['Una sola font de veritat tipogràfica', 'Contrast suficient, mai excessiu', 'Animacions que informen, no que distreuen'],
  },
  {
    title: 'Intel·ligència artificial a la redacció: aliada o amenaça?',
    excerpt: 'Eines generatives que esborranyen, resumeixen i tradueixen. On acaba l’ajuda i on comença la substitució?',
    categories: ['Tecnologia'], tags: ['IA', 'periodisme', 'ètica'], author: 'Marc Oliveras', img: IMG('carma-ai'),
    paragraphs: [
      'Les models de llenguatge ja no són una promesa de laboratori: són a la barra d’eines diària de qui escriu.',
      'El valor humà es desplaça del «produir text» al «decidir què val la pena dir i verificar-ho».',
      'Qui domini el criteri editorial sobre la màquina tindrà avantatge; qui hi delegui el criteri, el perdrà.',
      'La pregunta correcta no és si l’usem, sinó com mantenim la responsabilitat sobre cada paraula publicada.',
    ],
    quote: 'L’automatització amplifica el judici: bo si en tens, perillós si no.',
  },
  {
    title: 'Set rutes d’alta muntanya per estrenar la temporada',
    excerpt: 'Del Pirineu a Picos: itineraris circulars amb desnivell honest i vistes que justifiquen cada pas.',
    categories: ['Estil de vida', 'Viatges'], tags: ['muntanya', 'natura', 'guia'], author: 'Núria Camps', img: IMG('carma-mountain'),
    paragraphs: [
      'Hi ha un moment, just abans de la carena, en què el cansament i la il·lusió empaten. Aquest article és per a aquell moment.',
      'No totes les rutes demanen el mateix: hem triat circuits amb retorn fàcil i punts d’aigua fiables.',
      'Porta capes, surt d’hora i respecta el ritme del grup més lent. La muntanya premia la prudència.',
      'La recompensa no és el cim: és tornar amb ganes de la propera.',
    ],
    list: ['Circ de Colomers — 4h, exigència mitjana', 'Vall de Núria pels llacs — 5h', 'Aigüestortes ronda curta — 3h'],
  },
  {
    title: 'L’economia de la subscripció ha tocat sostre?',
    excerpt: 'Fatiga de quotes, cancel·lacions creuades i el retorn del pagament per ús. Què ve després del «tot per una tarifa plana».',
    categories: ['Negocis'], tags: ['SaaS', 'mercats', 'producte'], author: 'Pau Ribó', img: IMG('carma-business'),
    paragraphs: [
      'Durant una dècada, afegir una quota mensual semblava la resposta a tot. El consumidor comença a dir prou.',
      'La retenció ja no es compra amb funcionalitats: es guanya amb valor percebut setmana rere setmana.',
      'Veurem models híbrids —base gratuïta, ús mesurat— guanyar terreny a la tarifa plana indiscriminada.',
      'El proper avantatge competitiu serà la transparència del preu, no la seva ocultació.',
    ],
    quote: 'El client no cancel·la pel preu: cancel·la per la falta de valor recent.',
  },
  {
    title: 'Fermentació a casa: el rebost viu que torna a les cuines',
    excerpt: 'Massa mare, kimchi i kombutxa. Una introducció pràctica a deixar que els microbis treballin per tu.',
    categories: ['Cultura', 'Gastronomia'], tags: ['cuina', 'salut', 'receptes'], author: 'Aina Soler', img: IMG('carma-food'),
    paragraphs: [
      'Fermentar és cuinar amb el temps com a ingredient. Una mica de paciència transforma el corrent en extraordinari.',
      'No necessites equip car: un pot net, sal i constància fan el 90% de la feina.',
      'El secret és l’observació diària —olor, bombolles, color— més que seguir una recepta al peu de la lletra.',
      'Comença pel xucrut: indulgent, ràpid i gairebé impossible d’espatllar.',
    ],
    list: ['Pesa la sal al 2% del pes de la verdura', 'Mantén-ho submergit i a l’ombra', 'Tasta cada dos dies'],
  },
  {
    title: 'Ciutats de 15 minuts: utopia urbana o pla realista?',
    excerpt: 'Tot el que necessites a un quart d’hora a peu. Analitzem els casos que ja funcionen i els que es van quedar al powerpoint.',
    categories: ['Ciència', 'Urbanisme'], tags: ['mobilitat', 'ciutat', 'clima'], author: 'Jordi Vidal', img: IMG('carma-city'),
    paragraphs: [
      'La idea és seductora: menys cotxe, més barri. Però el diable, com sempre, és a la implementació.',
      'Les ciutats que ho aconsegueixen no prohibeixen: fan que l’alternativa sigui més agradable que el cotxe.',
      'Sense habitatge assequible al centre, la ciutat de 15 minuts es converteix en privilegi de 15 minuts.',
      'El repte no és tècnic, és polític: redistribuir l’espai que avui ocupa l’asfalt.',
    ],
    quote: 'Una ciutat es mesura per la distància entre una persona i el que necessita.',
  },
  {
    title: 'El renaixement del paper en un món de pantalles',
    excerpt: 'Quaderns, llibretes i agendes analògiques venen més que mai. Per què el cervell encara estima la tinta.',
    categories: ['Cultura'], tags: ['hàbits', 'productivitat', 'escriptura'], author: 'Clara Bosch', img: IMG('carma-paper'),
    paragraphs: [
      'Enmig de la dictadura de les notificacions, escriure a mà s’ha tornat un acte gairebé rebel.',
      'La fricció del paper —lenta, deliberada— ajuda a pensar millor que la velocitat del teclat.',
      'No es tracta de renunciar al digital, sinó de saber quan cada eina rendeix més.',
      'Prova-ho una setmana: una idea per pàgina, sense esborrar. El resultat sorprèn.',
    ],
  },
  {
    title: 'Energia solar domèstica: els números que ningú t’explica',
    excerpt: 'Amortització real, autoconsum compartit i la lletra petita de les bateries. Una guia sense fum comercial.',
    categories: ['Tecnologia', 'Sostenibilitat'], tags: ['energia', 'llar', 'estalvi'], author: 'Sergi Pla', img: IMG('carma-solar'),
    paragraphs: [
      'Posar plaques no és comprar un gadget: és prendre una decisió financera a deu anys vista.',
      'L’orientació, l’ombra del veí i el teu perfil de consum pesen més que la marca del panell.',
      'Les bateries encara rarament surten a compte si tens un bon esquema de compensació d’excedents.',
      'Demana tres pressupostos i desconfia del que promet amortització en tres anys.',
    ],
    list: ['Revisa la teva corba de consum horària', 'Compara compensació vs. bateria', 'Verifica garanties reals de rendiment'],
  },
  {
    title: 'Música feta amb codi: l’algoritme com a instrument',
    excerpt: 'Del live coding als models generatius, una nova generació composa amb bucles, no amb cordes.',
    categories: ['Cultura', 'Tecnologia'], tags: ['música', 'creativitat', 'IA'], author: 'Èlia Torrent', img: IMG('carma-music'),
    paragraphs: [
      'Quan l’instrument és un editor de text, l’error de sintaxi també sona. I de vegades sona bé.',
      'El codi no substitueix la sensibilitat: la canalitza cap a estructures impossibles de tocar a mà.',
      'L’audiència ja no només escolta el resultat; vol veure el procés en directe, pantalla inclosa.',
      'La frontera entre programador i músic s’està dissolent, i la música ho agraeix.',
    ],
    quote: 'Tota restricció tècnica és, en mans d’un artista, una invitació.',
  },
  {
    title: 'Dormir bé no és un luxe: és la base de tota la resta',
    excerpt: 'Higiene del son sense pseudociència. Què diu l’evidència sobre llum, temperatura i horaris.',
    categories: ['Estil de vida', 'Salut'], tags: ['benestar', 'hàbits', 'ciència'], author: 'Roger Mas', img: IMG('carma-sleep'),
    paragraphs: [
      'Cap suplement compensa dormir malament de manera crònica. El son és el rendiment que negociem en silenci.',
      'La regularitat horària importa més que les hores totals: el cos estima la previsibilitat.',
      'Llum forta al matí, foscor i fresca a la nit: el protocol més infravalorat i més barat que existeix.',
      'Comença per una sola cosa —una hora fixa per llevar-te— i deixa que la resta s’hi ajusti.',
    ],
    list: ['Sense pantalles 45 min abans de dormir', 'Habitació a 18–19 °C', 'Cafeïna només abans del migdia'],
  },
]

/** The 10 dummy posts, dated to look like a recent, active feed. */
export function getDummyPosts(): LabPost[] {
  const now = Date.now()
  const DAY = 86_400_000
  return SEEDS.map((s, i): LabPost => ({
    id: `lab-post-${i + 1}`,
    title: s.title,
    slug: `lab-post-${i + 1}`,
    content: { html: body(s.paragraphs, { quote: s.quote, list: s.list }) },
    excerpt: s.excerpt,
    featured_image: s.img,
    categories: s.categories,
    tags: s.tags,
    author_name: s.author,
    created_at: new Date(now - (i * 2 + 1) * DAY).toISOString(),
    is_published: true,
  }))
}
