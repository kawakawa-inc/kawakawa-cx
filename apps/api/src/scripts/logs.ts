/**
 * OpenSearch log search utility
 * Reads credentials from .env (LOGS_USERNAME, LOGS_PASSWORD, LOGS_HOST, LOGS_PORT)
 *
 * Usage:
 *   pnpm --filter @kawakawa/api logs [env] [options]
 *
 * Examples:
 *   pnpm --filter @kawakawa/api logs dev                  # Recent dev logs
 *   pnpm --filter @kawakawa/api logs prod --errors        # Prod errors only
 *   pnpm --filter @kawakawa/api logs dev --search "JWT"   # Search for keyword
 *   pnpm --filter @kawakawa/api logs prod --hours 4       # Last 4 hours
 *   pnpm --filter @kawakawa/api logs dev --component kawa-api  # Filter by component
 */

const LOGS_USERNAME = process.env.LOGS_USERNAME
const LOGS_PASSWORD = process.env.LOGS_PASSWORD
const LOGS_HOST = process.env.LOGS_HOST
const LOGS_PORT = process.env.LOGS_PORT ?? '25060'

if (!LOGS_USERNAME || !LOGS_PASSWORD || !LOGS_HOST) {
  console.error('Missing LOGS_USERNAME, LOGS_PASSWORD, or LOGS_HOST in .env')
  process.exit(1)
}

const BASE_URL = `https://${LOGS_HOST}:${LOGS_PORT}`
const AUTH = Buffer.from(`${LOGS_USERNAME}:${LOGS_PASSWORD}`).toString('base64')

interface LogEntry {
  msg?: string
  level?: string
  time?: string
  '@timestamp'?: string
  do_component_name?: string
  hostname?: string
  [key: string]: unknown
}

async function search(index: string, query: Record<string, unknown>): Promise<LogEntry[]> {
  const res = await fetch(`${BASE_URL}/${index}/_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${AUTH}`,
    },
    body: JSON.stringify(query),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenSearch error ${res.status}: ${text}`)
  }

  const data = (await res.json()) as {
    hits: { hits: Array<{ _source: LogEntry }> }
  }
  return data.hits.hits.map((h) => h._source)
}

function parseArgs(args: string[]) {
  const env = args[0] === 'dev' || args[0] === 'prod' ? args[0] : 'dev'
  const startIdx = env === args[0] ? 1 : 0
  const rest = args.slice(startIdx)

  let errors = false
  let hours = 1
  let searchTerm: string | null = null
  let component: string | null = null
  let limit = 50

  for (let i = 0; i < rest.length; i++) {
    switch (rest[i]) {
      case '--errors':
      case '-e':
        errors = true
        break
      case '--hours':
      case '-h':
        hours = parseInt(rest[++i], 10) || 1
        break
      case '--search':
      case '-s':
        searchTerm = rest[++i]
        break
      case '--component':
      case '-c':
        component = rest[++i]
        break
      case '--limit':
      case '-n':
        limit = parseInt(rest[++i], 10) || 50
        break
    }
  }

  return { env, errors, hours, searchTerm, component, limit }
}

function formatEntry(entry: LogEntry): string {
  const ts = entry['@timestamp'] || entry.time || '?'
  const time = ts !== '?' ? new Date(ts).toLocaleTimeString() : '?'
  const comp = entry.do_component_name ?? '?'
  const level = (entry.level ?? 'info').toUpperCase().padEnd(5)
  const msg = entry.msg ?? JSON.stringify(entry)
  return `${time} [${comp}] ${level} ${msg}`
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help')) {
    console.log(`Usage: logs [dev|prod] [options]
  --errors, -e         Show only error-level logs
  --hours N, -h N      Look back N hours (default: 1)
  --search STR, -s STR Search for keyword in messages
  --component X, -c X  Filter by DO component name
  --limit N, -n N      Max results (default: 50)
  --help               Show this help`)
    return
  }

  const { env, errors, hours, searchTerm, component, limit } = parseArgs(args)
  const index = env === 'prod' ? 'logs-prod-kawakawa-cx' : 'logs-dev-kawakawa-cx'

  const must: Record<string, unknown>[] = [
    { range: { '@timestamp': { gte: `now-${hours}h` } } },
  ]

  if (errors) {
    must.push({ match: { level: 'error' } })
  }
  if (searchTerm) {
    must.push({ query_string: { query: `*${searchTerm}*`, default_field: 'msg' } })
  }
  if (component) {
    must.push({ match: { do_component_name: component } })
  }

  const entries = await search(index, {
    size: limit,
    sort: [{ '@timestamp': { order: 'desc' } }],
    query: { bool: { must } },
  })

  if (entries.length === 0) {
    console.log(`No logs found in ${index} (last ${hours}h)`)
    return
  }

  console.log(`--- ${index} (last ${hours}h, ${entries.length} entries) ---\n`)
  // Reverse so oldest is first (chronological order)
  for (const entry of entries.reverse()) {
    console.log(formatEntry(entry))
  }
}

main().catch((err) => {
  console.error('Failed:', err.message)
  process.exit(1)
})
