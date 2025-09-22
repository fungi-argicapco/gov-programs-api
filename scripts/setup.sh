#!/usr/bin/env bash
set -euo pipefail

APP_NAME="gov-programs-api"
DB_NAME="${APP_NAME}-db"
R2_BUCKET="${APP_NAME}-raw"
KV_LOOKUPS="LOOKUPS"
KV_API_KEYS="API_KEYS"
DO_CLASS="RateLimiter"
DO_BINDING="RATE_LIMITER"
TEMPLATE="wrangler.template.toml"
OUTPUT="wrangler.toml"
MODE="remote"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --local)
      MODE="local"
      shift
      ;;
    --remote)
      MODE="remote"
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

command -v bun >/dev/null || { echo "❌ bun not found in PATH"; exit 1; }
export PATH="$HOME/.bun/bin:$PATH"

mkdir -p scripts .env.d

echo "➡️ Installing runtime & dev deps with bun (no npm/pnpm/yarn)…"
bun install

[ -f tsconfig.json ] || bunx tsc --init --rootDir . --outDir dist --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop true

if [ -f tsconfig.json ]; then
  bun -e '
import { readFileSync, writeFileSync } from "fs";
const path = "tsconfig.json";
const data = JSON.parse(readFileSync(path, "utf8"));
data.compilerOptions = Object.assign({}, data.compilerOptions, {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  strict: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  forceConsistentCasingInFileNames: true,
  skipLibCheck: true,
  lib: ["ES2022", "WebWorker"],
  types: ["@cloudflare/workers-types", "vitest/globals"],
});
data.include = Array.from(new Set(["apps", "packages", "scripts", "vitest.config.ts"]));
writeFileSync(path, JSON.stringify(data, null, 2));
' || true
fi

if [ "${MODE}" = "local" ]; then
  echo "➡️ Local mode: skipping Cloudflare resource creation."
  D1_ID="local"
  LOOKUPS_ID="local"
  APIKEYS_ID="local"
  R2_BUCKET="${R2_BUCKET}-local"
else
  echo "➡️ Creating Cloudflare resources via wrangler (bunx)…"
  # D1
  DB_JSON="$(bunx wrangler d1 create "$DB_NAME" --json || true)"
  if [ -n "${DB_JSON}" ] && echo "$DB_JSON" | grep -q '"uuid"'; then
    D1_ID="$(echo "$DB_JSON" | bun -e 'process.stdin.once("data",d=>{try{console.log(JSON.parse(d).uuid)}catch{}})')"
  else
    D1_ID="$(bunx wrangler d1 list --json | bun -e "process.stdin.once('data',d=>{const a=JSON.parse(d);const m=a.find(x=>x.name=='${DB_NAME}');console.log(m?m.uuid:'')} )")"
  fi
  [ -n "${D1_ID:-}" ] || { echo "❌ Could not determine D1 database id"; exit 1; }

  # KV namespaces
  LOOKUPS_JSON="$(bunx wrangler kv:namespace create ${KV_LOOKUPS} --json || true)"
  APIKEYS_JSON="$(bunx wrangler kv:namespace create ${KV_API_KEYS} --json || true)"
  LOOKUPS_ID="$( [ -n "$LOOKUPS_JSON" ] && echo "$LOOKUPS_JSON" | bun -e 'process.stdin.once("data",d=>{try{console.log(JSON.parse(d).id)}catch{}})' || true )"
  APIKEYS_ID="$( [ -n "$APIKEYS_JSON" ] && echo "$APIKEYS_JSON" | bun -e 'process.stdin.once("data",d=>{try{console.log(JSON.parse(d).id)}catch{}})' || true )"
  [ -n "${LOOKUPS_ID:-}" ] || LOOKUPS_ID="$(bunx wrangler kv:namespace list --json | bun -e "process.stdin.once('data',d=>{const a=JSON.parse(d);const m=a.find(x=>x.title==='${KV_LOOKUPS}');console.log(m?m.id:'')} )")"
  [ -n "${APIKEYS_ID:-}" ] || APIKEYS_ID="$(bunx wrangler kv:namespace list --json | bun -e "process.stdin.once('data',d=>{const a=JSON.parse(d);const m=a.find(x=>x.title==='${KV_API_KEYS}');console.log(m?m.id:'')} )")"

  [ -n "${LOOKUPS_ID:-}" ] || { echo "❌ Could not determine ${KV_LOOKUPS} KV id"; exit 1; }
  [ -n "${APIKEYS_ID:-}" ] || { echo "❌ Could not determine ${KV_API_KEYS} KV id"; exit 1; }

  # R2 bucket
  bunx wrangler r2 bucket create "${R2_BUCKET}" >/dev/null 2>&1 || true
fi

echo "➡️ Writing .env with resolved identifiers…"
ENV_FILE=".env"
touch "${ENV_FILE}"
declare -A KV
KV[CF_D1_DATABASE_ID]="${D1_ID}"
KV[CF_KV_LOOKUPS_ID]="${LOOKUPS_ID}"
KV[CF_KV_API_KEYS_ID]="${APIKEYS_ID}"
KV[CF_R2_RAW_BUCKET]="${R2_BUCKET}"
KV[CF_DO_BINDING]="${DO_BINDING}"
KV[CF_DO_CLASS]="${DO_CLASS}"
for k in "${!KV[@]}"; do
  if grep -q "^${k}=" "${ENV_FILE}" 2>/dev/null; then
    sed -i.bak "s#^${k}=.*#${k}=${KV[$k]}#g" "${ENV_FILE}"
  else
    echo "${k}=${KV[$k]}" >> "${ENV_FILE}"
  fi
done
echo "ℹ️  .env updated: CF_* IDs available to scripts & tests."

echo "➡️ Rendering wrangler.toml from template…"
if [ ! -f "${TEMPLATE}" ]; then
  cat > "${TEMPLATE}" <<'TOML'
name = "gov-programs-api"
main = "apps/api/src/index.ts"
compatibility_date = "2025-09-21"

[vars]
NODE_ENV = "production"

[[d1_databases]]
binding = "DB"
database_name = "gov-programs-api-db"
database_id = "__D1_DATABASE_ID__"

[[kv_namespaces]]
binding = "LOOKUPS_KV"
id = "__KV_LOOKUPS_ID__"

[[kv_namespaces]]
binding = "API_KEYS"
id = "__KV_API_KEYS_ID__"

[[r2_buckets]]
binding = "RAW_R2"
bucket_name = "__R2_BUCKET__"

[[durable_objects.bindings]]
name = "__DO_BINDING__"
class_name = "__DO_CLASS__"

[[migrations]]
tag = "v1"
new_classes = ["__DO_CLASS__"]

[migrations]
dir = "packages/db/migrations"

[triggers]
crons = ["0 */4 * * *"]
TOML
fi

bun -e '
import {readFileSync, writeFileSync} from "fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split(/\r?\n/).filter(Boolean).map(l=>l.split("=")));
let s = readFileSync(process.argv[1], "utf8");
s = s
  .replaceAll("__D1_DATABASE_ID__", env.CF_D1_DATABASE_ID||"")
  .replaceAll("__KV_LOOKUPS_ID__", env.CF_KV_LOOKUPS_ID||"")
  .replaceAll("__KV_API_KEYS_ID__", env.CF_KV_API_KEYS_ID||"")
  .replaceAll("__R2_BUCKET__", env.CF_R2_RAW_BUCKET||"")
  .replaceAll("__DO_BINDING__", env.CF_DO_BINDING||"")
  .replaceAll("__DO_CLASS__", env.CF_DO_CLASS||"");
writeFileSync(process.argv[2], s);
' "${TEMPLATE}" "${OUTPUT}"
echo "✅ Generated ${OUTPUT}"

echo "🔐 (Optional) set secrets via wrangler:"
echo "   echo \$OPENAI_API_KEY | bunx wrangler secret put OPENAI_API_KEY"
echo "   echo \$GITHUB_TOKEN   | bunx wrangler secret put GITHUB_TOKEN"

echo "🎉 Setup complete."
