import { createHash } from 'node:crypto'

/**
 * Maps an in-flight token to the single replacement issued for it.
 *
 * Without this, every request carrying a refresh-eligible token mints its own
 * replacement. A browser fires many requests in parallel on page load, so a
 * single stale token fans out into N different successor tokens, each written
 * to localStorage as its response lands. The last writer wins, every other
 * successor is orphaned, and any request still in flight with an orphaned token
 * 401s — which now tears the session down and bounces the user to /login.
 *
 * Keeping one replacement per original token makes the refresh idempotent: all
 * concurrent requests observe the same successor, so whichever response lands
 * last stores the same value.
 *
 * Entries are keyed by a hash of the original token (never the raw token, so a
 * heap dump can't be replayed) and expire well inside the token's own lifetime.
 */
const TTL_MS = 60 * 1000

/** Bound the map so a token-flood can't grow it without limit. */
const MAX_ENTRIES = 10_000

interface Entry {
  replacement: string
  expiresAt: number
}

const cache = new Map<string, Entry>()

const keyFor = (token: string): string => createHash('sha256').update(token).digest('hex')

function evictExpired(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key)
  }
}

/**
 * Return the replacement already issued for `token`, or undefined.
 */
export function getRefreshedToken(token: string): string | undefined {
  const entry = cache.get(keyFor(token))
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    cache.delete(keyFor(token))
    return undefined
  }
  return entry.replacement
}

/**
 * Record the replacement issued for `token`.
 */
export function setRefreshedToken(token: string, replacement: string): void {
  const now = Date.now()
  if (cache.size >= MAX_ENTRIES) {
    evictExpired(now)
    // Still full after evicting expired entries: drop the oldest insertion.
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
  }
  cache.set(keyFor(token), { replacement, expiresAt: now + TTL_MS })
}

/** Test helper. */
export function clearTokenRefreshCache(): void {
  cache.clear()
}
