# Supabase production launch checklist

The supported production layout is now:

- Frontend: Vercel, rooted at `client`
- Auth, PostgreSQL, private file storage, and APIs: Supabase
- Server workflows: Supabase Edge Functions in `supabase/functions`
- Transactional email: Resend, called only from Edge Functions

The Fastify service under `server/` is retained only as a rollback reference during cutover. Do not deploy it for a new environment.

## 1. Prepare Supabase

1. Create the production Supabase project in the intended region.
2. Install and authenticate the Supabase CLI.
3. Link the repository and apply every migration in `supabase/migrations`.
4. Confirm that the `portal`, `ticket`, and `inventory` schemas are exposed in the project API settings.
5. Confirm the `portal-files` bucket exists and is private.
6. Confirm RLS is enabled on every application table and that anon/authenticated roles cannot query those tables directly.

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

## 2. Configure Edge Function secrets

Generate independent random values for `VERIFICATION_SECRET`, `BOOTSTRAP_SECRET`, and `INBOUND_EMAIL_SECRET`.

```bash
supabase secrets set \
  FRONTEND_URL=https://your-frontend.example \
  RESEND_API_KEY=<resend-key> \
  SMTP_FROM='Innoserve <noreply@your-verified-domain.example>' \
  VERIFICATION_SECRET=<random-secret> \
  BOOTSTRAP_SECRET=<different-random-secret> \
  INBOUND_EMAIL_SECRET=<different-random-secret> \
  DEFAULT_EMAIL_CATEGORY_ID=<ticket-category-id>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied to hosted Edge Functions by Supabase. Never expose the service-role key to the frontend.

```bash
supabase functions deploy api
supabase functions deploy graphql
supabase functions deploy bootstrap-admin
supabase functions deploy migrate-users
supabase functions deploy inbound-email
```

## 3. Configure Supabase Auth

In Authentication → URL Configuration:

- Set Site URL to the production frontend URL.
- Add `/reset-password` on production and localhost to Redirect URLs.
- Disable public sign-up; onboarding remains an OTP-reviewed workflow.
- Configure the email template and sender for invitations and password recovery.

For a new database, create the first administrator exactly once:

```bash
curl --fail-with-body \
  -H 'content-type: application/json' \
  -H 'x-bootstrap-secret: <BOOTSTRAP_SECRET>' \
  -d '{"name":"Administrator","email":"admin@example.com","password":"replace-with-12+-character-password"}' \
  https://<project-ref>.supabase.co/functions/v1/bootstrap-admin
```

The bootstrap endpoint refuses to create another administrator after the first one exists.

## 4. Configure the frontend

Set for Production and Preview, then redeploy:

```text
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_key>
```

The Supabase–Vercel connection syncs `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`, but SvelteKit only exposes variables prefixed with
`PUBLIC_` to browser code. Add the two `PUBLIC_*` aliases above to the Vercel
project for Production and Preview.

Do not set `PRIVATE_API_BASE_URL` after cutover. It exists only for rollback to the old Fastify server.

## 5. Move existing PostgreSQL data

If the old Railway database is still reachable, use the exact `pg_dump`/`psql`
sequence in `SUPABASE_MIGRATION.md`. It removes migration-seeded roles before
the restore and finalizes roles, password cleanup, and projects afterward.

After importing users, send invitations to active accounts that do not yet have an Auth identity:

```bash
curl --fail-with-body \
  -X POST \
  -H 'x-bootstrap-secret: <BOOTSTRAP_SECRET>' \
  https://<project-ref>.supabase.co/functions/v1/migrate-users
```

Old bcrypt passwords cannot be used directly by the browser Auth flow; users set a new Supabase password from their invitation.

## 6. Configure inbound email

Point the inbound provider at:

```text
https://<project-ref>.supabase.co/functions/v1/inbound-email
```

Send the secret in `x-inbound-secret`. If the provider cannot add a header, append `?secret=<INBOUND_EMAIL_SECRET>`. Set `DEFAULT_EMAIL_CATEGORY_ID` to an active category first.

## 7. Smoke test

1. Admin login, logout, recovery, and password update work.
2. Customer and engineer OTP emails arrive through Resend.
3. Onboarding creates pending records and rejects reused or expired proofs.
4. Approving a customer or engineer sends an invitation and permits login after password setup.
5. Private KYC documents, avatars, ticket evidence, and purchase orders open only for authorized users.
6. Every role dashboard loads without failed requests.
7. NOC can assign and reassign engineers and planners.
8. Ticket transitions, closure evidence, RCA, replacements, inventory usage, and payouts work.
9. Inventory stock remains correct under two simultaneous requests.
10. The browser contains no service-role key and direct PostgREST table reads fail.
11. Inbound email deduplicates repeated message IDs and respects allowlists and quotas.

Keep the old service read-only until this checklist passes, then remove Railway variables and DNS records.
