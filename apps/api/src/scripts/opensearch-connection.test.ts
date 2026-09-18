import { describe, it, expect } from 'vitest'
import { LOG_ALIAS, resolveConnection } from './opensearch-connection.js'

/** Decode a Basic auth blob back to `user:pass` for assertions. */
function decode(auth: string): string {
  return Buffer.from(auth, 'base64').toString('utf8')
}

describe('resolveConnection', () => {
  it('parses a full URL, stripping credentials from the base URL', () => {
    const { baseUrl, auth } = resolveConnection({
      PROD_OPENSEARCH_URL: 'https://doadmin:secret@db.example.com:25060',
    })

    expect(baseUrl).toBe('https://db.example.com:25060')
    // Credentials must move to the header, never stay in the URL.
    expect(baseUrl).not.toContain('secret')
    expect(decode(auth)).toBe('doadmin:secret')
  })

  it('strips stray quotes from a pasted URL', () => {
    // A quoted .env value otherwise lands a quote in the port and fails with a
    // confusing "port number was not a decimal" error.
    const { baseUrl } = resolveConnection({
      PROD_OPENSEARCH_URL: '"https://u:p@db.example.com:25060"',
    })

    expect(baseUrl).toBe('https://db.example.com:25060')
  })

  it('url-decodes percent-encoded credentials', () => {
    const { auth } = resolveConnection({
      PROD_OPENSEARCH_URL: 'https://user:p%40ss%3Aword@db.example.com:25060',
    })

    expect(decode(auth)).toBe('user:p@ss:word')
  })

  it('falls back to OPENSEARCH_URL', () => {
    const { baseUrl } = resolveConnection({
      OPENSEARCH_URL: 'https://u:p@fallback.example.com:25060',
    })

    expect(baseUrl).toBe('https://fallback.example.com:25060')
  })

  it('prefers PROD_OPENSEARCH_URL over OPENSEARCH_URL', () => {
    const { baseUrl } = resolveConnection({
      PROD_OPENSEARCH_URL: 'https://u:p@prod.example.com:25060',
      OPENSEARCH_URL: 'https://u:p@other.example.com:25060',
    })

    expect(baseUrl).toBe('https://prod.example.com:25060')
  })

  it('supports the discrete LOGS_* vars', () => {
    const { baseUrl, auth } = resolveConnection({
      LOGS_HOST: 'db.example.com',
      LOGS_USERNAME: 'doadmin',
      LOGS_PASSWORD: 'secret',
      LOGS_PORT: '9200',
    })

    expect(baseUrl).toBe('https://db.example.com:9200')
    expect(decode(auth)).toBe('doadmin:secret')
  })

  it('defaults the LOGS_PORT to 25060', () => {
    const { baseUrl } = resolveConnection({
      LOGS_HOST: 'db.example.com',
      LOGS_USERNAME: 'u',
      LOGS_PASSWORD: 'p',
    })

    expect(baseUrl).toBe('https://db.example.com:25060')
  })

  it('ignores an empty URL and falls through to LOGS_*', () => {
    // Regression: an empty-but-present var must not win over working LOGS_* vars.
    const { baseUrl } = resolveConnection({
      PROD_OPENSEARCH_URL: '',
      LOGS_HOST: 'db.example.com',
      LOGS_USERNAME: 'u',
      LOGS_PASSWORD: 'p',
    })

    expect(baseUrl).toBe('https://db.example.com:25060')
  })

  it('throws rather than exiting when nothing is configured', () => {
    // Throwing keeps this testable; the CLI wrapper turns it into a clean exit.
    expect(() => resolveConnection({})).toThrow(/Missing OpenSearch connection details/)
  })

  it('throws when LOGS_* is only partially set', () => {
    expect(() => resolveConnection({ LOGS_HOST: 'db.example.com' })).toThrow(
      /Missing OpenSearch connection details/
    )
  })
})

describe('LOG_ALIAS', () => {
  it('is the alias the DO forwarder writes to', () => {
    // Regression: this was `logs-prod-kawakawa-cx` / `logs-dev-kawakawa-cx`,
    // renamed in 0165a2a. Both 404'd, so every search silently returned nothing.
    expect(LOG_ALIAS).toBe('logs-kawakawa-cx')
  })
})
