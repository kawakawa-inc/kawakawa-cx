# OpenSearch Logging

Production logs are shipped by DigitalOcean's log forwarder into a single
OpenSearch index, `logs-kawakawa-cx`.

## Quick reference

```bash
make logging-status     # mapped fields vs limit, template + pipeline presence, doc count
make logging-setup      # provision pipeline, template, and field limit (idempotent)
make logging-recreate   # DESTRUCTIVE: drop and rebuild the index from the template
make search-logs ENV=prod SEARCH="JWT rejected" HOURS=2
```

Connection details are read from `PROD_OPENSEARCH_URL` (a full
`https://user:pass@host:port` URL) or, failing that, the discrete
`LOGS_HOST` / `LOGS_USERNAME` / `LOGS_PASSWORD` / `LOGS_PORT` vars.

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

Retention is handled separately by the `delete-after-30-days` ISM policy
(`pnpm --filter @kawakawa/api opensearch:lifecycle`). `logging-recreate`
re-attaches it, since a freshly created index is otherwise unmanaged.

## Watching for recurrence

`make logging-status` warns above 80% of the field limit. If it starts climbing
again, something is logging structured objects with unbounded keys — find it
before it hits the cap, because past the cap the symptom is silent data loss.

The long-term fix is a rollover policy (e.g. daily, or at 50 GB) with a write
alias so the mapping resets periodically. Not yet configured.

## Useful queries

```bash
# Why are tokens being rejected?
make search-logs ENV=prod SEARCH="JWT rejected" HOURS=24
```

`log.authFailure` is mapped as a keyword, so it can be aggregated directly:

```
expired | bad-signature | malformed | not-active-yet | version-mismatch | account-locked
```
