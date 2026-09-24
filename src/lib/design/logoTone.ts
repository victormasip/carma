// W6 — how a logo reads on a ground, from its pixels (server-only).
//
// A header we rebuild, or harmonise onto a new surface, moves their logo off the
// colour it was drawn for. Verne's white mark sat on a dark photograph; on a paper
// bar it is invisible. So the capture measures the mark once — one small fetch, one
// 64px decode — and the chrome re-inks a one-colour mark that would vanish
// (chrome.ts#logoFilter). A colour logo, or one on its own plate, is never touched.

import sharp from 'sharp'
import { safeFetchBinary } from '@/lib/scrape/http'
import type { ChromeCapture, LogoTone } from '@/lib/design/chrome'

const MAX_LOGO_BYTES = 2 * 1024 * 1024

/**
 * The tone of raw pixels. Pure, so the gates feed it synthetic marks.
 *   · almost nothing opaque → null (not a mark we can read);
 *   · almost everything opaque → `any`: the mark carries its own plate;
 *   · otherwise the mean luminance of the opaque pixels: near-white → `light`,
 *     near-black → `dark`, anything with colour or mid-tone → `any`.
 */
export function toneOfPixels(data: Uint8Array, channels: number): LogoTone | null {
  let n = 0, opaque = 0, sum = 0
  for (let i = 0; i + 2 < data.length; i += channels) {
    n++
    if (channels === 4 && data[i + 3]! < 128) continue
    opaque++
    sum += (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255
  }
  if (!n || opaque / n < 0.02) return null
  if (opaque / n > 0.97) return 'any'
  const mean = sum / opaque
  return mean > 0.8 ? 'light' : mean < 0.2 ? 'dark' : 'any'
}

/** The tone of the logo at `src`, or null when it cannot be read. Never throws. */
export async function logoTone(src: string | null | undefined): Promise<LogoTone | null> {
  if (!src || !/^https?:\/\//i.test(src)) return null
  try {
    const got = await safeFetchBinary(src, { maxBytes: MAX_LOGO_BYTES, timeout: 5_000 })
    if (!got) { console.warn('[design/logo] not fetched:', src.slice(0, 120)); return null }
    const { data, info } = await sharp(Buffer.from(got.body), { density: 72, limitInputPixels: 25_000_000 })
      .resize(64, 64, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return toneOfPixels(data, info.channels)
  } catch (e) {
    console.warn('[design/logo] tone unreadable:', src.slice(0, 120), e instanceof Error ? e.message : e)
    return null
  }
}

/** A capture with its logo's tone measured. */
export async function withLogoTone(c: ChromeCapture | null): Promise<ChromeCapture | null> {
  if (!c?.nav.logo) return c
  const tone = await logoTone(c.nav.logo.src)
  return { ...c, nav: { ...c.nav, logo: { ...c.nav.logo, tone } } }
}
