// WhatsApp Agent — review-link token (server-only).
//
// The approval link is the one public path that flips is_published, so the token
// is the load-bearing secret. We store ONLY sha256(token) in review_tokens; the
// raw token lives only inside the URL we send over WhatsApp. Lookup hashes the
// incoming token and matches on the stored hash, so a DB read never reveals a
// usable token.

import { createHash, randomBytes } from 'node:crypto'

// 32 random bytes = 256 bits of entropy, base64url so it is URL-safe with no
// padding. Not guessable, not enumerable.
const TOKEN_BYTES = 32

export interface MintedToken {
  /** The secret that goes in the review URL. Never stored. */
  raw: string
  /** sha256(raw) hex — what we persist in review_tokens.token_hash. */
  hash: string
}

/** Mint a fresh review token: a raw secret for the link + its hash for the DB. */
export function mintReviewToken(): MintedToken {
  const raw = randomBytes(TOKEN_BYTES).toString('base64url')
  return { raw, hash: hashToken(raw) }
}

/** Hash a raw token for storage/lookup. Deterministic; same input → same hash. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/** When a freshly minted token expires, given the configured TTL (hours). */
export function reviewTokenExpiry(ttlHours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000)
}
