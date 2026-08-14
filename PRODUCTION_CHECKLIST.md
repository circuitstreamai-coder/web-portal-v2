# Client demo and production launch checklist

The supported production layout is:

- Frontend: Vercel, with the Root Directory set to `client`
- API: Railway, with the Root Directory set to `server`
- Database: PostgreSQL attached to the Railway API service
- Transactional email: Resend over HTTPS, with no demo-only OTP bypass

## Phase A: client demo without Innoserve access

The demo uses the existing Vercel and Railway URLs and a sender account controlled
by the developer. OTP generation, delivery, verification, expiry, rate limiting,
and the server-signed onboarding proof all remain enabled exactly as they will in
production.

### 1. Configure a real demo sender

Use the developer-owned `momently.in` domain with a dedicated sending subdomain:

```text
send.momently.in
```

1. In Resend, add `send.momently.in` as a sending domain.
2. In GoDaddy, open `momently.in` → DNS → Manage DNS.
3. Add every MX and TXT record displayed by Resend. Copy Resend's values exactly
   and keep GoDaddy's default TTL. Do not remove or modify existing website, NS,
   A, AAAA, or CNAME records.
4. In Resend, select **Verify DNS Records** and wait for the domain status to
   become **Verified**.
5. Create a **Sending access** API key restricted to `send.momently.in`.

Set these Railway variables:

```text
RESEND_API_KEY=<secret Resend sending key>
SMTP_FROM=Innoserve Portal Demo <no-reply@send.momently.in>
```

Leave `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` unset. Resend uses HTTPS and works
on Railway plans where outbound SMTP is unavailable. The `no-reply` address does
not require a GoDaddy mailbox.

### 2. Railway API variables

Set these variables on the Railway API service before deploying:

```text
NODE_ENV=production
DATABASE_URL=<Railway PostgreSQL connection reference>
JWT_SECRET=<at least 32 cryptographically random bytes>
CORS_ORIGIN=https://innoserve-test.vercel.app
FRONTEND_URL=https://innoserve-test.vercel.app
BASE_URL=https://api-production-7469.up.railway.app
SMTP_FROM=Innoserve Portal Demo <no-reply@send.momently.in>
RESEND_API_KEY=<secret Resend sending key>
SEED_ON_STARTUP=false
```

Never commit real values to Git or expose the Resend key in Vercel/browser code.

Railway runs database migrations before deployment and checks `/ready`. A release
will not become healthy unless PostgreSQL and an email provider are configured.

### 3. Vercel frontend variable

Set this variable for Production and Preview:

```text
PRIVATE_API_BASE_URL=https://api-production-7469.up.railway.app
```

Environment-variable changes only affect new Vercel deployments, so redeploy the
frontend after saving it.

### 4. Demo smoke test

Verify all of the following before announcing the launch:

1. `GET /ready` on the API returns HTTP 200.
2. Customer registration sends and verifies an OTP.
3. Customer registration completes and appears in the admin approval queue.
4. Login, logout, and forgot-password email work.
5. An authenticated user can upload and retrieve an allowed file.
6. The browser console has no failed API requests on each role dashboard.

## Phase B: client-owned production handover

After Innoserve provides DNS and mail-provider access, add `innoserve.in` (or a
dedicated sending subdomain) in Resend and publish all records supplied by Resend.
Set `RESEND_API_KEY` and change `SMTP_FROM` to an address on the exact verified
domain, for example:

```text
Innoserve <noreply@innoserve.in>
```

Replace the Momently Resend key and sender after Innoserve delivery passes the
smoke test. Do not use `innoserve.com`: it currently publishes a null MX record
and an SPF policy that rejects all mail.

### Custom domain follow-up

When the final frontend domain is attached, update `CORS_ORIGIN` and
`FRONTEND_URL` on Railway. Multiple allowed origins can be comma-separated.
Update `PRIVATE_API_BASE_URL` only if the API domain changes, then redeploy both
services and repeat the smoke test.
