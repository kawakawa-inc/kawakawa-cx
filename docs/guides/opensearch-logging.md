# OpenSearch Logging

Production logs are shipped by DigitalOcean's log forwarder to
`logs-kawakawa-cx`, which is a **write alias** over dated backing indices
(`logs-kawakawa-cx-000001`, `-000002`, ...). The forwarder is unaware of this —
writes to an alias with a designated write index land in the current backing
index automatically.

## Quick reference

```bash
make logging-status     # mapped fields vs limit, template + pipeline presence, doc count
make logging-setup      # provision pipeline, template, and field limit (idempotent)
make logging-recreate   # DESTRUCTIVE: drop and rebuild the index from the template
make search-logs SEARCH="JWT rejected" HOURS=2
```

`make search-logs` accepts `SEARCH=`, `HOURS=`, `ERRORS=1`, `COMPONENT=`,
`LIMIT=` and `RAW=1`. `SEARCH` is a plain case-insensitive substring — no query
syntax, so punctuation and brackets are matched literally.

There is only one log index, so there is no `ENV=` to choose: only the
production app forwards logs to OpenSearch. Local dev logs go to files under
`.dev/logs/` — use `make logs S=<service>` for those. (`ENV=prod` is still
accepted and ignored, so older invocations keep working.)

Connection details are read from `PROD_OPENSEARCH_URL` (a full
`https://user:pass@host:port` URL) or, failing that, the discrete
`LOGS_HOST` / `LOGS_USERNAME` / `LOGS_PASSWORD` / `LOGS_PORT` vars. Both the
repo root `.env` and `apps/api/.env` are loaded, in that order, and all three
logging scripts resolve them through `apps/api/src/scripts/opensearch-connection.ts`.

## The failure this guards against

OpenSearch caps an index at **1000 mapping fields** by default. Once the cap is
reached, any document containing a _new_ field is rejected outright — the log
line is dropped at ingest with no error surfaced to the application. Logs simply
go missing, and only for the newest fields, which is maximally confusing.

This happened in August 2026: JWT auth diagnostics appeared in container logs
but never reached OpenSearch. Two causes:

1. **Bodies logged as objects.** Request/response bodies were logged as
   structured objects, so OpenSearch dynamically mapped a field per key of every
   domain object it ever saw. `log.resBody.*` alone reached **441 of the 1000
   fields** (67 distinct top-level keys, deeply nested).
2. **No guard rail.** The index template declared `log` as a plain dynamic
   object with no field cap, and there is no rollover — one ever-growing index
   whose mapping never resets.

Fixes: bodies are now serialised to JSON **strings** before logging
(`apps/api/src/utils/logBody.ts`), and the template pins `resBody`/`reqBody` to
`text` and raises the limit to 3000.

## Rebuilding logging from scratch

`make logging-recreate` is safe to reach for when the mapping is bloated. It
provisions the pipeline and template **before** dropping the index, so the new
index is created with the right settings rather than defaults.

```bash
# Verify current state first
make logging-status

# Drop and rebuild (deletes ALL existing log documents)
make logging-recreate

# Confirm
make logging-status
```

Order matters. If you drop the index by hand _without_ the template in place,
the forwarder recreates it with default settings: no `parse-log-json` pipeline
(so `log` stays an unparsed JSON string and nothing is searchable) and a
1000-field cap. Running `make logging-setup` first, or using
`make logging-recreate`, avoids that.

## Rollover and retention

The `logs-rollover-30d` ISM policy rolls the alias onto a new backing index
**daily or at 10 GB**, whichever comes first, and deletes indices **30 days**
after creation. It auto-attaches to new backing indices via `ism_template`
(priority 200, which must stay above the older `delete-after-30-days` policy at
priority 100 or that one wins and no rollover happens).

Rollover is the durable fix for the field-limit failure: every new backing index
starts with a fresh mapping, so field count cannot creep to the ceiling and
start silently rejecting log lines. Between that and logging bodies as strings,
the mapping now sits at ~21 fields on a new index instead of 1000.

Searching `logs-kawakawa-cx` transparently spans all backing indices.

## Watching for recurrence

`make logging-status` warns above 80% of the field limit. If it starts climbing
again, something is logging structured objects with unbounded keys — find it
before it hits the cap, because past the cap the symptom is silent data loss.

If `make logging-status` reports that `logs-kawakawa-cx` is a **concrete index**
rather than an alias, rollover is not running — rebuild with
`make logging-recreate`.

## Document shape

This is the thing to get right before writing any ad-hoc query. The DO forwarder
wraps the application's stdout line, so the envelope sits at the top level and
**every application field is nested under `log.*`**:

| Field                       | Where     | Notes                                                                                                 |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `@timestamp`                | top level | The field to range-query on. The app's own `time` is under `log`.                                     |
| `do_component_name`         | top level | `kawa-api`, `kawa-web`, `kawa-bot`, `kawa-sync-worker`. Analysed `text` with **no** keyword subfield. |
| `log.msg`, `log.level`, ... | nested    | `log.level` is a string label (`info`/`warn`/`error`), not a number.                                  |

Three traps, each of which had shipped as a bug in `logs.ts`:

- **Query `log.msg`, not `msg`.** A bare top-level field name matches nothing
  and reports zero hits rather than an error — indistinguishable from "no logs".
- **Filter components with `match_phrase`, not `match`.** `do_component_name` is
  analysed with no keyword subfield, so `match: "kawa-api"` ORs the tokens
  `kawa` and `api` and matches _every_ component.
- **Prefer `wildcard` on a `.keyword` subfield for substring search.** A
  `query_string` wildcard runs against analysed text, so it misses values
  containing punctuation (`*sync-all*` finds nothing), and raises a
  `query_shard_exception` on query-syntax characters.

Add `track_total_hits: true` to any counting query; OpenSearch otherwise caps
the reported total at 10,000 and flags it `gte`.

## Useful queries

```bash
# Why are tokens being rejected?
make search-logs SEARCH="JWT rejected" HOURS=24

# Is anything still authenticating by Authorization header?
make search-logs SEARCH="legacy header auth" HOURS=48
```

`log.authFailure` is mapped as a keyword, so it can be aggregated directly:

```
expired | bad-signature | malformed | not-active-yet | version-mismatch | account-locked
```
