// THE WALL — real member blogs, painted in their own colours (server component).
//
// Two things make this correct rather than merely true:
//
// 1. IT IS ITS OWN CACHE ENTRY. The landing is cached with `cacheLife('max')`
//    because marketing copy only changes when we deploy. Member blogs do not
//    work that way — a wall frozen at build time is a static placeholder wearing
//    a database. So this is a separate `use cache` with an hourly life, passed
//    into the cached landing as a compositional slot (see app/page.tsx), which
//    the Cache Components contract keeps out of the landing's cache key.
//
// 2. IT LINKS TO THE BLOG, not to a screenshot and not to `/render/<uuid>`.
//    `readWall` already resolves each one through `publicSiteUrl`.
//
// The card is a MINIATURE of the real thing: the blog's own accent, ground,
// border, text colour and heading face, its own section title, its real cover
// image and its real headlines. Nothing on it is invented — which is the entire
// point of the section it lives in.

import { cacheLife, cacheTag } from 'next/cache'
import { ArrowUpRight } from 'lucide-react'
import { readWall, WALL_TAG, type WallBlog } from '@/lib/marketing/wall'
import { LANDING } from './copy'
import type { UiLocale } from '@/lib/i18n/config'

// Re-exported: the tag now lives next to the query it invalidates (lib/marketing/wall).
export { WALL_TAG }

export default async function CommunityWall({ locale }: { locale: UiLocale }) {
  'use cache'
  // Hourly, not 'max': the whole point is that a blog published this morning can
  // be on the wall this afternoon. `cacheTag` lets a publish bust it explicitly.
  cacheLife('hours')
  cacheTag(WALL_TAG)

  const c = (LANDING[locale] ?? LANDING.ca).comunitat
  const blogs = await readWall(12)

  if (!blogs.length) {
    return (
      <p className="mx-auto mt-6 max-w-xl px-4 text-center text-base font-medium leading-relaxed text-muted">
        {c.wallEmpty}
      </p>
    )
  }

  return (
    <>
      <div className="mt-6 overflow-hidden">
        <div className="wall">
          {blogs.map(b => <WallCard key={b.id} b={b} c={c} />)}
        </div>
      </div>
      <p className="mx-auto mt-5 max-w-xl px-4 text-center text-sm font-medium text-subtle">{c.wallNote}</p>
    </>
  )
}

function WallCard({ b, c }: { b: WallBlog; c: (typeof LANDING)['ca']['comunitat'] }) {
  const heading = b.fontHeading ?? undefined
  return (
    <a
      href={b.url}
      target="_blank"
      rel="noopener noreferrer"
      className="lift group block w-[17rem] shrink-0 overflow-hidden rounded-2xl border no-underline shadow-card"
      style={{ background: b.surface, borderColor: b.border }}
    >
      {/* its accent rule */}
      <div className="h-1.5 w-full" style={{ background: b.accent }} />

      {/* its own header bar */}
      <div
        className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5"
        style={{ background: b.bg, borderColor: b.border }}
      >
        <span className="truncate text-sm font-extrabold tracking-tight" style={{ color: b.text, fontFamily: heading }}>
          {b.name}
        </span>
        <ArrowUpRight
          className="h-3.5 w-3.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100"
          style={{ color: b.accent }}
          aria-hidden
        />
      </div>

      <div className="p-3.5" style={{ background: b.bg }}>
        {b.sectionTitle && (
          <p className="text-[0.95rem] font-extrabold leading-tight" style={{ color: b.text, fontFamily: heading }}>
            {b.sectionTitle}
          </p>
        )}

        {/* A REAL cover from a REAL post. No next/image: these are arbitrary
            customer hosts, and the point of the card is the blog's own look, at
            17rem, lazily, below the fold. */}
        {b.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={b.cover}
            alt=""
            width={320}
            height={200}
            loading="lazy"
            decoding="async"
            className="mt-2.5 block aspect-[16/10] w-full rounded-lg object-cover"
            style={{ background: `color-mix(in oklab, ${b.accent} 22%, transparent)` }}
          />
        ) : (
          <span
            className="mt-2.5 block aspect-[16/10] w-full rounded-lg"
            style={{ background: `linear-gradient(135deg, ${b.accent}, color-mix(in oklab, ${b.accent} 35%, transparent))` }}
            aria-hidden
          />
        )}

        {/* its real headlines */}
        <div className="mt-3 space-y-1.5">
          {b.headlines.map(h => (
            <p
              key={h}
              className="line-clamp-2 text-[0.82rem] font-bold leading-snug"
              style={{ color: b.text, fontFamily: heading }}
            >
              {h}
            </p>
          ))}
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[0.68rem] font-bold" style={{ color: b.accent }}>
          <span>{b.publishedPosts} {c.wallPosts}</span>
          {b.activeModules > 0 && <><span aria-hidden>·</span><span>{b.activeModules} {c.wallModules}</span></>}
          <span className="ml-auto opacity-70 transition-opacity group-hover:opacity-100">{c.wallVisit}</span>
        </p>
      </div>
    </a>
  )
}
