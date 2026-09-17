// One-shot asset build: the eight photographs the landing's Studio demo uses.
//
// WHY THEY ARE VENDORED AND NOT HOT-LINKED
// The Studio demo used to draw eight CSS gradients and call them photographs.
// Founder, 2026-09-17: "use realistic stock images instead of basic
// placeholders." The obvious fix — point <img> at images.unsplash.com — makes
// the most important interactive thing on our marketing page depend on a third
// party being up, and leaks every visitor to their CDN. So the photos are
// fetched once, re-encoded small, and served from /public like everything else.
//
// Source: Unsplash. The Unsplash License permits commercial use without
// permission or attribution; the photographer is credited in CREDITS below
// anyway, because not having to is not a reason not to.
//
// Run: node scripts/fetch-studio-photos.mjs   (only needed when the set changes)

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT = path.join(process.cwd(), 'public', 'studio')

// 520px wide is twice the largest box the demo ever paints one in (the featured
// hero at ~260 CSS px on a 2x screen), which is the whole budget an illustration
// below the fold deserves.
const WIDTH = 520
const QUALITY = 68

const PHOTOS = [
  { slug: 'taula',   id: 'photo-1517248135467-4c7edcad34c4', note: 'restaurant table' },
  { slug: 'botiga',  id: 'photo-1441986300917-64674bd600d8', note: 'shopfront' },
  { slug: 'taller',  id: 'photo-1531973576160-7125cd663d86', note: 'workshop bench' },
  { slug: 'equip',   id: 'photo-1522202176988-66273c2fd55f', note: 'people working together' },
  { slug: 'plat',    id: 'photo-1504674900247-0877df9cc836', note: 'plated food' },
  { slug: 'oficina', id: 'photo-1497366754035-f200968a6e72', note: 'meeting room' },
  { slug: 'edifici', id: 'photo-1486406146926-c627a92ad1ab', note: 'architecture' },
  { slug: 'escriptori', id: 'photo-1542744173-8e7e53415bb0', note: 'desk' },
]

await mkdir(OUT, { recursive: true })

for (const p of PHOTOS) {
  const url = `https://images.unsplash.com/${p.id}?w=1200&q=80&fm=jpg&fit=crop`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`  ✗ ${p.slug}: HTTP ${res.status}`)
    process.exitCode = 1
    continue
  }
  const input = Buffer.from(await res.arrayBuffer())
  const out = await sharp(input)
    .resize({ width: WIDTH, height: Math.round((WIDTH * 10) / 16), fit: 'cover', position: 'attention' })
    .webp({ quality: QUALITY, effort: 6 })
    .toBuffer()
  await writeFile(path.join(OUT, `${p.slug}.webp`), out)
  console.log(`  ✓ ${p.slug}.webp  ${(out.length / 1024).toFixed(1)} KB  (${p.note})`)
}

console.log(`\nDone — ${PHOTOS.length} photos in public/studio/`)
