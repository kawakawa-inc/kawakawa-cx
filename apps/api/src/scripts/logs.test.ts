import { describe, it, expect } from 'vitest'
import { buildQuery, parseArgs, formatEntry, type LogQueryOptions } from './logs.js'

function options(overrides: Partial<LogQueryOptions> = {}): LogQueryOptions {
  return {
    errors: false,
    hours: 1,
    searchTerm: null,
    component: null,
    limit: 50,
    raw: false,
    ...overrides,
  }
}

/** The `must` clauses of a built query, for shape assertions. */
function clauses(opts: Partial<LogQueryOptions> = {}): Record<string, unknown>[] {
  const query = buildQuery(options(opts)) as {
    query: { bool: { must: Record<string, unknown>[] } }
  }
  return query.query.bool.must
}

describe('buildQuery', () => {
  it('always constrains on the @timestamp envelope field', () => {
    // `@timestamp` is added by the DO forwarder at the top level; the app's own
    // `time` field is nested under `log` and is not the one to range on.
    expect(clauses({ hours: 6 })).toContainEqual({ range: { '@timestamp': { gte: 'now-6h' } } })
  })

  it('requests a real total instead of the default 10k cap', () => {
    expect(buildQuery(options())).toMatchObject({ track_total_hits: true })
  })

  it('sorts newest first and honours the limit', () => {
    expect(buildQuery(options({ limit: 5 }))).toMatchObject({
      size: 5,
      sort: [{ '@timestamp': { order: 'desc' } }],
    })
  })

  it('adds no filter clauses beyond the time range by default', () => {
    expect(clauses()).toHaveLength(1)
  })

  describe('--errors', () => {
    it('filters on the nested log.level keyword, including fatal', () => {
      // Regression: this queried bare `level`, but every application field is
      // nested under `log.*`, so it matched 0 docs where 1609 existed.
      expect(clauses({ errors: true })).toContainEqual({
        terms: { 'log.level.keyword': ['error', 'fatal'] },
      })
    })

    it('does not query a top-level level field', () => {
      expect(JSON.stringify(clauses({ errors: true }))).not.toContain('"level"')
    })
  })

  describe('--search', () => {
    it('searches the nested log.* message fields, not bare msg', () => {
      // Regression: `default_field: 'msg'` matched nothing; the field is `log.msg`.
      const json = JSON.stringify(clauses({ searchTerm: 'jwt' }))

      expect(json).toContain('log.msg.keyword')
      expect(json).toContain('log.err.message.keyword')
      expect(json).not.toContain('"msg"')
    })

    it('wraps the term in wildcards and matches case-insensitively', () => {
      const [, search] = clauses({ searchTerm: 'JWT' })

      expect(search).toMatchObject({
        bool: {
          minimum_should_match: 1,
          should: expect.arrayContaining([
            {
              wildcard: {
                'log.msg.keyword': { value: '*jwt*', case_insensitive: true },
              },
            },
          ]),
        },
      })
    })

    it('matches any one of the searched fields', () => {
      const [, search] = clauses({ searchTerm: 'boom' }) as [
        unknown,
        { bool: { should: unknown[]; minimum_should_match: number } },
      ]

      expect(search.bool.should).toHaveLength(4)
      expect(search.bool.minimum_should_match).toBe(1)
    })

    it('searches keyword subfields so punctuation survives', () => {
      // A `query_string` wildcard over analysed text matched 0 docs for
      // `*sync-all*` because the analyser splits on the dash; the keyword
      // subfield keeps the value intact.
      const json = JSON.stringify(clauses({ searchTerm: '/fio/sync-all' }))

      expect(json).toContain('*/fio/sync-all*')
    })

    it('passes query-syntax characters through as literals', () => {
      // `query_string` would raise a query_shard_exception on an unbalanced
      // bracket instead of searching for it.
      const [, search] = clauses({ searchTerm: '[boom]' }) as [
        unknown,
        { bool: { should: Array<{ wildcard: Record<string, { value: string }> }> } },
      ]

      expect(search.bool.should[0].wildcard['log.msg.keyword'].value).toBe('*[boom]*')
    })

    it('supports partial-word matches', () => {
      const [, search] = clauses({ searchTerm: 'eject' }) as [
        unknown,
        { bool: { should: Array<{ wildcard: Record<string, { value: string }> }> } },
      ]

      // `*eject*` finds "rejected" — a phrase match could not.
      expect(search.bool.should[0].wildcard['log.msg.keyword'].value).toBe('*eject*')
    })
  })

  describe('--component', () => {
    it('uses match_phrase so component names are not tokenised', () => {
      // Regression: `match` on this analysed field ORs `kawa`/`api` and matched
      // every component (273,758 docs vs 13,331) — the filter did nothing.
      expect(clauses({ component: 'kawa-api' })).toContainEqual({
        match_phrase: { do_component_name: 'kawa-api' },
      })
    })

    it('does not use a plain match for the component', () => {
      expect(JSON.stringify(clauses({ component: 'kawa-api' }))).not.toContain(
        '{"match":{"do_component_name"'
      )
    })
  })

  it('combines every filter as a conjunction', () => {
    const must = clauses({ errors: true, searchTerm: 'jwt', component: 'kawa-api', hours: 24 })

    expect(must).toHaveLength(4)
  })
})

describe('parseArgs', () => {
  it('defaults to the last hour, 50 entries, no filters', () => {
    expect(parseArgs([])).toEqual(options())
  })

  it.each([
    ['--errors', 'errors', true],
    ['-e', 'errors', true],
    ['--raw', 'raw', true],
    ['-r', 'raw', true],
  ])('parses the %s flag', (flag, key, expected) => {
    expect(parseArgs([flag])[key as keyof LogQueryOptions]).toBe(expected)
  })

  it.each([
    [['--hours', '4'], 'hours', 4],
    [['-h', '12'], 'hours', 12],
    [['--limit', '5'], 'limit', 5],
    [['-n', '200'], 'limit', 200],
    [['--search', 'jwt'], 'searchTerm', 'jwt'],
    [['-s', 'jwt'], 'searchTerm', 'jwt'],
    [['--component', 'kawa-api'], 'component', 'kawa-api'],
    [['-c', 'kawa-bot'], 'component', 'kawa-bot'],
  ])('parses %s', (args, key, expected) => {
    expect(parseArgs(args as string[])[key as keyof LogQueryOptions]).toBe(expected)
  })

  it('accepts a multi-word search term as a single value', () => {
    expect(parseArgs(['--search', 'JWT rejected']).searchTerm).toBe('JWT rejected')
  })

  it.each(['dev', 'prod'])('ignores the vestigial %s argument', env => {
    // There is only one index now. Accepting these keeps `make search-logs
    // ENV=prod` working instead of treating "prod" as a search term.
    expect(parseArgs([env])).toEqual(options())
  })

  it('still applies flags that follow a vestigial env argument', () => {
    expect(parseArgs(['prod', '--search', 'jwt', '--hours', '2'])).toMatchObject({
      searchTerm: 'jwt',
      hours: 2,
    })
  })

  it('falls back to defaults for non-numeric values', () => {
    expect(parseArgs(['--hours', 'abc'])).toMatchObject({ hours: 1 })
    expect(parseArgs(['--limit', 'abc'])).toMatchObject({ limit: 50 })
  })

  it('does not crash on a flag with a missing value', () => {
    expect(parseArgs(['--search']).searchTerm).toBeNull()
  })
})

describe('formatEntry', () => {
  it('reads the message and level from the nested log object', () => {
    const line = formatEntry({
      '@timestamp': '2026-08-16T15:27:29.223Z',
      do_component_name: 'kawa-api',
      log: { msg: 'JWT rejected', level: 'warn' },
    })

    expect(line).toContain('[kawa-api]')
    expect(line).toContain('WARN')
    expect(line).toContain('JWT rejected')
  })

  it('appends the detail message when it adds information', () => {
    // Request warnings put the useful part in `message`; `msg` is only
    // "Client error", which on its own tells you nothing.
    const line = formatEntry({
      '@timestamp': '2026-08-16T15:27:29.223Z',
      do_component_name: 'kawa-api',
      log: { msg: 'Client error', message: 'No token provided', statusCode: 401 },
    })

    expect(line).toContain('Client error')
    expect(line).toContain('No token provided')
    expect(line).toContain('(401)')
  })

  it('does not repeat the detail when it duplicates the message', () => {
    const line = formatEntry({ log: { msg: 'Same', message: 'Same' } })

    expect(line.match(/Same/g)).toHaveLength(1)
  })

  it('includes error message and stack when present', () => {
    const line = formatEntry({
      log: {
        msg: 'Failed to sync',
        level: 'error',
        err: { message: 'HTTP 401', stack: 'FioApiError: boom\n    at thing' },
      },
    })

    expect(line).toContain('Error: HTTP 401')
    expect(line).toContain('FioApiError: boom')
  })

  it('defaults the level to info', () => {
    expect(formatEntry({ log: { msg: 'hi' } })).toContain('INFO')
  })

  it('falls back to the raw payload when there is no msg', () => {
    expect(formatEntry({ log: { somethingElse: 'value' } })).toContain('somethingElse')
  })

  it('survives an entry with no log payload at all', () => {
    expect(() => formatEntry({ '@timestamp': '2026-08-16T15:27:29.223Z' })).not.toThrow()
  })

  it('shows an unknown component and time rather than undefined', () => {
    const line = formatEntry({ log: { msg: 'hi' } })

    expect(line).toContain('[?]')
    expect(line).not.toContain('undefined')
  })

  it('falls back to the nested time when the envelope timestamp is absent', () => {
    const withEnvelope = formatEntry({
      '@timestamp': '2026-08-16T15:27:29.223Z',
      log: { msg: 'hi' },
    })
    const withNestedOnly = formatEntry({ log: { msg: 'hi', time: '2026-08-16T15:27:29.223Z' } })

    // Same instant, so the rendered time must match; only the component differs.
    expect(withNestedOnly.split(' [')[0]).toBe(withEnvelope.split(' [')[0])
  })

  it('renders an unknown time when no timestamp is available', () => {
    expect(formatEntry({ log: { msg: 'hi' } }).startsWith('?')).toBe(true)
  })
})
