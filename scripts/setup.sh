#!/usr/bin/env bash
# Project bootstrap: remote if token+account are set; otherwise local placeholders.
set -euo pipefail
export NO_COLOR=1
export WRANGLER_DISABLE_TELEMETRY=1
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

# Node 22 native build compatibility for node-gyp (better-sqlite3)
PYBIN="$(command -v python3 || command -v python || true)"
[ -z "${PYBIN:-}" ] && { echo "❌ No Python found; node-gyp requires Python 3.x."; exit 1; }
"$PYBIN" -m ensurepip --upgrade >/dev/null 2>&1 || true
"$PYBIN" -m pip install --user -q --upgrade pip setuptools wheel || true
SHIMDIR=".env.d/pyshim"; mkdir -p "$SHIMDIR/distutils"
cat > "$SHIMDIR/distutils/__init__.py" <<'PY'
from setuptools._distutils import *
PY
export PYTHONPATH="$(pwd)/$SHIMDIR:${PYTHONPATH:-}"
export npm_config_python="$PYBIN"
export npm_config_build_from_source=true
echo "➡️ Node $(node -v 2>/dev/null || echo system) | Python $("$PYBIN" -V) | node-gyp python: $npm_config_python"

APP_NAME="gov-programs-api"
DB_NAME="${APP_NAME}-db"
R2_BUCKET="${APP_NAME}-raw"
KV_LOOKUPS="LOOKUPS"
KV_API_KEYS="API_KEYS"
DO_CLASS="RateLimiter"
DO_BINDING="RATE_LIMITER"
TEMPLATE="wrangler.template.toml"
OUTPUT="wrangler.toml"

# Ensure wrangler present AFTER shim (avoids node-gyp failures)
bun add -d wrangler bun-types >/dev/null 2>&1 || true
[ -f "$TEMPLATE" ] || { echo "❌ Missing $TEMPLATE"; exit 1; }

touch .env
ensure_kv () { local K="$1" V="$2"; if grep -q "^${K}=" .env 2>/dev/null; then sed -i.bak "s#^${K}=.*#${K}=${V}#g" .env; else echo "${K}=${V}" >> .env; fi; }

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
CF_ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"
MODE="${1:-auto}"
CF_REMOTE_OK=0
if [ "$MODE" = "--remote" ]; then
  [ -n "$CF_TOKEN" ] && [ -n "$CF_ACCOUNT" ] && CF_REMOTE_OK=1
elif [ "$MODE" = "--local" ]; then
  CF_REMOTE_OK=0
else
  [ -n "$CF_TOKEN" ] && [ -n "$CF_ACCOUNT" ] && CF_REMOTE_OK=1
fi

D1_ID=""; LOOKUPS_ID=""; APIKEYS_ID=""
if [ "$CF_REMOTE_OK" -eq 1 ]; then
  echo "➡️ Remote provisioning (account: $CF_ACCOUNT)…"
  OUT="$(bunx wrangler d1 create "$DB_NAME" --account-id "$CF_ACCOUNT" 2>&1 || true)"
  D1_ID="$(printf "%s" "$OUT" | grep -oE '[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}' | head -n1)"
  if [ -z "$D1_ID" ]; then
    LOUT="$(bunx wrangler d1 list --account-id "$CF_ACCOUNT" 2>&1 || true)"
    D1_ID="$(printf "%s" "$LOUT" | awk -v n="$DB_NAME" '
      BEGIN{IGNORECASE=1}
      /uuid|name/{
        if ($0 ~ /name[^"]*"'"$DB_NAME"'"|'"$DB_NAME"'/) seen=1;
        if (seen && match($0,/[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}/)){
          print substr($0,RSTART,RLENGTH); exit
        }
      }')"
  fi
  K1="$(bunx wrangler kv:namespace create "$KV_LOOKUPS" --account-id "$CF_ACCOUNT" 2>&1 || true)"
  LOOKUPS_ID="$(printf "%s" "$K1" | grep -oE '[a-z0-9]{32}' | head -n1)"
  if [ -z "$LOOKUPS_ID" ]; then
    KL="$(bunx wrangler kv:namespace list --account-id "$CF_ACCOUNT" 2>&1 || true)"
    LOOKUPS_ID="$(printf "%s" "$KL" | awk -v t="$KV_LOOKUPS" '
      BEGIN{IGNORECASE=1}
      /id|title/{
        if ($0 ~ /title[^"]*"'"$KV_LOOKUPS"'"|'"$KV_LOOKUPS"'/) seen=1;
        if (seen && match($0,/id[^"]*"([a-z0-9]{32})"/,m)){ print m[1]; exit }
        if (seen && match($0,/[a-z0-9]{32}/)){ print substr($0,RSTART,RLENGTH); exit }
      }')"
  fi
  K2="$(bunx wrangler kv:namespace create "$KV_API_KEYS" --account-id "$CF_ACCOUNT" 2>&1 || true)"
  APIKEYS_ID="$(printf "%s" "$K2" | grep -oE '[a-z0-9]{32}' | head -n1)"
  if [ -z "$APIKEYS_ID" ]; then
    KL2="$(bunx wrangler kv:namespace list --account-id "$CF_ACCOUNT" 2>&1 || true)"
    APIKEYS_ID="$(printf "%s" "$KL2" | awk -v t="$KV_API_KEYS" '
      BEGIN{IGNORECASE=1}
      /id|title/{
        if ($0 ~ /title[^"]*"'"$KV_API_KEYS"'"|'"$KV_API_KEYS"'/) seen=1;
        if (seen && match($0,/id[^"]*"([a-z0-9]{32})"/,m)){ print m[1]; exit }
        if (seen && match($0,/[a-z0-9]{32}/)){ print substr($0,RSTART,RLENGTH); exit }
      }')"
  fi
  bunx wrangler r2 bucket create "$R2_BUCKET" --account-id "$CF_ACCOUNT" >/dev/null 2>&1 || true
else
  echo "ℹ️ Remote provisioning skipped (no CF token/account)."
fi

# Write .env (IDs may be blank when local)
ensure_kv CF_D1_DATABASE_ID "${D1_ID}"
ensure_kv CF_KV_LOOKUPS_ID "${LOOKUPS_ID}"
ensure_kv CF_KV_API_KEYS_ID "${APIKEYS_ID}"
ensure_kv CF_R2_RAW_BUCKET "${R2_BUCKET}"
ensure_kv CF_DO_BINDING "${DO_BINDING}"
ensure_kv CF_DO_CLASS "${DO_CLASS}"

# Render wrangler.toml with conditional sections only when IDs exist
bun -e '
  import {readFileSync, writeFileSync} from "fs";
  const env = Object.fromEntries(readFileSync(".env","utf8").split(/\r?\n/).filter(Boolean).map(l=>l.split("=")));
  let s = readFileSync("wrangler.template.toml","utf8");
  s = s.replaceAll("__R2_BUCKET__", env.CF_R2_RAW_BUCKET||"")
       .replaceAll("__DO_BINDING__", env.CF_DO_BINDING||"RATE_LIMITER")
       .replaceAll("__DO_CLASS__", env.CF_DO_CLASS||"RateLimiter");
  let extra = "";
  if ((env.CF_D1_DATABASE_ID||"").trim()) {
    extra += `[[d1_databases]]
binding = "DB"
database_name = "gov-programs-api-db"
database_id = "${env.CF_D1_DATABASE_ID}"\n`;
  }
  if ((env.CF_KV_LOOKUPS_ID||"").trim()) {
    extra += `[[kv_namespaces]]
binding = "LOOKUPS_KV"
id = "${env.CF_KV_LOOKUPS_ID}"\n`;
  }
  if ((env.CF_KV_API_KEYS_ID||"").trim()) {
    extra += `[[kv_namespaces]]
binding = "API_KEYS"
id = "${env.CF_KV_API_KEYS_ID}"\n`;
  }
  s = s + "\n" + extra;
  writeFileSync("wrangler.toml", s);
'
echo "✅ Wrote wrangler.toml"

# Only run migrations when a real D1 ID exists
if grep -q '^CF_D1_DATABASE_ID=' .env && [ -n "$(grep '^CF_D1_DATABASE_ID=' .env | cut -d= -f2-)" ]; then
  CF_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
  CF_ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"
  if [ -n "$CF_TOKEN" ] && [ -n "$CF_ACCOUNT" ]; then
    bunx wrangler d1 migrations apply DB --remote || echo "⚠️ Remote migrations skipped."
  fi
  bunx wrangler d1 migrations apply DB --local || true
else
  echo "ℹ️ No D1 id yet; skipping migrations."
fi

echo "🎉 Setup complete."
