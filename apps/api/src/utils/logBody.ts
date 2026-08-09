/** Max serialized body length kept in logs. */
export const MAX_LOGGED_BODY_CHARS = 2000

/**
 * Serialize an already-redacted request/response body to a single string field.
 *
 * Bodies must be logged as strings, not objects. Logging them as objects made
 * the log index create a mapping field for every key of every domain object it
 * ever saw — `log.resBody.*` alone reached 441 fields and pushed the index past
 * OpenSearch's default 1000-field limit. Beyond that limit OpenSearch rejects
 * any document introducing a new field, which silently dropped whole log lines
 * (including the JWT auth diagnostics). A string keeps the body readable and
 * full-text searchable while costing exactly one mapping field.
 */
export function stringifyForLog(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, MAX_LOGGED_BODY_CHARS)
  try {
    const json = JSON.stringify(body)
    if (json === undefined) return String(body)
    return json.length > MAX_LOGGED_BODY_CHARS
      ? `${json.slice(0, MAX_LOGGED_BODY_CHARS)}… [truncated ${json.length - MAX_LOGGED_BODY_CHARS} chars]`
      : json
  } catch {
    return '[unserializable]'
  }
}
