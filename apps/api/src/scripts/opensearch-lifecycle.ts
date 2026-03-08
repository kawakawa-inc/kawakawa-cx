/**
 * OpenSearch ISM (Index State Management) lifecycle policy setup
 * Creates a policy to automatically delete log indices older than 30 days
 *
 * Usage:
 *   pnpm --filter @kawakawa/api opensearch:lifecycle         # Create/update policy and apply to existing indices
 *   pnpm --filter @kawakawa/api opensearch:lifecycle status   # Check policy status on all log indices
 *   pnpm --filter @kawakawa/api opensearch:lifecycle remove   # Remove policy from all log indices
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

const POLICY_ID = 'delete-after-30-days'
const INDEX_PATTERN = 'logs-*'
const RETENTION_DAYS = 30

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

async function createPolicy() {
  console.log(`Creating ISM policy "${POLICY_ID}" (delete after ${RETENTION_DAYS} days)...\n`)

  const policy = {
    policy: {
      description: `Delete log indices older than ${RETENTION_DAYS} days`,
      default_state: 'active',
      ism_template: [
        {
          index_patterns: [INDEX_PATTERN],
          priority: 100,
        },
      ],
      states: [
        {
          name: 'active',
          actions: [],
          transitions: [
            {
              state_name: 'delete',
              conditions: {
                min_index_age: `${RETENTION_DAYS}d`,
              },
            },
          ],
        },
        {
          name: 'delete',
          actions: [{ delete: {} }],
          transitions: [],
        },
      ],
    },
  }

  const res = await request('PUT', `/_plugins/_ism/policies/${POLICY_ID}`, policy)

  if (res.ok) {
    console.log(`Policy "${POLICY_ID}" created successfully`)
  } else {
    console.error(`Failed to create policy: ${res.status}`, res.data)
    return false
  }

  return true
}

async function applyToExisting() {
  console.log(`\nApplying policy to existing indices matching "${INDEX_PATTERN}"...\n`)

  const res = await request('POST', `/_plugins/_ism/add/${INDEX_PATTERN}`, {
    policy_id: POLICY_ID,
  })

  if (res.ok) {
    const data = res.data as { updated_indices?: number; failures?: boolean }
    console.log(`Applied to ${data.updated_indices ?? 0} indices`)
    if (data.failures) {
      console.warn('Some indices had failures (may already have the policy attached)')
    }
  } else {
    console.error(`Failed to apply policy: ${res.status}`, res.data)
  }
}

async function checkStatus() {
  console.log(`Checking ISM status for indices matching "${INDEX_PATTERN}"...\n`)

  const res = await request('GET', `/_plugins/_ism/explain/${INDEX_PATTERN}`)

  if (!res.ok) {
    console.error(`Failed to get status: ${res.status}`, res.data)
    return
  }

  const data = res.data as Record<
    string,
    {
      'index.plugins.index_state_management.policy_id'?: string
      index?: { index_age?: string }
      state?: { name?: string }
    }
  >

  const indices = Object.entries(data).filter(
    ([key]) => key !== 'total_managed_indices' && !key.startsWith('.')
  )

  if (indices.length === 0) {
    console.log('No matching indices found')
    return
  }

  console.log(`${'Index'.padEnd(35)} ${'Policy'.padEnd(25)} ${'State'.padEnd(10)} Age`)
  console.log('-'.repeat(85))

  for (const [name, info] of indices) {
    const policy = info['index.plugins.index_state_management.policy_id'] ?? 'none'
    const state = info.state?.name ?? '-'
    const age = info.index?.index_age ?? '-'
    console.log(`${name.padEnd(35)} ${policy.padEnd(25)} ${state.padEnd(10)} ${age}`)
  }
}

async function removePolicy() {
  console.log(`Removing policy from indices matching "${INDEX_PATTERN}"...\n`)

  const res = await request('POST', `/_plugins/_ism/remove/${INDEX_PATTERN}`)

  if (res.ok) {
    const data = res.data as { updated_indices?: number }
    console.log(`Removed from ${data.updated_indices ?? 0} indices`)
  } else {
    console.error(`Failed to remove policy: ${res.status}`, res.data)
  }
}

async function main() {
  const command = process.argv[2]

  switch (command) {
    case 'status':
      await checkStatus()
      break
    case 'remove':
      await removePolicy()
      break
    default: {
      const created = await createPolicy()
      if (created) {
        await applyToExisting()
        console.log('')
        await checkStatus()
      }
      break
    }
  }
}

main().catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
