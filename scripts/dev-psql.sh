#!/usr/bin/env bash
#
# psql passthrough for the dev database.
# Reads $DATABASE_URL from the environment and refuses to run against any
# host that isn't localhost — this script is for the dev container only.
#
# Usage:
#   ./scripts/dev-psql.sh                         # interactive psql shell
#   ./scripts/dev-psql.sh "SELECT 1"              # run a single SQL statement
#   ./scripts/dev-psql.sh -f path/to/file.sql     # any other psql flags pass through

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is not set" >&2
  exit 1
fi

host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-zA-Z+]+://([^@]*@)?([^:/?]+).*#\2#')"

case "$host" in
  localhost|127.0.0.1|::1|db|postgres)
    ;;
  *)
    echo "error: refusing to run — DATABASE_URL host is '$host', not localhost" >&2
    echo "       (this script is dev-only; set DATABASE_URL to a local DB to proceed)" >&2
    exit 1
    ;;
esac

if [[ $# -eq 1 && "$1" != -* ]]; then
  exec psql "$DATABASE_URL" -c "$1"
fi

exec psql "$DATABASE_URL" "$@"
