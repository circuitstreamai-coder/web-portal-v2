#!/usr/bin/env bash
# Pushes production Auth settings (URLs, sign-up, Resend SMTP, email templates)
# to the hosted project without touching the local-development config.toml.
#
# Usage: supabase/scripts/push-auth-config.sh <project-ref> <frontend-url>
# Reads RESEND_API_KEY and SMTP_FROM from supabase/.env.local.
set -euo pipefail

ref="${1:?usage: push-auth-config.sh <project-ref> <frontend-url>}"
frontend="${2:?usage: push-auth-config.sh <project-ref> <frontend-url>}"
frontend="${frontend%/}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
secrets_file="$root/supabase/.env.local"

RESEND_API_KEY="$(grep -E '^RESEND_API_KEY=' "$secrets_file" | cut -d= -f2-)"
smtp_from="$(grep -E '^SMTP_FROM=' "$secrets_file" | cut -d= -f2-)"
[[ -n "$RESEND_API_KEY" && -n "$smtp_from" ]] || { echo "RESEND_API_KEY and SMTP_FROM are required in $secrets_file" >&2; exit 1; }
export RESEND_API_KEY

# "Name <address>" -> sender name and admin email.
sender_name="$(sed -E 's/^(.*)<.*$/\1/; s/[[:space:]]+$//' <<<"$smtp_from")"
admin_email="$(sed -E 's/^.*<(.*)>.*$/\1/' <<<"$smtp_from")"

workdir="$(mktemp -d)"; trap 'rm -rf "$workdir"' EXIT
mkdir -p "$workdir/supabase"
cp -r "$root/supabase/templates" "$workdir/supabase/templates"
cat > "$workdir/supabase/config.toml" <<EOF
project_id = "innoserve-portal"

[auth]
site_url = "$frontend"
additional_redirect_urls = ["$frontend/reset-password", "http://localhost:5173/reset-password"]
enable_signup = false

[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(RESEND_API_KEY)"
admin_email = "$admin_email"
sender_name = "$sender_name"

[auth.email.template.invite]
subject = "Activate your Innoserve Portal account"
content_path = "./supabase/templates/invite.html"

[auth.email.template.recovery]
subject = "Reset your Innoserve Portal password"
content_path = "./supabase/templates/recovery.html"
EOF

npx -y supabase@2 config diff --workdir "$workdir" --project-ref "$ref"
[[ "${DRY_RUN:-}" == 1 ]] && exit 0
npx -y supabase@2 config push --workdir "$workdir" --project-ref "$ref" --yes
