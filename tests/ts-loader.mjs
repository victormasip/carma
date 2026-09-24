// Minimal ESM resolve hook so a plain `node --experimental-strip-types` run can
// import the REAL render/scrape modules (which use the `@/` alias and
// extensionless relative imports). Maps `@/x` → <repo>/src/x and appends a
// source extension to extensionless relative/alias specifiers. Bare specifiers
// (parse5, node-html-parser, node:*) pass straight through.

import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src')
const EXTS = ['.ts', '.tsx', '.mts', '.js']

function withExt(absNoExt) {
  if (/\.[a-z]+$/i.test(absNoExt) && existsSync(absNoExt)) return absNoExt
  for (const e of EXTS) if (existsSync(absNoExt + e)) return absNoExt + e
  for (const e of EXTS) {
    const idx = path.join(absNoExt, 'index' + e)
    if (existsSync(idx)) return idx
  }
  return null
}

export async function resolve(specifier, context, next) {
  let abs = null
  if (specifier.startsWith('@/')) {
    abs = path.join(SRC, specifier.slice(2))
  } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    abs = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
  }
  if (abs) {
    const resolved = withExt(abs)
    if (resolved) return next(pathToFileURL(resolved).href, context)
  }
  // `next/server` is a CommonJS file with no `exports` map, so Node's ESM resolver
  // cannot find it by its bare name. Route handlers import it; test:reveal imports
  // route handlers. `next/cache` likewise, for the render core (blogRender.ts).
  if (specifier === 'next/server' || specifier === 'next/cache') return next(`${specifier}.js`, context)
  return next(specifier, context)
}
