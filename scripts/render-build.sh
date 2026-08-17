#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing root dependencies"
pnpm install --prod=false || npm install

echo "==> Building web app"
cd web-app
pnpm install --prod=false
pnpm build
cd ..

echo "==> Deploying Supabase edge functions (skipped if no token set)"
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  npx supabase functions deploy \
    --project-ref "${SUPABASE_PROJECT_REF:-nstyqceyjkgevnibfqks}" \
    --use-api \
    --yes \
  || echo "WARNING: edge function deploy failed; continuing build"
else
  echo "SUPABASE_ACCESS_TOKEN not set — edge functions not deployed."
fi

echo "==> Build complete"