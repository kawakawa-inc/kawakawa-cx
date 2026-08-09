/**
 * OpenSearch logging setup — idempotent provisioning of everything the log
 * pipeline needs. Safe to run repeatedly, and sufficient to rebuild logging
 * from nothing after dropping the index.
 *
 * Why this exists: the log index hit OpenSearch's default 1000-field mapping
 * limit. Past that limit OpenSearch rejects any document containing a new
 * field, so whole log lines were silently dropped at ingest (this is what hid
 * the JWT auth diagnostics). Two causes:
 *
 *   1. Request/response bodies were logged as objects, so every key of every
 *      domain object got dynamically mapped. Fixed in the app by logging bodies
 *      as strings (see utils/logBody.ts).
 *   2. The index template declared `log` as a plain dynamic object with no
 *      field cap and no rollover, so the mapping only ever grew. Fixed here.
 *
 * Usage:
 *   pnpm --filter @kawakawa/api opensearch:setup            # provision everything
 *   pnpm --filter @kawakawa/api opensearch:setup status     # show current state
 *   pnpm --filter @kawakawa/api opensearch:setup recreate   # DESTRUCTIVE: drop + rebuild index
 */

/**
 * Connection details come from either:
 *   PROD_OPENSEARCH_URL / OPENSEARCH_URL — a full https://user:pass@host:port URL
 *   or the discrete LOGS_HOST / LOGS_USERNAME / LOGS_PASSWORD / LOGS_PORT vars
 *     used by opensearch-lifecycle.ts.
 */
function resolveConnection(): { baseUrl: string; auth: string } {
  // Values pasted into .env are often quoted; a stray quote lands in the port
  // and produces a confusing "port number was not a decimal" failure.
  const rawUrl = (process.env.PROD_OPENSEARCH_URL ?? process.env.OPENSEARCH_URL ?? '').replace(
    /['"]/g,
    ''
  )

  if (rawUrl) {
    const url = new URL(rawUrl)
    const username = decodeURIComponent(url.username)
    const password = decodeURIComponent(url.password)
    url.username = ''
    url.password = ''
    return {
      baseUrl: url.origin,
      auth: Buffer.from(`${username}:${password}`).toString('base64'),
    }
  }

  const host = process.env.LOGS_HOST
  const username = process.env.LOGS_USERNAME
  const password = process.env.LOGS_PASSWORD
  const port = process.env.LOGS_PORT ?? '25060'

  if (!host || !username || !password) {
    console.error(
      'Missing connection details. Set PROD_OPENSEARCH_URL (or OPENSEARCH_URL),\n' +
        'or LOGS_HOST / LOGS_USERNAME / LOGS_PASSWORD in .env'
    )
    process.exit(1)
  }

  return {
    baseUrl: `https://${host}:${port}`,
    auth: Buffer.from(`${username}:${password}`).toString('base64'),
  }
}

const { baseUrl: BASE_URL, auth: AUTH } = resolveConnection()

/** The index DigitalOcean's log forwarder writes to. */
const INDEX = 'logs-kawakawa-cx'
const TEMPLATE_NAME = 'logs-kawakawa-cx'
const PIPELINE_NAME = 'parse-log-json'

/**
 * Field-count ceiling. The default is 1000; we were pinned at exactly that.
 * With bodies logged as strings the real usage is a few hundred, so this is
 * headroom rather than a target.
 */
const TOTAL_FIELDS_LIMIT = 3000

async function request(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${AUTH}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  return { ok: res.ok, status: res.status, data }
}

/**
 * The DO log forwarder ships the app's stdout line as a JSON *string* in `log`;
 * this pipeline parses it into an object. Recreating the index without this
 * leaves every log line as an unsearchable blob.
 */
async function ensurePipeline(): Promise<boolean> {
  const res = await request('PUT', `/_ingest/pipeline/${PIPELINE_NAME}`, {
    description: 'Parse stringified JSON in log field',
    processors: [
      {
        json: {
          field: 'log',
          target_field: 'log',
          on_failure: [
            { set: { field: '_error_message', value: '{{ _ingest.on_failure_message }}' } },
          ],
        },
      },
    ],
  })

  if (!res.ok) {
    console.error(`  ✗ pipeline ${PIPELINE_NAME}: ${res.status}`, res.data)
    return false
  }
  console.log(`  ✓ ingest pipeline "${PIPELINE_NAME}"`)
  return true
}

/**
 * Index template. Applies to a freshly created index, so this is what makes
 * "drop the index and let it be recreated" safe.
 */
async function ensureTemplate(): Promise<boolean> {
  const res = await request('PUT', `/_index_template/${TEMPLATE_NAME}`, {
    index_patterns: [INDEX],
    priority: 100,
    template: {
      settings: {
        'index.default_pipeline': PIPELINE_NAME,
        // The guard rail that was missing. Without it the mapping silently
        // grew until new fields — and the log lines carrying them — were
        // rejected at ingest.
        'index.mapping.total_fields.limit': TOTAL_FIELDS_LIMIT,
        'index.number_of_shards': 1,
        'index.number_of_replicas': 0,
      },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          do_app_name: { type: 'text' },
          do_component_name: { type: 'text' },
          log: {
            type: 'object',
            properties: {
              // Bodies are logged as JSON strings, not objects. Pinning them to
              // `text` stops OpenSearch mapping a field per domain attribute —
              // log.resBody.* alone had reached 441 fields.
              resBody: { type: 'text' },
              reqBody: { type: 'text' },
              // Auth diagnostics: keyword so they can be aggregated on.
              authFailure: { type: 'keyword' },
              service: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              msg: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              level: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              hostname: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              path: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              method: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              statusCode: { type: 'long' },
              userId: { type: 'long' },
            },
          },
        },
      },
    },
  })

  if (!res.ok) {
    console.error(`  ✗ template ${TEMPLATE_NAME}: ${res.status}`, res.data)
    return false
  }
  console.log(`  ✓ index template "${TEMPLATE_NAME}" (field limit ${TOTAL_FIELDS_LIMIT})`)
  return true
}

/**
 * Apply the field limit to the index that already exists. Templates only apply
 * at creation time, so an existing index needs this explicitly.
 */
async function ensureLiveIndexSettings(): Promise<void> {
  const exists = await request('HEAD', `/${INDEX}`)
  if (!exists.ok) {
    console.log(`  – index "${INDEX}" does not exist yet (template will apply on creation)`)
    return
  }

  const res = await request('PUT', `/${INDEX}/_settings`, {
    'index.mapping.total_fields.limit': TOTAL_FIELDS_LIMIT,
  })

  if (!res.ok) {
    console.error(`  ✗ live index settings: ${res.status}`, res.data)
    return
  }
  console.log(`  ✓ live index "${INDEX}" field limit raised to ${TOTAL_FIELDS_LIMIT}`)
}

interface MappingResponse {
  [index: string]: { mappings?: { properties?: Record<string, unknown> } }
}

/** Approximate the mapped field count the way OpenSearch counts it. */
function countFields(node: Record<string, unknown> | undefined): number {
  if (!node) return 0
  let total = 0
  for (const value of Object.values(node)) {
    const field = value as {
      properties?: Record<string, unknown>
      fields?: Record<string, unknown>
    }
    total += 1
    if (field.properties) total += countFields(field.properties)
    if (field.fields) total += Object.keys(field.fields).length
  }
  return total
}

async function status(): Promise<void> {
  console.log(`OpenSearch logging status — ${INDEX}\n`)

  const mapping = await request('GET', `/${INDEX}/_mapping`)
  if (!mapping.ok) {
    console.log(`  index "${INDEX}" not found (status ${mapping.status})`)
  } else {
    const data = mapping.data as MappingResponse
    const used = countFields(data[INDEX]?.mappings?.properties)
    console.log(`  mapped fields : ${used} / ${TOTAL_FIELDS_LIMIT}`)
    if (used > TOTAL_FIELDS_LIMIT * 0.8) {
      console.warn('  ⚠ approaching the field limit — new log fields will start being rejected')
    }
  }

  const settings = await request('GET', `/${INDEX}/_settings`)
  if (settings.ok) {
    const s = settings.data as Record<
      string,
      { settings?: { index?: { mapping?: { total_fields?: { limit?: string } } } } }
    >
    const limit = s[INDEX]?.settings?.index?.mapping?.total_fields?.limit ?? '1000 (default)'
    console.log(`  field limit   : ${limit}`)
  }

  const tpl = await request('GET', `/_index_template/${TEMPLATE_NAME}`)
  console.log(`  template      : ${tpl.ok ? 'present' : 'MISSING'}`)

  const pipe = await request('GET', `/_ingest/pipeline/${PIPELINE_NAME}`)
  console.log(`  pipeline      : ${pipe.ok ? 'present' : 'MISSING'}`)

  const counts = await request('GET', `/${INDEX}/_count`)
  if (counts.ok) {
    console.log(`  documents     : ${(counts.data as { count: number }).count.toLocaleString()}`)
  }
}

/**
 * Drop and recreate the index. Destructive: every existing log document is
 * discarded. Only worth doing to reset a bloated mapping.
 */
async function recreate(): Promise<void> {
  if (process.env.CONFIRM !== 'yes') {
    console.error('Refusing to drop the log index without confirmation.')
    console.error(`This permanently deletes all documents in "${INDEX}".`)
    console.error('Re-run with:  CONFIRM=yes pnpm --filter @kawakawa/api opensearch:setup recreate')
    process.exit(1)
  }

  console.log(`Recreating "${INDEX}" — provisioning template and pipeline first...\n`)
  // Order matters: the template must exist before the index is recreated,
  // otherwise the new index comes up with default settings and the same
  // unbounded mapping we are trying to escape.
  if (!(await ensurePipeline())) process.exit(1)
  if (!(await ensureTemplate())) process.exit(1)

  const del = await request('DELETE', `/${INDEX}`)
  if (!del.ok && del.status !== 404) {
    console.error(`  ✗ failed to delete index: ${del.status}`, del.data)
    process.exit(1)
  }
  console.log(`  ✓ dropped index "${INDEX}"`)

  const create = await request('PUT', `/${INDEX}`)
  if (!create.ok) {
    console.error(`  ✗ failed to create index: ${create.status}`, create.data)
    process.exit(1)
  }
  console.log(`  ✓ recreated index "${INDEX}" from template`)

  await applyLifecyclePolicy()
  console.log('')
  await status()
}

/** Re-attach the retention policy; a recreated index is unmanaged otherwise. */
async function applyLifecyclePolicy(): Promise<void> {
  const res = await request('POST', `/_plugins/_ism/add/${INDEX}`, {
    policy_id: 'delete-after-30-days',
  })
  if (res.ok) {
    console.log('  ✓ retention policy "delete-after-30-days" attached')
  } else {
    // Non-fatal: the ism_template usually attaches it automatically.
    console.warn(`  ⚠ could not attach retention policy (${res.status}) — check with :lifecycle`)
  }
}

async function provision(): Promise<void> {
  console.log('Provisioning OpenSearch logging...\n')
  const ok = (await ensurePipeline()) && (await ensureTemplate())
  if (!ok) process.exit(1)
  await ensureLiveIndexSettings()
  console.log('')
  await status()
}

async function main() {
  switch (process.argv[2]) {
    case 'status':
      await status()
      break
    case 'recreate':
      await recreate()
      break
    default:
      await provision()
      break
  }
}

main().catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
