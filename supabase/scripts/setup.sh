#!/usr/bin/env bash
# Links this repo to a hosted Supabase project, applies migrations, pushes
# Edge Function secrets, deploys every function, and writes the browser keys
# into client/.env.
#
# Usage: supabase/scripts/setup.sh <project-ref> [frontend-url]
# Requires: `npx supabase login` (or SUPABASE_ACCESS_TOKEN) and the project's
# database password (prompted by `supabase link`, or SUPABASE_DB_PASSWORD).
set -euo pipefail

ref="${1:?usage: setup.sh <project-ref> [frontend-url]}"
frontend_url="${2:-}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
secrets_file="$root/supabase/.env.local"
client_env="$root/client/.env"
supabase() { npx -y supabase@2 "$@"; }

cd "$root"
[[ -f "$secrets_file" ]] || { echo "Missing $secrets_file (copy supabase/.env.example)" >&2; exit 1; }

echo "==> Linking project $ref"
supabase link --project-ref "$ref"

echo "==> Applying migrations"
supabase db push

echo "==> Setting Edge Function secrets"
# SUPABASE_* names are reserved and injected by the platform.
filtered="$(mktemp)"; trap 'rm -f "$filtered"' EXIT
grep -E '^[A-Z_]+=.+' "$secrets_file" | grep -v '^SUPABASE_' > "$filtered"
if [[ -n "$frontend_url" ]]; then
  sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=$frontend_url|" "$filtered"
fi
supabase secrets set --project-ref "$ref" --env-file "$filtered"

echo "==> Deploying Edge Functions"
supabase functions deploy --use-api --project-ref "$ref"

echo "==> Writing browser keys to client/.env"
keys_json="$(supabase projects api-keys --project-ref "$ref" -o json)"
publishable="$(node -e '
  const keys = JSON.parse(process.argv[1]);
  const pick = keys.find((k) => k.type === "publishable" || String(k.api_key).startsWith("sb_publishable_"))
    ?? keys.find((k) => k.name === "anon");
  if (!pick) process.exit(1);
  console.log(pick.api_key);
' "$keys_json")"

touch "$client_env"
set_env() {
  if grep -q "^$1=" "$client_env"; then
    sed -i "s|^$1=.*|$1=$2|" "$client_env"
  else
    printf '%s=%s\n' "$1" "$2" >> "$client_env"
  fi
}
set_env PUBLIC_SUPABASE_URL "https://$ref.supabase.co"
set_env PUBLIC_SUPABASE_PUBLISHABLE_KEY "$publishable"

cat <<EOF

Done. Next:
  1. Create the first administrator (once):
     curl -X POST https://$ref.supabase.co/functions/v1/bootstrap-admin \\
       -H "x-bootstrap-secret: \$(grep ^BOOTSTRAP_SECRET= supabase/.env.local | cut -d= -f2-)" \\
       -H "content-type: application/json" \\
       -d '{"email":"you@example.com","password":"at-least-12-chars","name":"Admin"}'
  2. In the dashboard (Authentication -> URL Configuration) set the Site URL
     and add <frontend>/reset-password as a redirect URL.
  3. cd client && pnpm dev
EOF
