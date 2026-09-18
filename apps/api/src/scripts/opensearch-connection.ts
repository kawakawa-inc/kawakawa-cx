/**
 * Shared OpenSearch connection details for the logging scripts.
 *
 * Extracted so `logs.ts`, `opensearch-setup.ts` and `opensearch-lifecycle.ts`
 * cannot drift apart. They previously each resolved credentials themselves and
 * disagreed: only `opensearch-setup.ts` understood `PROD_OPENSEARCH_URL`, so
 * `make search-logs` and `make logging-lifecycle` hard-exited with
 * "Missing LOGS_USERNAME..." on a machine that was perfectly well configured.
 */

/**
 * The name DigitalOcean's log forwarder writes to, and the only index that
 * exists.
 *
 * This is a *write alias* fronting `logs-kawakawa-cx-000001`, `-000002`, ...;
 * searching it transparently spans every backing index.
 *
 * There is deliberately no per-environment index. Only the production app
 * forwards logs, and dev logs go to local files under `.dev/logs/` (`make logs`).
 * `logs.ts` used to select between `logs-prod-kawakawa-cx` and
 * `logs-dev-kawakawa-cx`; both were renamed away in commit 0165a2a and every
 * search had been returning HTTP 404 since.
 */
export const LOG_ALIAS = 'logs-kawakawa-cx'

export interface OpenSearchConnection {
  baseUrl: string
  auth: string
}

/**
 * Resolve connection details from the environment.
 *
 * Accepts either a full `https://user:pass@host:port` URL
 * (`PROD_OPENSEARCH_URL` / `OPENSEARCH_URL`, which is what DigitalOcean hands
 * you) or the discrete `LOGS_HOST` / `LOGS_USERNAME` / `LOGS_PASSWORD` /
 * `LOGS_PORT` vars.
 *
 * Throws rather than calling `process.exit`, so this stays testable and callers
 * decide how to report failure.
 */
export function resolveConnection(env: NodeJS.ProcessEnv = process.env): OpenSearchConnection {
  // Values pasted into .env are often quoted; a stray quote lands in the port
  // and produces a confusing "port number was not a decimal" failure.
  const rawUrl = (env.PROD_OPENSEARCH_URL ?? env.OPENSEARCH_URL ?? '').replace(/['"]/g, '').trim()

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

  const host = env.LOGS_HOST
  const username = env.LOGS_USERNAME
  const password = env.LOGS_PASSWORD
  const port = env.LOGS_PORT ?? '25060'

  if (!host || !username || !password) {
    throw new Error(
      'Missing OpenSearch connection details. Set PROD_OPENSEARCH_URL (or OPENSEARCH_URL),\n' +
        'or LOGS_HOST / LOGS_USERNAME / LOGS_PASSWORD. Checked the repo root .env and apps/api/.env.'
    )
  }

  return {
    baseUrl: `https://${host}:${port}`,
    auth: Buffer.from(`${username}:${password}`).toString('base64'),
  }
}

/**
 * As `resolveConnection`, but reports a missing configuration as a plain message
 * and exits.
 *
 * These scripts resolve the connection at module load, before any `main().catch`
 * is installed, so a throw there would surface as an unhandled rejection with a
 * stack trace instead of the actionable one-liner the user needs.
 */
export function resolveConnectionOrExit(
  env: NodeJS.ProcessEnv = process.env
): OpenSearchConnection {
  try {
    return resolveConnection(env)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
