# Railway to Supabase migration

## What changed

The browser now authenticates with Supabase Auth and sends its access token to two compatibility Edge Functions:

- `api`: existing REST paths, uploads, signed private-file access, and operational workflows
- `graphql`: existing read queries and onboarding mutations

The client uses these functions when `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set. `PUBLIC_SUPABASE_ANON_KEY` remains a
legacy-compatible fallback. With these variables absent, the Fastify proxy
remains available as a temporary rollback path.

Files are stored in the private `portal-files` bucket. Application tables retain numeric IDs through `portal.storage_files`, avoiding a disruptive identifier change.

## Hosted project setup

After `npx supabase login`, one script links the project, applies migrations,
pushes the secrets in `supabase/.env.local`, deploys all Edge Functions, and
writes the browser keys into `client/.env`:

```bash
supabase/scripts/setup.sh <project-ref> [https://your-frontend.example]
```

## Database migration

Apply migrations to an empty Supabase project first:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

If Railway PostgreSQL remains reachable, export only application data:

```bash
pg_dump "$RAILWAY_DATABASE_URL" \
  --data-only --no-owner --no-privileges \
  --schema=portal --schema=ticket --schema=inventory \
  --exclude-table-data=portal.email_otp_challenges \
  --exclude-table-data=ticket.files \
  --exclude-table-data=ticket.file_chunks \
  --file=innoserve-data.sql
```

Prepare the empty target, restore through the direct Supabase database connection
(not the transaction pooler), and finalize the imported records:

```bash
psql "$SUPABASE_DIRECT_DATABASE_URL" \
  --set=ON_ERROR_STOP=on \
  --file=supabase/scripts/prepare_legacy_import.sql

psql "$SUPABASE_DIRECT_DATABASE_URL" \
  --set=ON_ERROR_STOP=on \
  --file=innoserve-data.sql

psql "$SUPABASE_DIRECT_DATABASE_URL" \
  --set=ON_ERROR_STOP=on \
  --file=supabase/scripts/finalize_legacy_import.sql
```

The preparation script intentionally refuses to run if the destination already
contains users, customers, or tickets. The finalization script removes imported
legacy password hashes, restores any missing role names, and creates default
projects for customers that do not have one. The dump carries sequence values
for restored `serial` tables; new uploads use the independent identity sequence
in `portal.storage_files`.

If Railway is unreachable and no dump exists, its data cannot be reconstructed from this repository. Start with the seeded roles, bootstrap an administrator, then recreate business data through the portal or a reviewed import.

## Authentication migration

`portal.users` remains the business profile table and links to `auth.users` through `auth_user_id`.

- New approved accounts use `inviteUserByEmail`.
- Existing active users are invited by the one-time `migrate-users` function.
- Old Fastify password hashes are not copied into browser Auth sessions. Users establish a new password through invitation or recovery.
- A database trigger links Auth users to portal profiles by normalized email.

After invitations finish, rotate `BOOTSTRAP_SECRET`. You may also undeploy `bootstrap-admin` and `migrate-users`.

## Legacy database files

Old `ticket.files`/`ticket.file_chunks` bytea rows are deliberately excluded from
the database dump and are not automatically copied to Storage. Export and upload
any required files before cutover, then update references to
`/file/<portal.storage_files.id>`. Existing purchase-order attachment IDs also
need to be remapped. New uploads go directly to private Storage.

## Local development

```bash
cp client/.env.example client/.env
cp supabase/.env.example supabase/.env.local
cd client
pnpm install
pnpm dev
```

For the local Supabase stack:

```bash
supabase start
supabase db reset
supabase functions serve --env-file supabase/.env.local
```

## Rollback

Unset the two `PUBLIC_SUPABASE_*` variables, restore `PRIVATE_API_BASE_URL`, and redeploy the client. Never allow writes to both databases during rollback; select one system of record first.
