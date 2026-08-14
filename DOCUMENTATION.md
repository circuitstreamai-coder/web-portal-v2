# Innoserve Techsol — Web Portal v2 Documentation

> Last updated: 2026-05-24  
> Status: Clean build — 0 TypeScript errors, 0 Svelte warnings

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Technology Stack](#3-technology-stack)
4. [Roles & Permissions](#4-roles--permissions)
5. [Frontend (web-portal)](#5-frontend-web-portal)
   - [Architecture](#51-architecture)
   - [Routing & Auth Guards](#52-routing--auth-guards)
   - [API Layer](#53-api-layer)
   - [State Management](#54-state-management)
   - [Shared UI Components](#55-shared-ui-components)
6. [Backend (innoserve-api-test)](#6-backend-innoserve-api-test)
   - [Server Architecture](#61-server-architecture)
   - [Database Schema](#62-database-schema)
   - [REST API Reference](#63-rest-api-reference)
   - [GraphQL API](#64-graphql-api)
   - [Authentication](#65-authentication)
   - [File Handling](#66-file-handling)
7. [Ticket Lifecycle](#7-ticket-lifecycle)
8. [Key Workflows](#8-key-workflows)
9. [Environment Variables](#9-environment-variables)
10. [Running the Project](#10-running-the-project)
11. [Known Issues](#11-known-issues)

---

## 1. Project Overview

Innoserve Web Portal v2 is a full-stack ticket and field-engineer management system for **Innoserve Techsol**. It allows customers to raise service tickets, routes them through internal staff roles, and tracks them through resolution, validation, and closure.

Key capabilities:
- Multi-role dashboard (9 roles, each with scoped views and permissions)
- Ticket lifecycle management with escalation, replacement requests, and SLA tracking
- Engineer onboarding, KYC document management, and payout tracking
- Customer onboarding and approval workflow
- Inventory management (hardware, software licenses, network equipment)
- Real-time in-browser notifications via SSE
- Email-inbound ticket creation (CloudMailin webhook)

---

## 2. Monorepo Structure

```
web-portal-v2/
├── web-portal/          # SvelteKit frontend (deployed to Vercel)
│   ├── src/
│   │   ├── hooks.server.ts        # API proxy to Railway backend
│   │   ├── routes/                # SvelteKit file-based routes
│   │   └── lib/
│   │       ├── api/               # REST + GraphQL + upload clients
│   │       ├── config/roles.ts    # Central role/permission definitions
│   │       ├── components/ui/     # Shared UI primitives
│   │       ├── modules/           # Feature modules (tickets, engineers, …)
│   │       ├── stores/            # Svelte stores (auth, notifications, query)
│   │       └── utils/             # Helpers (pincode lookup, API utils)
│   └── package.json
│
└── innoserve-api-test/  # Fastify + GraphQL backend (deployed to Railway)
    ├── src/
    │   ├── index.ts               # Entry point — boots server, optional seed
    │   ├── servers/yoga-http.ts   # Fastify + GraphQL Yoga server factory
    │   ├── plugins/               # JWT auth, middleware guards
    │   ├── modules/               # Feature modules (auth, ticket, customer, …)
    │   ├── db/                    # Drizzle ORM setup, schema, migrations, seeds
    │   └── graphql/               # GraphQL schema builder
    └── package.json
```

---

## 3. Technology Stack

### Frontend
| Concern | Library / Version |
|---|---|
| Framework | SvelteKit 2.x + Svelte 5 |
| Styling | Tailwind CSS v4 |
| Type checking | TypeScript 5.9 |
| Build tool | Vite 7 |
| Adapter | `@sveltejs/adapter-vercel` |
| Notifications toast | `svelte-sonner` |
| Excel parsing | `xlsx` |
| Email (OTP) | `nodemailer` |
| Dark mode | `mode-watcher` |
| E2E tests | Playwright |

### Backend
| Concern | Library / Version |
|---|---|
| HTTP server | Fastify 5 |
| GraphQL | GraphQL Yoga 5 + graphql 16 |
| ORM | Drizzle ORM |
| Database | PostgreSQL (via `pg`) |
| Auth | `@fastify/jwt` + `@fastify/cookie` |
| File uploads | `@fastify/multipart` |
| Emails | Resend + Nodemailer |
| CORS | `@fastify/cors` |
| IDs | UUIDv7 |
| Excel export | ExcelJS |

---

## 4. Roles & Permissions

The system has **9 roles**. Role strings are the single source of truth in [web-portal/src/lib/config/roles.ts](web-portal/src/lib/config/roles.ts).

### Role Definitions

| Role | Label | Dashboard Route |
|---|---|---|
| `super_admin` | Super Admin | `/admin` |
| `national_head` | National Head | `/national-head/dashboard` |
| `project_head` | Project Head | `/project-head/dashboard` |
| `noc` | NOC | `/noc` |
| `state_planner` | State Planner | `/planner` |
| `engineer` | Engineer (L1) | `/engineer` |
| `l2_engineer` | Engineer (L2) | `/engineer` |
| `l3_engineer` | Engineer (L3) | `/engineer` |
| `customer` | Customer | `/customer` |

### Feature Permissions

| Permission | super_admin | national_head | noc | state_planner | project_head | engineer* | customer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Approve customers | ✓ | ✓ | | | | | |
| Approve engineers | ✓ | ✓ | | | | | |
| Create tickets | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| Assign engineers | ✓ | ✓ | ✓ | ✓ | | | |
| View all tickets | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| Manage projects | ✓ | ✓ | | | ✓ | | |
| View reports | ✓ | ✓ | ✓ | ✓ | ✓ | | |

_*Applies to `engineer`, `l2_engineer`, and `l3_engineer`._

### Ticket Status Permissions

Each role can only set these statuses on a ticket:

| Role | Allowed Statuses |
|---|---|
| `super_admin` / `national_head` | open, assigned, in_progress, on_hold, resolved, pending_validation, closed, reopened |
| `state_planner` | assigned |
| `noc` | open, assigned, pending_validation, closed |
| `project_head` | pending_validation, closed |
| `engineer` / `l2_engineer` / `l3_engineer` | in_progress, resolved |
| `customer` | open |

---

## 5. Frontend (web-portal)

### 5.1 Architecture

The frontend is a SvelteKit application that acts as a thin shell around the Railway API. All `/api/*`, `/graphql`, `/upload`, and `/file/*` requests are proxied server-side via `hooks.server.ts` — the browser never calls Railway directly. This keeps cookies secure and avoids CORS issues.

```
Browser  →  SvelteKit (Vercel)  →  Railway API
               hooks.server.ts
               (proxy layer)
```

**Internal API routes** (handled by SvelteKit itself, not proxied):
- `/api/otp/*` — Nodemailer OTP email sender
- `/api/stream` — SSE real-time notification stream
- `/api/paginated/*` — server-side pagination helpers

### 5.2 Routing & Auth Guards

Each role section has a `+layout.ts` that validates the session and redirects unauthenticated users to `/login`.

| Route group | Guard file | Allowed roles |
|---|---|---|
| `/admin/*` | `routes/admin/+layout.ts` | `super_admin` |
| `/national-head/*` | `routes/(national_head)/+layout.ts` | `national_head` |
| `/project-head/*` | `routes/project-head/+layout.ts` | `project_head` |
| `/noc/*` | `routes/noc/+layout.ts` | `noc` |
| `/planner/*` | `routes/planner/+layout.ts` | `state_planner` |
| `/engineer/*` | `routes/engineer/+layout.ts` | `engineer`, `l2_engineer`, `l3_engineer` |
| `/customer/*` | `routes/customer/+layout.ts` | `customer` |
| `/data/*` | `routes/data/+layout.ts` | `super_admin` |
| `/profile/*` | `routes/profile/+layout.ts` | any authenticated user |

**Public paths** (no auth check): `/`, `/login`, `/auth`, `/unauthorized`, `/forgot-password`, `/reset-password`, `/customer/register`, `/onboarding/*`

The root `+layout.ts` calls `/api/auth/me` on every non-public navigation and populates `data.user`.

**Login redirect logic** (`lib/auth/redirectAfterLogin.ts`): after login, users are sent to `ROLE_REDIRECTS[role]` from the roles config.

### 5.3 API Layer

All API files live under `src/lib/api/`.

#### REST client (`lib/api/rest.ts`)
`restRequest<T>(path, init?)` — typed `fetch` wrapper that:
- Always sends `credentials: 'include'` (cookie auth)
- Sets `Content-Type: application/json` unless body is `FormData`
- Throws `ApiError` with `status` + optional `errors: ApiFieldError[]` on non-2xx
- Returns `{}` on 204 No Content

```typescript
import { restRequest, ApiError } from '$lib/api/rest';

const tickets = await restRequest<Ticket[]>('/api/tickets');
```

#### GraphQL client (`lib/api/graphql.ts`)
`gqlRequest(query, variables?)` — sends POST to `/graphql` with `credentials: 'include'`.

#### Upload client (`lib/api/upload.ts`)
`uploadFile(file: File) → Promise<number>` — returns the backend file ID.  
`fileUrl(id: number) → string` — returns `/file/{id}` for display.

#### Domain API modules

| File | Purpose |
|---|---|
| `api/admin.ts` | `fetchAdminDashboardData()`, user management |
| `api/tickets.ts` | `updateTicketStatus()`, `assignTicket()`, `escalateTicket()`, `validateTicket()`, `uploadTicketAttachment()` |
| `api/notifications.ts` | `fetchNotifications()`, mark read |
| `api/payouts.ts` | `fetchPayouts()`, export |
| `api/project-head.ts` | Project head dashboard queries |
| `api/rca.ts` | Root cause analysis CRUD |
| `api/replacements.ts` | Replacement request/approve/reject |
| `api/roles.ts` | Role assignment for users |
| `api/ticket-closure.ts` | Closure eligibility check |

### 5.4 State Management

Svelte stores at `src/lib/stores/`:

#### `authStore` (`stores/auth.ts`)
Central user/session state. Methods:
- `authStore.fetchUser()` — calls `/api/auth/me`, sets state
- `authStore.setUser(user)` — set from server-side load data
- `authStore.logout()` — calls `/api/auth/logout`, clears state, navigates to `/login`
- `authStore.clear()` — clear without API call

Derived stores: `user`, `isAuthenticated`, `role`

#### `notifications` (`stores/notifications.ts`)
In-browser notification list. Populated via SSE from `/api/stream`. Methods:
- `notifications.add(n)` — push new notification
- `notifications.markRead(id)` — mark single read
- `notifications.markAllRead()` — mark all read

Derived store: `unreadCount`

#### `queryVersion` (`stores/query.ts`)
Invalidation system for triggering reactive re-fetches. Call `invalidate('tickets')` after any mutation — components watching `queryVersion` will refetch.

#### `app.js` (`stores/app.js`)
Sidebar UI state only: `sidebarCollapsed`, `mobileOpen`.

### 5.5 Shared UI Components

All reusable components are in `src/lib/components/ui/` and exported from `lib/components/ui/index.ts`.

| Component | Purpose |
|---|---|
| `DashboardLayout.svelte` | Shell used by every role dashboard: sidebar, top bar, nav, notifications |
| `Modal.svelte` / `ModalHeader.svelte` / `ModalFooter.svelte` | Accessible modal dialog pattern |
| `Button.svelte` | Styled button with variants |
| `Input.svelte` | Form input with error state |
| `FormField.svelte` | Label + Input + error message wrapper |
| `Badge.svelte` | Status/role pill badge |
| `Spinner.svelte` | Loading indicator |
| `DetailRow.svelte` | Label: Value layout row |
| `Pagination.svelte` | Page navigation controls |
| `ConfirmModal.svelte` | Destructive-action confirmation dialog |
| `MaskedContact.svelte` | Shows phone/email with reveal toggle |

**DashboardLayout** drives navigation using the `NAV` record keyed by role. Active link highlighting uses exact-match for dashboard roots, prefix-match for sub-pages.

---

## 6. Backend (innoserve-api-test)

### 6.1 Server Architecture

The backend is a **Fastify** server with **GraphQL Yoga** mounted at `/graphql`. It is deployed on Railway and starts on `PORT` (default 4000).

```
Fastify app
├── Plugins: JWT, CORS, Multipart
├── REST routes (registered as Fastify plugins)
│   ├── authRoutes         /api/auth/*
│   ├── adminRoutes        /api/admin/*, /api/users/*
│   ├── customerRoutes     /api/customers/*
│   ├── projectRoutes      /api/projects/*
│   ├── ticketRoutes       /api/tickets/*, /api/replacements/*, /api/payouts/*
│   ├── engineerProfileRoutes  /api/engineer-profile/*
│   ├── userRoutes         /api/users/*
│   ├── inventoryRoutes    /api/inventory/*
│   ├── emailSecurityRoutes /api/email-security/*
│   ├── notificationRoutes /api/notifications/*
│   ├── otpRoutes          /api/otp/*
│   └── checkEmailRoutes   /api/check-email/*
├── POST /upload           File upload (public)
├── GET  /file/:id         File download (JWT-gated)
├── GET  /health           Health check
└── GraphQL Yoga at /graphql
```

### 6.2 Database Schema

Drizzle ORM with PostgreSQL, split into four Postgres schemas:

#### `auth` schema
| Table | Key Columns |
|---|---|
| `users` | id (UUIDv7), name, email (unique), phone, password (bcrypt), status (`pending`/`active`/`inactive`/`rejected`), avatarFileId |
| `user_roles` | userId, role |
| `roles` | role name |
| `notifications` | userId, title, message, read, type |

#### `ticket` schema
| Table | Key Columns |
|---|---|
| `tickets` | id (UUIDv7), ticketNumber (unique), projectId, categoryId, title, description, priority, status, state, city, pincode, address, assignedEngineerId, assignedStatePlannerId, escalationLevel, replacementRequested, replacementStatus, payoutAmount, slaDeadline, closedAt, source, messageId (unique, for email dedup), deleted |
| `ticket_categories` | id, name, payoutRate |
| `ticket_history` | ticketId, userId, action, previousStatus, newStatus, remarks |
| `attachments` | ticketId, fileId, type (`ir_report`/`site_image`) |
| `rcas` | ticketId, description, rootCause, correctiveAction |
| `customers` | id, userId, companyName, status |
| `engineer_profiles` | id, userId, state, city, skills, docStatus |
| `projects` | id, name, description, managedBy |
| `files` | id, filename, mimeType, data (bytea), uploadedBy |
| `routing_state` | state-level planner assignments |
| `email_allowlist` | approved sender emails for inbound tickets |
| `email_quota_config` | per-sender email rate limits |

#### `inventory` schema
| Table | Key Columns |
|---|---|
| `inventory_items` | id, name, sku (unique), quantity (≥0), location, assetType, serialNumber, purchaseDate, warrantyExpiry, expiryDate, ownershipType (`innoserve`/`customer`), customerId, status, replacedByItemId |
| `inventory_transactions` | itemId, type, quantity, performedBy |
| `inventory_audit_log` | itemId, action, changedBy |
| `inventory_maintenance` | itemId, scheduledAt, completedAt, notes |
| `inventory_location_history` | itemId, from, to, movedBy |
| `inventory_external_deployment` | itemId, deployedTo, deployedAt |
| `ticket_inventory` | ticketId, itemId (items used per ticket) |

### 6.3 REST API Reference

#### Auth (`/api/auth/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login with email + password, sets JWT cookie |
| POST | `/api/auth/logout` | Public | Clears JWT cookie |
| GET | `/api/auth/me` | JWT | Returns current user |
| POST | `/api/auth/forgot-password` | Public | Sends password reset email |
| POST | `/api/auth/reset-password` | Public | Resets password with token |
| POST | `/api/auth/change-password` | JWT | Changes current user's password |

#### Tickets (`/api/tickets/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/tickets` | JWT (any) | Create ticket |
| GET | `/api/tickets` | JWT | List tickets (filtered by role) |
| PATCH | `/api/tickets/:id/status` | JWT | Update ticket status |
| PATCH | `/api/tickets/:id/assign` | JWT (admin/noc/planner/national_head) | Assign engineer/planner |
| PATCH | `/api/tickets/:id/escalate` | JWT (staff + engineers) | Escalate ticket L1→L2→L3 |
| POST | `/api/tickets/:id/validate` | JWT (noc/project_head) | Validate resolved ticket |
| GET | `/api/tickets/:id/closure-eligibility` | JWT | Check if ticket can be closed |
| POST | `/api/tickets/:id/attachments` | JWT | Attach file to ticket |
| GET | `/api/tickets/:id/history` | JWT | Get ticket history log |
| POST | `/api/tickets/:id/history` | JWT | Add history entry |
| GET | `/api/tickets/:id/rca` | JWT | Get Root Cause Analysis |
| POST | `/api/tickets/:id/rca` | JWT | Create RCA |
| PATCH | `/api/tickets/:id/rca` | JWT | Update RCA |
| POST | `/api/tickets/:id/replacement-request` | JWT (engineer only) | Request part replacement |
| POST | `/api/email/inbound` | Public (webhook) | CloudMailin inbound email → ticket |

#### Replacements (`/api/replacements/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/replacements` | JWT | List replacement requests |
| POST | `/api/replacements/:id/approve` | JWT (noc) | Approve replacement |
| POST | `/api/replacements/:id/reject` | JWT (noc) | Reject replacement |
| PATCH | `/api/replacements/:id/dispatch` | JWT (noc/admin) | Mark dispatched |

#### Payouts

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/payouts` | JWT | List payout records |
| GET | `/api/payouts/export` | JWT | Download Excel payout report |
| GET | `/api/payout-rates` | JWT | List rates per ticket category |
| PUT | `/api/payout-rates/:categoryId` | JWT (admin) | Update payout rate |
| POST | `/api/ticket-categories` | JWT (admin) | Create ticket category |

#### Customers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/customers` | JWT | List customers |
| GET | `/api/customers/:id` | JWT | Customer detail |
| POST | `/api/customers` | Public (onboarding) | Register customer |
| PATCH | `/api/customers/:id/status` | JWT (admin/national_head) | Approve / reject |

#### Engineer Profiles

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/engineer-profile` | JWT | List engineer profiles |
| POST | `/api/engineer-profile` | Public (onboarding) | Submit engineer profile |
| PATCH | `/api/engineer-profile/:id/doc-status` | JWT (admin) | Approve / reject KYC docs |

#### Projects

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/projects` | JWT | List projects |
| POST | `/api/projects` | JWT (admin) | Create project |
| PUT | `/api/projects/:id` | JWT (admin) | Update project |
| DELETE | `/api/projects/:id` | JWT (admin) | Delete project |

#### Inventory

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/inventory` | JWT | List inventory items |
| POST | `/api/inventory` | JWT | Create item |
| PATCH | `/api/inventory/:id` | JWT | Update item |
| POST | `/api/inventory/:id/add-stock` | JWT | Add stock quantity |

#### Files

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/upload` | Public | Upload file (JPEG/PNG/WebP/PDF ≤10 MB), returns `{ id }` |
| GET | `/file/:id` | JWT (cookie) | Serve file inline (access-controlled) |

#### Other

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | `{ ok: true, service: "innoserve-api-test" }` |
| POST | `/api/dev/seed-users` | Public (non-prod) | Seed test users |
| GET | `/api/notifications` | JWT | List user's notifications |
| PATCH | `/api/notifications/:id/read` | JWT | Mark notification read |

### 6.4 GraphQL API

GraphQL is served at `/graphql` (GET and POST). Authentication is read from the JWT cookie and attached to context as `{ user }`.

The schema is built with `graphql-yoga` and covers:
- Users and roles
- Customers and engineer profiles
- Projects and ticket categories
- Tickets and ticket history
- Attachments
- Onboarding flows

### 6.5 Authentication

JWT-based authentication using HTTP-only cookies.

**Login flow:**
1. POST `/api/auth/login` with `{ email, password }`
2. Server verifies password with bcrypt, signs a JWT containing `{ id, email, role }`
3. JWT is set as an HTTP-only cookie named per `COOKIE_NAME` constant
4. All subsequent requests send the cookie automatically

**Middleware:**
- `authenticate` — verifies JWT cookie, attaches `req.user`; returns 401 if missing/invalid
- `authorize(roles[])` — checks `req.user.role` against allowed list; returns 403 if not in list
- Convenience guards: `onlySuperAdmin`, `onlyEngineer`, `onlyNoc`, `onlyStatePlanner`, `onlyProjectHead`, `onlyNationalHead`, `onlyStaff`

**GraphQL auth:** The Yoga context factory reads the cookie header directly and calls `app.jwt.verify()`. GraphQL resolvers must check `ctx.user` themselves.

### 6.6 File Handling

Files are stored as `bytea` in the `ticket.files` table (no external object storage).

**Upload:** POST `/upload` — public endpoint, MIME-type allowlist (JPEG, PNG, WebP, PDF), 10 MB cap. Returns `{ id: number }`.

**Serve:** GET `/file/:id` — requires valid JWT cookie. The service checks `canAccessFile(id, userId, role)` before streaming. Response includes `Cache-Control: private, max-age=86400`.

---

## 7. Ticket Lifecycle

```
           Customer / Staff
                 │
                 ▼
              OPEN
                 │
          (NOC/Planner assigns)
                 ▼
            ASSIGNED ──────────────── escalate ──► ESCALATED_L2
                 │                                        │
          (Engineer accepts)                        ESCALATED_L3
                 ▼                                        │
           IN_PROGRESS ◄───────────────────────────────────
                 │
          (Engineer requests part)
                 ▼
        PENDING_REPLACEMENT
                 │
          (NOC approves/rejects)
                 ▼
           IN_PROGRESS (continues)
                 │
          (Engineer resolves)
                 ▼
             RESOLVED
                 │
         (NOC / Project Head validates)
                 ▼
        PENDING_VALIDATION
                 │
          (Project Head closes)
                 ▼
              CLOSED
```

Additional states:
- `ON_HOLD` — paused; any staff can set
- `REOPENED` — re-opened after closure

---

## 8. Key Workflows

### New Customer Onboarding
1. Customer visits `/onboarding/customer` (public, no auth required)
2. Fills `CustomerOnboardingForm.svelte`, submits to POST `/api/customers`
3. Status is set to `pending`
4. Admin or National Head reviews at `/admin/customers` or `/national-head/customers`
5. PATCH `/api/customers/:id/status` → `active` or `rejected`

### New Engineer Onboarding
1. Engineer visits `/onboarding/engineer`
2. Fills `EngineerOnboardingForm.svelte`, uploads KYC documents via `/upload`
3. POSTs to `/api/engineer-profile`
4. Admin reviews docs, PATCH `/api/engineer-profile/:id/doc-status` → `approved`/`rejected`/`reupload`

### Creating a Ticket (Staff)
1. Staff with `canCreateTickets` permission opens `TicketForm.svelte`
2. Selects project, category, sets priority and location fields
3. POST `/api/tickets`
4. NOC assigns an engineer via PATCH `/api/tickets/:id/assign`

### Creating a Ticket via Email
1. CloudMailin webhook hits POST `/api/email/inbound`
2. Sender is checked against email allowlist; quota is enforced
3. Ticket is created automatically with `source: 'email'` and `messageId` for dedup

### Ticket Escalation
1. Engineer at `/engineer/tickets` opens ticket detail
2. Clicks "Escalate" → fills reason and optional L2/L3 engineer
3. PATCH `/api/tickets/:id/escalate` with `{ escalationLevel, remarks, engineerId? }`
4. Status moves to `escalated_l2` or `escalated_l3`

### Replacement Request
1. Engineer working on ticket clicks "Request Replacement"
2. POST `/api/tickets/:id/replacement-request`
3. Status → `pending_replacement`
4. NOC sees request at `/noc/replacements`
5. POST `/api/replacements/:id/approve` → stock assigned, status resumes `in_progress`
6. PATCH `/api/replacements/:id/dispatch` → marks item dispatched from inventory

---

## 9. Environment Variables

### Frontend (`web-portal/.env`)
| Variable | Default | Description |
|---|---|---|
| `PRIVATE_API_BASE_URL` | `https://api-production-7469.up.railway.app` | Railway API base URL |

### Backend (`innoserve-api-test/.env`)
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `CORS_ORIGIN` | No (default: `http://localhost:5173`) | Allowed CORS origin |
| `PORT` | No (default: `4000`) | HTTP server port |
| `NODE_ENV` | No | `production` disables auto-seed and dev routes |
| `SEED_ON_STARTUP` | No | Override seed behavior (`true`/`false`) |
| `RESEND_API_KEY` | Yes (for email) | Resend email API key |

---

## 10. Running the Project

### Frontend

```bash
cd web-portal
npm install
npm run dev          # Development server at http://localhost:5173
npm run build        # Production build
npm run check        # TypeScript + Svelte type check
npm run test:e2e     # Playwright end-to-end tests
```

### Backend

```bash
cd innoserve-api-test
npm install

# Database setup
npm run db:generate  # Generate Drizzle migration files
npm run db:migrate   # Run pending migrations
npm run db:seed      # Seed default users (dev only)
npm run db:studio    # Open Drizzle Studio GUI

# Development
npm run dev          # Start server with tsx hot-reload

# Production
npm run build        # Compile TypeScript
npm start            # Start from compiled dist/
```

---

## 11. Known Issues

### Active (Low severity)

**Profile sidebar role fallback** — [routes/profile/+layout.svelte:6](web-portal/src/routes/profile/+layout.svelte)  
`data.user?.role ?? 'engineer'` fallback. The `+layout.ts` guard always redirects unauthenticated users before render, so `data.user` is never null in practice. Code smell only, no functional impact.

### Resolved (Audit trail — 2026-05-24)

| Severity | Location | What was fixed |
|---|---|---|
| High | `lib/modules/data/Dashboard.svelte` | Was hardcoded stats; now calls live API |
| High | `routes/planner/+page.svelte` | Was showing "—"; now computes live ticket counts |
| Medium | `routes/customer/+page.svelte` | Was raw `fetch`; now uses `restRequest` |
| Low | `BulkUploadEngineersModal.svelte` | `<label role="button">` ARIA violation removed |
| Low | `routes/+page.svelte` | Unused Tailwind classes removed |
| Low | `lib/stores/index.ts` | Dead `toast` export (missing file) caused 1 TS error; removed |
| Various | `routes/data/+layout.ts` | Missing `super_admin` auth guard added |
| Various | `lib/api/upload.ts` | Missing `credentials: 'include'` added |
| Various | `lib/modules/data/customers/` | `pending_approval` status corrected to `'pending'` |
| Various | `lib/modules/data/reports/ReportsView.svelte` | Was hardcoded; now fetches live data |
| Various | `routes/(national_head)/national-head/dashboard/` | Was hardcoded; now calls `fetchAdminDashboardData()` |
| Various | `app.js` | Dead code (`currentPage`, `isLoggedIn`, `navigateTo()`) removed |
| Various | `lib/modules/data/payouts/queries.ts` | Duplicate `fetchPayouts` — file deleted |
