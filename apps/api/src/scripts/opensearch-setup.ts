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

/**
 * The name DigitalOcean's log forwarder writes to.
 *
 * After rollover is set up this is an *alias*, not a concrete index: it fronts
 * `logs-kawakawa-cx-000001`, `-000002`, ... The forwarder is unaffected — writes
 * to an alias with a designated write index land in the backing index.
 */
const ALIAS = 'logs-kawakawa-cx'
/** Concrete indices behind the alias. */
const INDEX_PATTERN = `${ALIAS}-*`
/** First backing index; ISM increments the suffix on each rollover. */
const FIRST_INDEX = `${ALIAS}-000001`
const TEMPLATE_NAME = 'logs-kawakawa-cx'
const PIPELINE_NAME = 'parse-log-json'
const ROLLOVER_POLICY_ID = 'logs-rollover-30d'

/**
 * Roll over to a fresh index on whichever comes first. A new index starts with
 * an empty mapping, which is what stops field-count creep from ever reaching
 * the limit again — the failure mode this whole setup exists to prevent.
 */
const ROLLOVER_MIN_AGE = '1d'
const ROLLOVER_MIN_SIZE = '10gb'
/** Total retention: indices are deleted this long after creation. */
const RETENTION = '30d'

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
 * Index template. Applies to each newly created backing index, so this is what
 * makes both rollover and "drop it and start again" safe.
 */
async function ensureTemplate(): Promise<boolean> {
  const res = await request('PUT', `/_index_template/${TEMPLATE_NAME}`, {
    index_patterns: [INDEX_PATTERN],
    priority: 100,
    template: {
      settings: {
        'index.default_pipeline': PIPELINE_NAME,
        // Tells ISM which alias to move when this index rolls over. Without it
        // the rollover action fails and the index grows forever.
        'index.plugins.index_state_management.rollover_alias': ALIAS,
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
 * ISM policy: roll the write alias onto a new index daily (or at 10gb), then
 * delete indices 30 days after creation.
 *
 * Rollover is the durable fix for the field-limit failure: each new backing
 * index starts with a fresh mapping, so field count can never creep up to the
 * ceiling and start silently rejecting log lines.
 */
async function ensureRolloverPolicy(): Promise<boolean> {
  // Updating an existing ISM policy requires optimistic-concurrency params;
  // a plain PUT 409s if the policy is already there.
  const existing = await request('GET', `/_plugins/_ism/policies/${ROLLOVER_POLICY_ID}`)
  let query = ''
  if (existing.ok) {
    const meta = existing.data as { _seq_no?: number; _primary_term?: number }
    if (meta._seq_no !== undefined && meta._primary_term !== undefined) {
      query = `?if_seq_no=${meta._seq_no}&if_primary_term=${meta._primary_term}`
    }
  }

  const res = await request('PUT', `/_plugins/_ism/policies/${ROLLOVER_POLICY_ID}${query}`, {
    policy: {
      description: `Roll over ${ALIAS} daily/10gb, delete after ${RETENTION}`,
      default_state: 'hot',
      // Auto-attaches to each new backing index. Priority must beat the older
      // logs-* delete-only policy (priority 100), or that one wins and no
      // rollover ever happens.
      ism_template: [{ index_patterns: [INDEX_PATTERN], priority: 200 }],
      states: [
        {
          name: 'hot',
          actions: [
            {
              rollover: {
                min_index_age: ROLLOVER_MIN_AGE,
                min_primary_shard_size: ROLLOVER_MIN_SIZE,
              },
            },
          ],
          transitions: [{ state_name: 'delete', conditions: { min_index_age: RETENTION } }],
        },
        { name: 'delete', actions: [{ delete: {} }], transitions: [] },
      ],
    },
  })

  if (!res.ok) {
    console.error(`  ✗ rollover policy: ${res.status}`, res.data)
    return false
  }
  console.log(
    `  ✓ ISM policy "${ROLLOVER_POLICY_ID}" (roll ${ROLLOVER_MIN_AGE}/${ROLLOVER_MIN_SIZE}, delete ${RETENTION})`
  )
  return true
}

interface AliasResponse {
  [index: string]: { aliases?: Record<string, { is_write_index?: boolean }> }
}

/**
 * Ensure `ALIAS` resolves to a write-enabled alias over a numbered index.
 *
 * Three possible starting states:
 *   - already an alias  -> nothing to do
 *   - a concrete index  -> needs migration (reported, not done automatically:
 *                          it destroys or relocates existing data)
 *   - nothing           -> bootstrap the first backing index
 */
async function ensureWriteAlias(): Promise<void> {
  const existing = await request('GET', `/_alias/${ALIAS}`)

  if (existing.ok) {
    const data = existing.data as AliasResponse
    const backing = Object.keys(data)
    const isConcreteIndex = backing.includes(ALIAS)

    if (isConcreteIndex) {
      console.log(`  ⚠ "${ALIAS}" is a concrete index, not an alias — rollover cannot run.`)
      console.log(`    Run "make logging-recreate" to rebuild it as an alias (deletes all logs).`)
      return
    }

    const hasWriteIndex = backing.some(i => data[i].aliases?.[ALIAS]?.is_write_index)
    if (!hasWriteIndex && backing.length === 1) {
      // Alias exists but no designated write index: writes would be rejected
      // as ambiguous once a second index joins.
      await request('POST', '/_aliases', {
        actions: [{ add: { index: backing[0], alias: ALIAS, is_write_index: true } }],
      })
      console.log(`  ✓ marked "${backing[0]}" as the write index for "${ALIAS}"`)
      return
    }

    console.log(`  ✓ alias "${ALIAS}" -> ${backing.join(', ')}`)
    return
  }

  // No alias. Is there a concrete index squatting on the name?
  const asIndex = await request('HEAD', `/${ALIAS}`)
  if (asIndex.ok) {
    console.log(`  ⚠ "${ALIAS}" is a concrete index, not an alias — rollover cannot run.`)
    console.log(`    Run "make logging-recreate" to rebuild it as an alias (deletes all logs).`)
    return
  }

  const created = await request('PUT', `/${FIRST_INDEX}`, {
    aliases: { [ALIAS]: { is_write_index: true } },
  })
  if (!created.ok) {
    console.error(`  ✗ bootstrap ${FIRST_INDEX}: ${created.status}`, created.data)
    return
  }
  console.log(`  ✓ bootstrapped "${FIRST_INDEX}" with write alias "${ALIAS}"`)
}

/**
 * Apply the field limit to any existing backing indices. Templates only apply
 * at creation time, so indices that already exist need this explicitly.
 */
async function ensureLiveIndexSettings(): Promise<void> {
  const res = await request('PUT', `/${ALIAS}/_settings`, {
    'index.mapping.total_fields.limit': TOTAL_FIELDS_LIMIT,
  })

  if (!res.ok) {
    if (res.status === 404) {
      console.log(`  – no existing index for "${ALIAS}" (template applies on creation)`)
      return
    }
    console.error(`  ✗ live index settings: ${res.status}`, res.data)
    return
  }
  console.log(`  ✓ field limit ${TOTAL_FIELDS_LIMIT} applied to existing "${ALIAS}" indices`)
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
  console.log(`OpenSearch logging status — ${ALIAS}\n`)

  const tpl = await request('GET', `/_index_template/${TEMPLATE_NAME}`)
  console.log(`  template      : ${tpl.ok ? 'present' : 'MISSING'}`)

  const pipe = await request('GET', `/_ingest/pipeline/${PIPELINE_NAME}`)
  console.log(`  pipeline      : ${pipe.ok ? 'present' : 'MISSING'}`)

  const policy = await request('GET', `/_plugins/_ism/policies/${ROLLOVER_POLICY_ID}`)
  console.log(
    `  rollover      : ${policy.ok ? `${ROLLOVER_MIN_AGE}/${ROLLOVER_MIN_SIZE}, delete ${RETENTION}` : 'MISSING'}`
  )

  // `GET /_alias/<name>` 404s when the name is a concrete index rather than an
  // alias, so fall back to resolving it as an index before declaring it absent.
  const aliasRes = await request('GET', `/_alias/${ALIAS}`)
  let aliasData: AliasResponse = aliasRes.ok ? (aliasRes.data as AliasResponse) : {}

  if (!aliasRes.ok) {
    const asIndex = await request('GET', `/${ALIAS}/_alias`)
    if (!asIndex.ok) {
      console.log(`\n  ⚠ "${ALIAS}" does not exist yet`)
      return
    }
    aliasData = asIndex.data as AliasResponse
  }

  const indices = Object.keys(aliasData).sort()

  if (indices.includes(ALIAS)) {
    console.log(`\n  ⚠ "${ALIAS}" is a CONCRETE INDEX, not an alias — rollover cannot run.`)
    console.log(`    Run "make logging-recreate" to rebuild it as an alias (deletes all logs).`)
  }

  const mapping = await request('GET', `/${ALIAS}/_mapping`)
  const settings = await request('GET', `/${ALIAS}/_settings`)
  const mapData = mapping.ok ? (mapping.data as MappingResponse) : {}
  const setData = settings.ok
    ? (settings.data as Record<
        string,
        { settings?: { index?: { mapping?: { total_fields?: { limit?: string } } } } }
      >)
    : {}

  console.log(`\n  backing indices (${indices.length}):`)
  for (const index of indices) {
    const used = countFields(mapData[index]?.mappings?.properties)
    const limit = Number(
      setData[index]?.settings?.index?.mapping?.total_fields?.limit ?? TOTAL_FIELDS_LIMIT
    )
    const isWrite = aliasData[index]?.aliases?.[ALIAS]?.is_write_index ? ' (write)' : ''
    const count = await request('GET', `/${index}/_count`)
    const docs = count.ok ? (count.data as { count: number }).count.toLocaleString() : '?'
    const warn = used > limit * 0.8 ? '  ⚠ near field limit' : ''
    console.log(`    ${index}${isWrite}  fields ${used}/${limit}  docs ${docs}${warn}`)
  }
}

/**
 * Drop and recreate the index. Destructive: every existing log document is
 * discarded. Only worth doing to reset a bloated mapping.
 */
async function recreate(): Promise<void> {
  if (process.env.CONFIRM !== 'yes') {
    console.error('Refusing to drop the log index without confirmation.')
    console.error(`This permanently deletes all documents behind "${ALIAS}".`)
    console.error('Re-run with:  CONFIRM=yes pnpm --filter @kawakawa/api opensearch:setup recreate')
    process.exit(1)
  }

  console.log(`Recreating "${ALIAS}" — provisioning template, pipeline and policy first...\n`)
  // Order matters: template, pipeline and ISM policy must all exist before the
  // new index is created, otherwise it comes up with default settings and the
  // same unbounded mapping we are trying to escape.
  if (!(await ensurePipeline())) process.exit(1)
  if (!(await ensureTemplate())) process.exit(1)
  if (!(await ensureRolloverPolicy())) process.exit(1)

  // Remove whatever currently holds the name: either a concrete index, or the
  // alias plus all of its backing indices.
  const aliasLookup = await request('GET', `/_alias/${ALIAS}`)
  const targets = aliasLookup.ok ? Object.keys(aliasLookup.data as AliasResponse) : [ALIAS]

  for (const target of targets) {
    const del = await request('DELETE', `/${target}`)
    if (!del.ok && del.status !== 404) {
      console.error(`  ✗ failed to delete "${target}": ${del.status}`, del.data)
      process.exit(1)
    }
    if (del.ok) console.log(`  ✓ dropped "${target}"`)
  }

  const create = await request('PUT', `/${FIRST_INDEX}`, {
    aliases: { [ALIAS]: { is_write_index: true } },
  })
  if (!create.ok) {
    console.error(`  ✗ failed to create index: ${create.status}`, create.data)
    process.exit(1)
  }
  console.log(`  ✓ created "${FIRST_INDEX}" with write alias "${ALIAS}"`)

  console.log('')
  await status()
}

async function provision(): Promise<void> {
  console.log('Provisioning OpenSearch logging...\n')
  const ok = (await ensurePipeline()) && (await ensureTemplate()) && (await ensureRolloverPolicy())
  if (!ok) process.exit(1)
  await ensureWriteAlias()
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
