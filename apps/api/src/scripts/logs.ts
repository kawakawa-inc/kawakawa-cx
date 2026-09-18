/**
 * OpenSearch log search utility.
 *
 * Connection details come from the repo root `.env` (`PROD_OPENSEARCH_URL`) or
 * the discrete `LOGS_*` vars — see `opensearch-connection.ts`.
 *
 * ## Reading the document shape
 *
 * The DO forwarder wraps each app log line, so **every application field is
 * nested under `log.*`** (`log.msg`, `log.level`, ...) while the envelope
 * (`@timestamp`, `do_component_name`) sits at the top level. Queries here must
 * use the `log.` prefix; without it they match nothing at all, silently. This
 * file previously queried bare `msg` and `level` and so `--errors` and
 * `--search` always returned zero hits even when the data was there.
 *
 * Usage:
 *   pnpm --filter @kawakawa/api logs [options]
 *
 * Examples:
 *   pnpm --filter @kawakawa/api logs                      # Recent logs
 *   pnpm --filter @kawakawa/api logs --errors             # Errors only
 *   pnpm --filter @kawakawa/api logs --search "JWT"       # Search messages
 *   pnpm --filter @kawakawa/api logs --hours 4            # Last 4 hours
 *   pnpm --filter @kawakawa/api logs --component kawa-api # Filter by component
 *   pnpm --filter @kawakawa/api logs --raw                # Show full JSON entries
 */

import { LOG_ALIAS, resolveConnection } from './opensearch-connection.js'

/** Application fields worth searching. All are `text` with a `keyword` subfield. */
const SEARCH_FIELDS = ['log.msg', 'log.message', 'log.err.message', 'log.errorBody'] as const

/** Levels treated as "an error" by `--errors`. `fatal` would otherwise be missed. */
const ERROR_LEVELS = ['error', 'fatal'] as const

/** The forwarder's envelope, plus the nested application payload under `log`. */
interface LogEntry {
  '@timestamp'?: string
  do_component_name?: string
  log?: {
    msg?: string
    level?: string
    time?: string
    hostname?: string
    err?: { message?: string; stack?: string }
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface LogQueryOptions {
  errors: boolean
  hours: number
  searchTerm: string | null
  component: string | null
  limit: number
  raw: boolean
}

/**
 * Build the OpenSearch query body.
 *
 * Exported for testing: these clauses are the whole point of the script and
 * every one of them has been wrong at some stage.
 */
export function buildQuery(options: LogQueryOptions): Record<string, unknown> {
  const { errors, hours, searchTerm, component, limit } = options

  const must: Record<string, unknown>[] = [{ range: { '@timestamp': { gte: `now-${hours}h` } } }]

  if (errors) {
    // `terms` on the keyword subfield. `match` on the analysed field would also
    // match the *word* "error" inside a level-like field, and misses `fatal`.
    must.push({ terms: { 'log.level.keyword': [...ERROR_LEVELS] } })
  }

  if (searchTerm) {
    // Substring search against the *keyword* subfields rather than
    // `query_string` against the analysed text. Three reasons, all found by
    // testing against the real index:
    //   - analysed wildcards break on tokenised punctuation: `*sync-all*`
    //     matched 0 docs where the phrase matched 24;
    //   - `query_string` is a user-facing query language, so a term containing
    //     `[`, `/` or `"` raises a query_shard_exception instead of searching;
    //   - matching a partial word (`eject` inside `rejected`) needs a wildcard,
    //     which a phrase match cannot do.
    // Wildcard-on-keyword handles all three. `log.msg.keyword` has no
    // `ignore_above`, so messages are indexed in full.
    must.push({
      bool: {
        should: SEARCH_FIELDS.map(field => ({
          wildcard: {
            [`${field}.keyword`]: {
              value: `*${searchTerm.toLowerCase()}*`,
              case_insensitive: true,
            },
          },
        })),
        minimum_should_match: 1,
      },
    })
  }

  if (component) {
    // `match_phrase`, not `match`. `do_component_name` is analysed text with no
    // keyword subfield, so `match: 'kawa-api'` ORs the tokens `kawa`/`api` and
    // matches *every* component — 273,758 docs instead of 13,331, i.e. the
    // filter silently did nothing.
    must.push({ match_phrase: { do_component_name: component } })
  }

  return {
    size: limit,
    // Ask for a real total; OpenSearch otherwise caps the count at 10,000 and
    // reports it as `gte`, which is misleading when summarising a result set.
    track_total_hits: true,
    sort: [{ '@timestamp': { order: 'desc' } }],
    query: { bool: { must } },
  }
}

export function parseArgs(args: string[]): LogQueryOptions {
  // `dev`/`prod` used to select an index and are now meaningless: there is only
  // one index. Still accepted and ignored so existing invocations and
  // `make search-logs ENV=prod` keep working rather than treating "prod" as a
  // search term.
  const rest = args.filter(a => a !== 'dev' && a !== 'prod')

  const options: LogQueryOptions = {
    errors: false,
    hours: 1,
    searchTerm: null,
    component: null,
    limit: 50,
    raw: false,
  }

  for (let i = 0; i < rest.length; i++) {
    switch (rest[i]) {
      case '--errors':
      case '-e':
        options.errors = true
        break
      case '--hours':
      case '-h':
        options.hours = parseInt(rest[++i], 10) || 1
        break
      case '--search':
      case '-s':
        options.searchTerm = rest[++i] ?? null
        break
      case '--component':
      case '-c':
        options.component = rest[++i] ?? null
        break
      case '--limit':
      case '-n':
        options.limit = parseInt(rest[++i], 10) || 50
        break
      case '--raw':
      case '-r':
        options.raw = true
        break
    }
  }

  return options
}

export function formatEntry(entry: LogEntry): string {
  const log = entry.log ?? {}
  const ts = entry['@timestamp'] || log.time
  const time = ts ? new Date(ts).toLocaleTimeString() : '?'
  const comp = entry.do_component_name ?? '?'
  const level = (log.level ?? 'info').toUpperCase().padEnd(5)
  // Fall back to the raw payload so a line with no `msg` still shows something
  // useful instead of "undefined".
  const msg = log.msg ?? JSON.stringify(log)
  let line = `${time} [${comp}] ${level} ${msg}`

  // `message` carries the detail on request-level warnings ("No token
  // provided"), where `msg` is only the generic "Client error".
  const detail = typeof log.message === 'string' ? log.message : undefined
  if (detail && detail !== log.msg) line += ` — ${detail}`

  const status = log.statusCode ?? log.status
  if (typeof status === 'number') line += ` (${status})`

  const err = log.err
  if (err) {
    if (err.message) line += `\n       Error: ${err.message}`
    if (err.stack) line += `\n       ${String(err.stack).split('\n').join('\n       ')}`
  }

  return line
}

const HELP = `Usage: logs [options]

  --errors, -e         Show only error/fatal logs
  --hours N, -h N      Look back N hours (default: 1)
  --search STR, -s STR Case-insensitive substring search of log messages
  --component X, -c X  Filter by DO component (kawa-api, kawa-web, kawa-bot, kawa-sync-worker)
  --limit N, -n N      Max results (default: 50)
  --raw, -r            Show full raw JSON entries
  --help               Show this help

Logs are searched in ${LOG_ALIAS}. Only production ships logs to OpenSearch;
for local dev logs use 'make logs S=<service>'.`

async function search(
  baseUrl: string,
  auth: string,
  query: Record<string, unknown>
): Promise<{ entries: LogEntry[]; total: number }> {
  const res = await fetch(`${baseUrl}/${LOG_ALIAS}/_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(query),
  })

  if (!res.ok) {
    const text = await res.text()
    if (res.status === 404) {
      throw new Error(`index ${LOG_ALIAS} not found. Run 'make logging-setup' to provision it.`)
    }
    throw new Error(`OpenSearch error ${res.status}: ${text}`)
  }

  const data = (await res.json()) as {
    hits: { hits: Array<{ _source: LogEntry }>; total?: { value: number } }
  }
  return {
    entries: data.hits.hits.map(h => h._source),
    total: data.hits.total?.value ?? data.hits.hits.length,
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help')) {
    console.log(HELP)
    return
  }

  const options = parseArgs(args)
  const { baseUrl, auth } = resolveConnection()
  const { entries, total } = await search(baseUrl, auth, buildQuery(options))

  const filters = [
    options.errors ? 'errors only' : null,
    options.searchTerm ? `search "${options.searchTerm}"` : null,
    options.component ? `component ${options.component}` : null,
  ].filter(Boolean)
  const suffix = filters.length > 0 ? `, ${filters.join(', ')}` : ''

  if (entries.length === 0) {
    console.log(`No logs found in ${LOG_ALIAS} (last ${options.hours}h${suffix})`)
    return
  }

  const shown = total > entries.length ? `${entries.length} of ${total}` : `${entries.length}`
  console.log(`--- ${LOG_ALIAS} (last ${options.hours}h${suffix}, ${shown} entries) ---\n`)

  // Reverse so oldest is first (chronological order)
  for (const entry of entries.reverse()) {
    console.log(options.raw ? JSON.stringify(entry, null, 2) : formatEntry(entry))
  }
}

// Only run when invoked directly, so the exported helpers can be imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Failed:', err.message)
    process.exit(1)
  })
}
