// Grabber Eval — the 100-site Barcelona benchmark dataset.
//
// Real-world, messy SMB + institutional websites across the niches Carma
// actually serves, all Barcelona-based (curated 2026-07-13 via live niche
// searches + long-standing institutions). This module is imported by BOTH the
// Node eval runner (tests/grabber-eval.mjs, via the ts-loader) and the
// superadmin review UI (/admin/grabber-eval), so the case ids are the single
// shared key between automated reports and human reviews.
//
// Rules of the dataset:
//   · ids are stable and NEVER reused — reviews and cached snapshots key on them.
//   · urls point at the site ROOT (that's what the onboarding grabber receives),
//     except deliberate path-edge-cases (marked in notes).
//   · Dead/blocked sites stay listed — "unreachable" is itself a datapoint the
//     engine must handle gracefully. Prune only via review, never silently.

export type EvalNiche =
  | 'dental' | 'restaurant' | 'gym' | 'legal' | 'beauty' | 'realestate'
  | 'education' | 'physio' | 'florist' | 'auto' | 'vet' | 'bakery'
  | 'architecture' | 'psychology' | 'culture'

export type EvalCase = {
  /** Stable unique id (niche-slug). */
  id: string
  url: string
  niche: EvalNiche
  name: string
  notes?: string
}

export const EVAL_DATASET: readonly EvalCase[] = [
  // ── Clíniques dentals ──────────────────────────────────────────────────────
  { id: 'dental-cdb',        url: 'https://www.clinicadentalbarcelona.com/', niche: 'dental', name: 'Clínica Dental Barcelona' },
  { id: 'dental-den',        url: 'https://clinicasden.com/',                niche: 'dental', name: 'Clíniques Den' },
  { id: 'dental-cambra',     url: 'https://www.cambraclinic.com/',           niche: 'dental', name: 'Cambra Clinic' },
  { id: 'dental-care',       url: 'https://www.dentalcarebarcelona.com/',    niche: 'dental', name: 'Dental Care Barcelona' },
  { id: 'dental-bcndental',  url: 'https://clinicabarcelonadental.com/',     niche: 'dental', name: 'Clínica Barcelona Dental' },
  { id: 'dental-puyuelo',    url: 'https://www.clinicapuyuelo.es/',          niche: 'dental', name: 'Clínica Puyuelo' },
  { id: 'dental-cero',       url: 'https://clinicadentalcero.com/',          niche: 'dental', name: 'Clínica Dental CERO' },

  // ── Restaurants ────────────────────────────────────────────────────────────
  { id: 'resto-verne',       url: 'https://www.vernebarcelona.com/',         niche: 'restaurant', name: 'Verne Barcelona' },
  { id: 'resto-disfrutar',   url: 'https://www.disfrutarbarcelona.com/',     niche: 'restaurant', name: 'Disfrutar' },
  { id: 'resto-santmarti',   url: 'https://www.santmarti-restaurant.es/',    niche: 'restaurant', name: 'Sant Martí Restaurant' },
  { id: 'resto-patron',      url: 'https://patronrestaurante.com/',          niche: 'restaurant', name: 'Patrón Restaurante' },
  { id: 'resto-nacional',    url: 'https://www.elnacionalbcn.com/',          niche: 'restaurant', name: 'El Nacional BCN' },
  { id: 'resto-7portes',     url: 'https://7portes.com/',                    niche: 'restaurant', name: '7 Portes' },
  { id: 'resto-casabonay',   url: 'https://casabonay.com/',                  niche: 'restaurant', name: 'Casa Bonay' },

  // ── Gimnasos i centres esportius ───────────────────────────────────────────
  { id: 'gym-colom',         url: 'https://www.cemcolom.com/',               niche: 'gym', name: 'CEM Colom' },
  { id: 'gym-rocafort',      url: 'https://www.esportiurocafort.com/',       niche: 'gym', name: 'Esportiu Rocafort' },
  { id: 'gym-putxet',        url: 'https://putxetsport.cat/',                niche: 'gym', name: 'PutxetSport' },
  { id: 'gym-canricart',     url: 'https://www.canricart.com/',              niche: 'gym', name: 'CEM Can Ricart' },
  { id: 'gym-claror',        url: 'https://claror.cat/',                     niche: 'gym', name: 'Clubs Claror' },
  { id: 'gym-latorre',       url: 'https://www.latorredebarcelona.com/',     niche: 'gym', name: 'La Torre de Barcelona' },

  // ── Despatxos d'advocats ───────────────────────────────────────────────────
  { id: 'legal-granvia',     url: 'https://granviaadvocats.com/',            niche: 'legal', name: 'Gran Via Advocats' },
  { id: 'legal-forcam',      url: 'https://www.forcamabogados.com/',         niche: 'legal', name: 'Forcam Advocats' },
  { id: 'legal-martinezc',   url: 'https://martinezcaballeroabogados.com/',  niche: 'legal', name: 'Martínez Caballero' },
  { id: 'legal-batlle',      url: 'https://www.batlleferrerabogados.com/',   niche: 'legal', name: 'Batlle Ferrer' },
  { id: 'legal-garanley',    url: 'https://garanley.com/',                   niche: 'legal', name: 'Garanley' },
  { id: 'legal-bombi',       url: 'https://www.bombi-advocats.cat/',         niche: 'legal', name: 'Bombí & Ripoll' },
  { id: 'legal-serra',       url: 'https://www.bufetserra.com/',             niche: 'legal', name: 'Bufet Serra' },

  // ── Perruqueria i estètica ─────────────────────────────────────────────────
  { id: 'beauty-hipolita',   url: 'https://www.hipolita.cat/',               niche: 'beauty', name: 'Hipolita' },
  { id: 'beauty-salon223',   url: 'https://salon223.com/',                   niche: 'beauty', name: 'Salon 223' },
  { id: 'beauty-newlook',    url: 'https://newlook.es/',                     niche: 'beauty', name: 'New Look' },
  { id: 'beauty-petitsalon', url: 'https://lepetitsalonbarcelona.com/',      niche: 'beauty', name: 'Le Petit Salon' },
  { id: 'beauty-backstage',  url: 'https://backstagebcn.com/',               niche: 'beauty', name: 'Backstage BCN' },

  // ── Immobiliàries ──────────────────────────────────────────────────────────
  { id: 'estate-westside',   url: 'https://westside.cat/',                   niche: 'realestate', name: 'West Side' },
  { id: 'estate-barcelo',    url: 'https://immobarcelo.es/',                 niche: 'realestate', name: 'ImmoBarceló' },
  { id: 'estate-punto',      url: 'https://puntohabitat.es/',                niche: 'realestate', name: 'Punto Habitat' },
  { id: 'estate-roca',       url: 'https://www.rocaimmobiliaria.com/',       niche: 'realestate', name: 'Roca Immobiliària' },
  { id: 'estate-mg',         url: 'https://mgbcn.com/',                      niche: 'realestate', name: 'MG Grup Immobiliari' },
  { id: 'estate-probesa',    url: 'https://probesa.com/',                    niche: 'realestate', name: 'Probesa' },
  { id: 'estate-forcadell',  url: 'https://forcadell.com/',                  niche: 'realestate', name: 'Forcadell' },
  { id: 'estate-immobcn',    url: 'https://immobiliariabarcelona.es/',       niche: 'realestate', name: 'Immobiliària Barcelona' },

  // ── Acadèmies i escoles d'idiomes ──────────────────────────────────────────
  { id: 'edu-idiomarum',     url: 'https://idiomarum.com/',                  niche: 'education', name: 'Idiomarum' },
  { id: 'edu-eoivh',         url: 'https://eoibcnvh.cat/',                   niche: 'education', name: "EOI Vall d'Hebron" },
  { id: 'edu-hey',           url: 'https://www.heyidiomes.com/',             niche: 'education', name: 'Hey! Idiomes' },
  { id: 'edu-uab',           url: 'https://www.uab.cat/idiomes-barcelona/',  niche: 'education', name: 'UAB Idiomes', notes: 'path-edge-case: blog/section under a university mega-site' },
  { id: 'edu-eim',           url: 'https://www.eim.ub.edu/',                 niche: 'education', name: 'EIM UB' },
  { id: 'edu-bcnlang',       url: 'https://www.bcnlanguages.com/',           niche: 'education', name: 'BCN Languages' },
  { id: 'edu-tarradellas',   url: 'https://idiomestarradellas.cat/',         niche: 'education', name: 'Idiomes Tarradellas' },
  { id: 'edu-funtalk',       url: 'https://funtalk.es/',                     niche: 'education', name: 'Funtalk' },
  { id: 'edu-comunicat',     url: 'https://www.comuni.cat/',                 niche: 'education', name: "Comunica't" },

  // ── Fisioteràpia ───────────────────────────────────────────────────────────
  { id: 'physio-fclinics',   url: 'https://barcelona.fisio-clinics.com/',    niche: 'physio', name: 'FisioClinics BCN', notes: 'subdomain of a franchise network' },
  { id: 'physio-castro',     url: 'https://www.fisioterapiadeportivacastro.com/', niche: 'physio', name: 'Fisioteràpia Castro' },
  { id: 'physio-fisic',      url: 'https://fisiofisic.com/',                 niche: 'physio', name: 'FisioFisic' },
  { id: 'physio-barnafisio', url: 'https://www.clinicasarria.com/',          niche: 'physio', name: 'Barna Fisio (Sarrià)' },
  { id: 'physio-albareda',   url: 'https://www.clinicaalbareda.cat/',        niche: 'physio', name: 'Clínica Albareda' },
  { id: 'physio-moviment',   url: 'https://fisiomoviment.com/',              niche: 'physio', name: 'Fisiomoviment' },

  // ── Floristeries ───────────────────────────────────────────────────────────
  { id: 'florist-herbs',     url: 'https://www.herbs.es/',                   niche: 'florist', name: 'Herbs' },
  { id: 'florist-navarro',   url: 'https://floresnavarro.com/',              niche: 'florist', name: 'Flores Navarro' },
  { id: 'florist-bausa',     url: 'https://bausaflors.barcelona/',           niche: 'florist', name: 'Bausa Flors', notes: '.barcelona TLD' },
  { id: 'florist-emi',       url: 'https://floristeriaemi.net/',             niche: 'florist', name: 'Floristeria EMI', notes: 'web viva des de 1997 — HTML antic probable' },
  { id: 'florist-ladyflor',  url: 'https://www.ladyflor.com/',               niche: 'florist', name: 'Ladyflor' },
  { id: 'florist-planteta',  url: 'https://laplanteta.com/',                 niche: 'florist', name: 'La Planteta' },
  { id: 'florist-torreta',   url: 'https://floristerialatorreta.es/',        niche: 'florist', name: 'La Torreta' },
  { id: 'florist-lloveras',  url: 'https://florslloveras.com/',              niche: 'florist', name: 'Flors Lloveras' },
  { id: 'florist-nune',      url: 'https://www.nuneflor.com/',               niche: 'florist', name: 'NUNE' },
  { id: 'florist-florster',  url: 'https://florster.com/',                   niche: 'florist', name: 'Florster' },

  // ── Tallers mecànics ───────────────────────────────────────────────────────
  { id: 'auto-xaus',         url: 'https://www.xaustm.es/',                  niche: 'auto', name: 'Xaus Taller Mecànic' },
  { id: 'auto-tcbcn',        url: 'https://www.tcbarcelona.es/',             niche: 'auto', name: 'TC Barcelona' },
  { id: 'auto-mecanics',     url: 'https://www.mecanicsbcn.com/',            niche: 'auto', name: 'Mecànics BCN' },
  { id: 'auto-emocio',       url: 'https://autoemocio.es/',                  niche: 'auto', name: 'Autoemoció' },

  // ── Veterinaris ────────────────────────────────────────────────────────────
  { id: 'vet-delclinic',     url: 'https://www.veterinaridelclinic.com/',    niche: 'vet', name: 'Veterinari del Clínic' },
  { id: 'vet-vetpro',        url: 'https://www.veterinaribarcelona.com/',    niche: 'vet', name: 'Vetpro Provença' },
  { id: 'vet-barnavets',     url: 'https://www.barnavets.com/',              niche: 'vet', name: 'Barna Vets' },
  { id: 'vet-exotics',       url: 'https://exoticsveterinaria.com/',         niche: 'vet', name: 'Exòtics Veterinària' },
  { id: 'vet-borrell',       url: 'https://www.clinicaveterinariaborrell.com/', niche: 'vet', name: 'CV Borrell' },
  { id: 'vet-lasalut',       url: 'https://www.lasalut.es/',                 niche: 'vet', name: 'CV La Salut' },
  { id: 'vet-clinivet',      url: 'https://clinivet.cat/',                   niche: 'vet', name: 'Clinivet' },
  { id: 'vet-trestorres',    url: 'https://www.trestorresveterinaris.com/',  niche: 'vet', name: 'Tres Torres Veterinaris' },

  // ── Forns i pastisseries ───────────────────────────────────────────────────
  { id: 'bakery-miralles',   url: 'http://fornmiralles.cat/',                niche: 'bakery', name: 'Forn Miralles', notes: 'http:// sense TLS — cas límit real' },
  { id: 'bakery-macxipa',    url: 'https://macxipan.com/',                   niche: 'bakery', name: 'Macxipa' },
  { id: 'bakery-arenas',     url: 'https://www.arenasmolins.com/',           niche: 'bakery', name: 'Arenas Molins' },
  { id: 'bakery-trinitat',   url: 'https://forntrinitat.com/',               niche: 'bakery', name: 'Forn Trinitat' },

  // ── Arquitectura i interiorisme ────────────────────────────────────────────
  { id: 'arch-molins',       url: 'https://molinsdesign.com/',               niche: 'architecture', name: 'Molins Design' },
  { id: 'arch-romanelli',    url: 'https://estudioromanelli.es/',            niche: 'architecture', name: 'Estudio Romanelli' },
  { id: 'arch-vive',         url: 'https://vivestudio.es/',                  niche: 'architecture', name: 'VIVE Studio' },
  { id: 'arch-oxigen',       url: 'https://oxigeninteriors.com/',            niche: 'architecture', name: 'Oxigen Interiors' },
  { id: 'arch-theroom',      url: 'https://theroom-studio.com/',             niche: 'architecture', name: 'The Room Studio' },
  { id: 'arch-coblonal',     url: 'https://coblonal.com/',                   niche: 'architecture', name: 'Coblonal' },
  { id: 'arch-aia',          url: 'https://www.aiastudiobcn.com/',           niche: 'architecture', name: 'AIA Studio' },
  { id: 'arch-pia',          url: 'https://piaestudi.com/',                  niche: 'architecture', name: 'PIA Estudi' },

  // ── Psicologia ─────────────────────────────────────────────────────────────
  { id: 'psy-capia',         url: 'https://www.psicologiacapia.com/',        niche: 'psychology', name: 'Capia' },
  { id: 'psy-psyclinic',     url: 'https://www.psyclinic.es/',               niche: 'psychology', name: 'Psyclinic' },
  { id: 'psy-cedipte',       url: 'https://www.cedipte-psicologia.com/',     niche: 'psychology', name: 'Cedipte' },
  { id: 'psy-isep',          url: 'https://barcelona.isepclinic.es/',        niche: 'psychology', name: 'ISEP Clínic BCN', notes: 'subdomain of a franchise network' },
  { id: 'psy-itae',          url: 'https://itaepsicologia.com/',             niche: 'psychology', name: 'Itae' },
  { id: 'psy-parentesi',     url: 'https://parentesi-ep.com/',               niche: 'psychology', name: 'Parèntesi' },

  // ── Cultura (institucions estables — chrome complex, mega-menús) ───────────
  { id: 'cult-macba',        url: 'https://www.macba.cat/',                  niche: 'culture', name: 'MACBA' },
  { id: 'cult-mnac',         url: 'https://www.museunacional.cat/',          niche: 'culture', name: 'MNAC' },
  { id: 'cult-cccb',         url: 'https://www.cccb.org/',                   niche: 'culture', name: 'CCCB' },
  { id: 'cult-liceu',        url: 'https://www.liceubarcelona.cat/',         niche: 'culture', name: 'Gran Teatre del Liceu' },
  { id: 'cult-lliure',       url: 'https://www.teatrelliure.com/',           niche: 'culture', name: 'Teatre Lliure' },
] as const

/** All distinct niches, in dataset order (for the UI's grouped list). */
export function evalNiches(): EvalNiche[] {
  const seen = new Set<EvalNiche>()
  for (const c of EVAL_DATASET) seen.add(c.niche)
  return [...seen]
}

export function getEvalCase(id: string): EvalCase | undefined {
  return EVAL_DATASET.find(c => c.id === id)
}
