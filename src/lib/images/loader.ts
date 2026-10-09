'use client'

// The next/image loader of the app (W1 — global image policy), wired once in
// next.config so that ANY `next/image` in Carma resolves through /api/img: our
// SSRF-hardened transform that answers AVIF or WebP by the browser's Accept and is
// cached at the edge for a year. Without it, Next's own optimizer would need every
// customer host in `remotePatterns` — a list nobody can keep complete — and a
// remote `src` would throw instead of rendering.
//
// No component imports next/image today, and that is measured, not taste: its
// runtime is ~10KB raw / ~3KB gzip, and the sidebar's site switcher would put it
// on EVERY app route (test:perf, 2026-10-09: ten routes over target, nothing else
// changed). The product's images use the zero-runtime helpers in ./url.ts —
// same endpoint, same srcset/sizes, same lazy-by-default — and this file is the
// guardrail for the day someone reaches for next/image anyway.
//
// Pure and dependency-free: next/image calls it in the browser too.

import { canOptimize, imgUrl } from './url'

export default function carmaImageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  // (canOptimize is a type guard over string | null; guarding a widened copy keeps
  // `src` itself a string in the branch below.)
  const candidate: string | null = src
  if (canOptimize(candidate)) return imgUrl(candidate, width, quality)
  // Our own static files (/public) are pre-sized at build time and served as they
  // are; the width still rides along so each srcset entry stays a distinct URL.
  return `${src}${src.includes('?') ? '&' : '?'}w=${width}`
}
