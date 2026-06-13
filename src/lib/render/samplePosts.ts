// Demo articles injected ONLY into preview renders (`/render/<id>?preview=1`)
// when a site has no published posts yet — so the onboarding / theme-selection
// grid shows a full, beautiful feed instead of a bare "no articles" empty state.
//
// These are NEVER served on the public render (which carries no `?preview`
// flag), so real visitors never see placeholder content. Shape matches the post
// rows `buildListingPage`/`buildListingFragment` consume (same fields the
// template-preview route already uses successfully).

import type { Locale } from '@/lib/i18n/config'

type Sample = { title: string; excerpt: string; cat: string; seed: string }

const SAMPLES: Record<Locale, Sample[]> = {
  ca: [
    { title: 'Com construir una marca que perduri en el temps', excerpt: 'Una guia pràctica sobre identitat, to de veu i consistència visual a cada punt de contacte.', cat: 'Estratègia', seed: 'carma-a' },
    { title: 'Les tendències de disseny editorial per al 2026', excerpt: 'El que ve en tipografia, color i composició per a publicacions digitals modernes.', cat: 'Disseny', seed: 'carma-b' },
    { title: 'Escriure per a humans i per a cercadors alhora', excerpt: 'SEO modern sense sacrificar la veu de la teva marca ni la qualitat editorial.', cat: 'Contingut', seed: 'carma-c' },
    { title: 'L’art de la portada: imatges que conviden a llegir', excerpt: 'Com triar i tractar la fotografia destacada perquè cada article respiri.', cat: 'Fotografia', seed: 'carma-d' },
    { title: 'Newsletter: convertir lectors en una comunitat', excerpt: 'Estratègies provades per fer créixer i fidelitzar la teva audiència.', cat: 'Creixement', seed: 'carma-e' },
    { title: 'Un sistema de color que funciona a tot arreu', excerpt: 'Paletes accessibles, coherents i fàcils de mantenir en mode clar i fosc.', cat: 'Disseny', seed: 'carma-f' },
  ],
  es: [
    { title: 'Cómo construir una marca que perdure en el tiempo', excerpt: 'Una guía práctica sobre identidad, tono de voz y consistencia visual en cada punto de contacto.', cat: 'Estrategia', seed: 'carma-a' },
    { title: 'Las tendencias de diseño editorial para 2026', excerpt: 'Lo que viene en tipografía, color y composición para publicaciones digitales modernas.', cat: 'Diseño', seed: 'carma-b' },
    { title: 'Escribir para personas y buscadores a la vez', excerpt: 'SEO moderno sin sacrificar la voz de tu marca ni la calidad editorial.', cat: 'Contenido', seed: 'carma-c' },
    { title: 'El arte de la portada: imágenes que invitan a leer', excerpt: 'Cómo elegir y tratar la fotografía destacada para que cada artículo respire.', cat: 'Fotografía', seed: 'carma-d' },
    { title: 'Newsletter: convertir lectores en una comunidad', excerpt: 'Estrategias probadas para hacer crecer y fidelizar a tu audiencia.', cat: 'Crecimiento', seed: 'carma-e' },
    { title: 'Un sistema de color que funciona en todas partes', excerpt: 'Paletas accesibles, coherentes y fáciles de mantener en modo claro y oscuro.', cat: 'Diseño', seed: 'carma-f' },
  ],
  en: [
    { title: 'How to build a brand that lasts', excerpt: 'A practical guide to identity, tone of voice and visual consistency at every touchpoint.', cat: 'Strategy', seed: 'carma-a' },
    { title: 'Editorial design trends for 2026', excerpt: 'What’s next in typography, color and composition for modern digital publications.', cat: 'Design', seed: 'carma-b' },
    { title: 'Writing for humans and search engines at once', excerpt: 'Modern SEO without sacrificing your brand voice or editorial quality.', cat: 'Content', seed: 'carma-c' },
    { title: 'The art of the cover image: photos that invite a read', excerpt: 'How to pick and treat the featured photo so every article can breathe.', cat: 'Photography', seed: 'carma-d' },
    { title: 'Newsletter: turning readers into a community', excerpt: 'Proven strategies to grow and retain your audience over time.', cat: 'Growth', seed: 'carma-e' },
    { title: 'A color system that works everywhere', excerpt: 'Accessible, coherent palettes that are easy to maintain in light and dark mode.', cat: 'Design', seed: 'carma-f' },
  ],
}

export function buildSamplePosts(locale: Locale, authorName = 'Carma') {
  const set = SAMPLES[locale] ?? SAMPLES.ca
  return set.map((s, i) => ({
    id: `sample-${i}`,
    title: s.title,
    slug: `demo-${i}`,
    content: { html: '' },
    excerpt: s.excerpt,
    featured_image: `https://picsum.photos/seed/${s.seed}/900/560`,
    categories: [s.cat],
    tags: [] as string[],
    author_name: authorName,
    created_at: new Date(Date.now() - i * 3 * 86_400_000).toISOString(),
    is_published: true,
  }))
}
