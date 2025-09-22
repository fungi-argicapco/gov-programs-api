#!/usr/bin/env bash
set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  echo "➡️ Installing Bun runtime via official installer..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
else
  echo "✅ Bun already available: $(bun --version)"
fi

if [ ! -f package.json ]; then
  echo "❌ package.json not found. Run from repo root." >&2
  exit 1
fi

echo "➡️ Installing workspace dependencies with bun install..."
bun install

echo "🎉 Environment ready."
