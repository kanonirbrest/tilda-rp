#!/bin/sh
set -e
if [ "${SKIP_DB_MIGRATE:-0}" != "1" ] && [ -n "${DATABASE_URL:-}" ]; then
  (cd /migrate && node ./node_modules/prisma/build/index.js migrate deploy)
fi
cd /app
exec node server.js
