# Keynix Project Context

This document describes the repository as inspected on 2026-10-11. Source code
and checked-in configuration are treated as authoritative. Design documents
describe intended properties, not proof that those properties are implemented
or independently validated.

## Project at a glance

- Next.js `16.4.0` App Router application using TypeScript and React `19.3.0`.
- Prisma `6.19.3` with a PostgreSQL datasource. The schema reads `DATABASE_URL`
  and `DIRECT_URL`.
- Browser-side vault cryptography uses Web Crypto, `hash-wasm` Argon2id, and
  `bip39`.
- The checked-in migration creates PostgreSQL tables. The repository names
  Neon and Vercel in an example environment file and migration script, but this
  checkout does not independently establish the currently deployed provider,
  environment values, or deployment status.

## Application architecture

The App Router UI lives under `src/app`. The landing, registration, login, and
dashboard pages use a client-side `VaultContext` to manage authentication
state, encrypted vault operations, and the in-memory unlocked vault key.
Route Handlers under `src/app/api` implement registration, pre-authentication,
login, session lookup, logout, account changes/deletion, and vault item CRUD.
Prisma access is centralized through `src/lib/db.ts`.

Important implementation files:

| File | Responsibility |
| --- | --- |
| `src/context/VaultContext.tsx` | Client registration/login/recovery flows, vault state, encryption calls, and inactivity lock. |
| `src/app/layout.tsx` | Root app layout and local Geist/Geist Mono font loading. |
| `src/lib/crypto.ts` | Argon2id and HKDF derivation, AES-GCM wrapping and item/backup encryption, versioned BIP-39 recovery wrapping, and password helpers. |
| `src/lib/recovery-protocol.ts` | OPAQUE setup access, normalized account identifiers, one-time challenge material, and authenticated encryption of transient OPAQUE server state. |
| `src/lib/session.ts` | Opaque session cookie creation, lookup, deletion, and database revocation. |
| `src/lib/server-auth.ts` | Server-side HMAC of the client-derived authentication key and constant-time comparison. |
| `src/lib/rate-limit.ts` | Upstash, database, then process-memory rate-limit backends. |
| `src/lib/db.ts` | Shared Prisma client instance. |
| `src/app/api/auth/*/route.ts` | Authentication and session handlers. |
| `src/app/api/auth/recovery/*/route.ts` | New-account recovery enrollment and sessionless recovery exchange. |
| `src/app/api/account/recovery/enroll/*/route.ts` | Session-bound legacy recovery material enrollment and rotation after primary credential proof. |
| `src/app/api/vault/items/route.ts` and `src/app/api/vault/items/[id]/route.ts` | Encrypted item storage and user-scoped reads/updates/deletes. |
| `src/app/api/account/*/route.ts` | Password change/recovery and account deletion. |
| `prisma/schema.prisma` | PostgreSQL model definitions and mappings. |
| `prisma/migrations/20261010000000_init_postgresql/migration.sql` | Initial PostgreSQL schema migration. |
| `scripts/migrate.js` | Fail-closed wrapper around `prisma migrate deploy`; requires an explicit target and host confirmation. |
| `next.config.ts` | Cache Components/partial prefetching and service worker/manifest response headers. |

## Data model

`prisma/schema.prisma` defines `User`, `VaultItem`, `Session`, `AuditLog`, and
`RateLimit`, mapped to `users`, `vault_items`, `sessions`, `audit_logs`, and
`rate_limits`. Vault ciphertext, IV, tag, and AAD metadata are stored as text
(the crypto helpers encode binary data as Base64); encrypted vault and recovery
keys are JSON strings on `User`. Session tokens are stored as SHA-256 hashes,
while a raw random token is placed in an HTTP-only, SameSite Strict cookie.
Vault item and session rows cascade on user deletion; audit rows become
unassociated (`SET NULL`). The checked-in schema uses string IDs, not native
PostgreSQL UUID columns.

## Security-sensitive behavior verified in code

- `deriveMasterKey` calls Argon2id with `m=65536 KiB`, `t=3`, `p=4`, and a
  32-byte output. The client derives an authentication value and a separate
  AES-GCM wrapping key from it using Web Crypto HKDF-SHA-256.
- The server computes `HMAC-SHA-256(SESSION_SECRET, authKey)` for its stored
  authentication hash. This is not server-side Argon2id or bcrypt. A legacy
  hard-coded fallback remains for `development` and `test`; Production and
  Preview reject missing, shorter-than-32-byte, known fallback, and selected
  placeholder values. This length/placeholder policy does not prove entropy.
  Existing account compatibility depends on retaining the configured secret
  used when each stored authentication hash was created.
- Vault keys and item payloads are encrypted using Web Crypto AES-GCM with
  random 12-byte IVs and 16-byte tags. Item payloads are padded to a 256-byte
  multiple and use serialized metadata as AAD.
- A 24-word BIP-39 phrase is generated and used to wrap the vault key. In the
  legacy v1 format the stored salt is unused; v2 recovery wrapping uses the
  salt as HKDF-SHA-256 input.
- New account registration stores an OPAQUE recovery registration record and
  an additive v2 AES-GCM vault-key wrapper. The v2 wrapper derives its key via
  HKDF-SHA-256 from the first 32 bytes of the BIP-39 seed, uses the stored
  random 16-byte salt, and binds ciphertext through account-specific HKDF info
  and AES-GCM AAD. Existing v1 wrapping remains readable with its old static
  AAD and seed-derived key. V1 accounts cannot use sessionless recovery until
  they enroll/rotate while logged in and prove the current primary credential.
- Sessionless recovery uses `@serenity-kit/opaque` 1.1.0. The server stores
  OPAQUE records, never the recovery phrase; short-lived challenge state is
  AES-GCM encrypted in the database and bound to challenge, purpose, account,
  and (for enrollment) session. Challenge tokens are stored only as hashes and
  consumed atomically. Recovery updates primary authentication material with a
  recovery-version compare-and-swap and revokes active sessions in one Prisma
  transaction. The additive migration
  `20261011000000_sessionless_recovery` has not been applied in this checkout.
  Recovery requires a stable server-only `OPAQUE_SERVER_SETUP`; changing it
  invalidates the OPAQUE recovery records. No deployed configuration is
  verified here.
- Encrypted backup export/import exists in `src/lib/crypto.ts` and is exposed
  in `SettingsModal.tsx`; it encrypts serialized items with a separately
  supplied password and AES-GCM.
- Session lifetime is eight hours. Session lookup checks expiry and revocation;
  logout revokes the current session, and password change revokes all active
  user sessions before creating a replacement session. However, password
  change and deletion currently authorize from a valid session alone; neither
  route verifies knowledge of the existing master credential.
- Rate limiting is called by pre-authentication, login, and registration
  routes. Configured Upstash limits are 10 pre-auth calls/minute, 5 login calls/
  minute, and 3 registration calls/15 minutes. If Upstash is unavailable, the
  code attempts an atomic PostgreSQL counter. In-process memory fallback is
  limited to local development/tests; Production and Preview fail closed if
  shared limiting storage is unavailable. Authenticated vault reads, writes,
  and deletes also have shared user-keyed limits.
- The vault context starts a 15-minute inactivity timer on unlock, resets it
  on pointer, keyboard, or touch input, and checks elapsed time on tab return.
  Session validity is rechecked on visibility return and every minute while
  authenticated. Locking clears provider data and dashboard modals. Key wiping
  remains best effort and cannot guarantee secure erasure in a garbage-collected
  runtime.
- State-changing API routes require an exact same-origin `Origin` header.
  Missing, malformed, and cross-origin values are rejected.
- Vault item reads and mutations are owner-scoped; update/delete mutations
  include the authenticated `userId`. New writes require AAD version 2 and
  align the database ID with the authenticated item ID. Legacy version 1 items
  remain readable and are not rewritten automatically; old-client V1 writes
  are rejected.
- Logout deletes the local cookie even if database revocation fails and
  returns an error when revocation cannot be confirmed.
- JSON auth and vault create/update handlers use bounded streaming reads
  (8–32 KiB for auth payloads, 1 MiB for vault item payloads). Password-change
  and account-delete routes currently fail closed with HTTP 501 because the
  primary authentication protocol has no fresh proof. A valid session alone
  cannot perform either operation.

These observations do not establish a formal zero-knowledge guarantee,
resistance to a compromised application bundle, or security of the deployed
service. The browser receives application code from the host. The repository's
`next.config.ts` adds basic browser security headers and `no-store` to API
responses, but does not configure CSP or HSTS. The design documents discuss stricter headers,
workers, and additional controls that are not visible in this configuration.

The root layout loads Geist and Geist Mono through `next/font/local` from font
assets bundled in the pinned Next.js package, so production builds do not fetch
Google Fonts. The asset paths are internal to Next.js rather than a public
font API; verify them when upgrading Next.js.

## Environment and database configuration

The Prisma datasource uses `DATABASE_URL` for runtime connections and
`DIRECT_URL` for direct Prisma CLI connections. `.env.example` contains
placeholders only and is not a usable connection configuration. `.env*` files
are ignored by Git. No actual local, Vercel Preview, or Vercel Production
database values can be verified from the tracked files; do not put credentials
or connection strings in this document.

| Environment | What repository code establishes | What remains environment-specific/unverified |
| --- | --- | --- |
| Local | Next.js loads root `.env*` files. Prisma needs the two datasource variables. `npm run db:migrate` runs the migration wrapper. | Which local env file is present, whether URLs target localhost or Neon, and whether a local PostgreSQL server is running. `prisma/dev.db` is present but is not used by the PostgreSQL schema. |
| Vercel Preview | `scripts/migrate.js` exits without migrating when `VERCEL_ENV=preview`. | The application still needs its own Preview `DATABASE_URL` and `DIRECT_URL`; the script's message says Preview should use a separate Neon branch, but repository configuration cannot confirm that it does. |
| Vercel Production | The migration wrapper can run `npx prisma migrate deploy` only after explicit Production target, Vercel environment, direct-host confirmation, and approval checks. The build script itself only generates Prisma Client and builds Next.js. | Vercel project settings, Neon branch/role, configured variables, build/install settings, and the actual deployment workflow are not checked into this repository. |

The environment variable names referenced in code/example configuration include
`DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `OPAQUE_SERVER_SETUP`,
`UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. The example also lists
`SERVER_SECRET`, but the current server authentication code uses `SESSION_SECRET`
for both HMAC and pre-auth dummy salts. Keep all values private and server-only;
never prefix them with `NEXT_PUBLIC_`. OPAQUE setup must be generated once and
preserved as a long-lived secret; provisioning and availability in Local,
Preview, and Production are operator/deployment facts not verifiable here.

The `db:migrate` script refuses to run without `KEYNIX_MIGRATION_TARGET` and
`KEYNIX_EXPECTED_DIRECT_DATABASE_HOST`, and compares the latter to the parsed
`DIRECT_URL` hostname without printing either. Preview migrations are always
refused; local migrations are limited to loopback database hosts. Production
requires `VERCEL_ENV=production`, the production target,
the same host confirmation, and the explicit
`KEYNIX_PRODUCTION_MIGRATION_APPROVAL` acknowledgement. These are guardrails,
not proof that an operator-selected host maps to the intended Neon branch;
verify branch and role mappings privately before any production migration.
Never pass real URLs in command-line arguments or print environment values.

## Development, build, lint, and test commands

Commands declared in `package.json`:

```bash
npm run dev
npm run build       # prisma generate && next build
npm run start
npm run lint        # eslint
npm run db:migrate  # node scripts/migrate.js
```

Testing configuration is present but limited:

- Vitest is configured by `vitest.config.ts`; its include patterns cover
  `src/**/*.test.ts` and `tests/**/*.test.ts`.
- The repository contains `tests/remediation.test.ts`, but `package.json` does
  not define a `test` script. Run `./node_modules/.bin/vitest run` when
  dependencies are already installed.
- Playwright is configured in `playwright.config.ts` to start `npm run dev`
  and look in `tests/e2e`, but no `tests/e2e` files are present in this checkout.
  `npx playwright test` therefore has configuration but no checked-in E2E
  suite to run.
- No test or build command was run while preparing this context document.
  Existing test assertions are not presented as independent test results.

## Deployment workflow visible in the repository

There is no checked-in Vercel configuration, CI workflow, or deployment
pipeline file in this checkout. The package build command runs Prisma Client
generation followed by `next build`; migration is a separate `npm run
db:migrate` command guarded by explicit target, direct-host confirmation, and
Production acknowledgement. A deliberate Production migration requires a
human operator to use an approved, protected release runner with Production
database variables, privately verify Vercel Production and Neon branch/role
mapping, set `VERCEL_ENV=production`, the target, and exact direct database
hostname, review the pending migration, and provide the explicit
acknowledgement before running the migration command. Do not copy connection
strings into shell history or logs. No release runner is checked in. Preview
migrations remain disabled. This procedure was documented only; no migration
was run. Actual Vercel build/install/deploy settings and Neon environment
mapping remain unverified in this checkout.

## Existing documentation and known discrepancies

The repository includes `SECURITY_MODEL.md`, `THREAT_MODEL.md`,
`CRYPTOGRAPHIC_DESIGN.md`, `DATABASE_DESIGN.md`, `API_SECURITY.md`,
`ACCOUNT_RECOVERY.md`, `SECURITY_TEST_PLAN.md`, and
`KEYNIX_PREDEPLOYMENT_SECURITY_REPORT.md`. Read these as design/reporting
material and compare claims with source before relying on them.

Discrepancies between the supplied project brief or existing design claims and
the inspected repository:

1. AES-256-GCM, client-side Argon2id, separate auth/wrapping keys, a BIP-39
   recovery phrase with an OPAQUE sessionless recovery protocol for enrolled
   v2 accounts, encrypted backups, database sessions/revocation,
   authentication rate limiting, and 15-minute idle locking have corresponding
   code paths. They are implemented behaviors, not independently verified
   production guarantees.
2. The server authentication hash is HMAC-SHA-256 with `SESSION_SECRET`, not
   Argon2id/bcrypt as some design documents state. Production and Preview
   reject missing, short, known fallback, and selected placeholder values.
   This check cannot establish entropy. Replacing a configured value breaks
   existing authentication hashes and encrypted challenge state.
3. The v1 recovery object contains a generated salt that is not used by its
   legacy derivation. Version 2 recovery wrapping uses its random salt in HKDF.
4. Some security documents describe Web Workers, strict CSP/HSTS, and
   `X-Keynix-Request` validation. No crypto worker, CSP/HSTS setup, or custom
   request-token header is configured. Same-origin Origin validation is
   implemented for mutations, but deployed-host behavior is not verified.
5. The rate limiter prefers Upstash, then PostgreSQL; memory is restricted to
   local development/tests, and Production/Preview fail closed when shared
   stores are unavailable. Authentication IP buckets still use forwarding
   headers whose trust behavior depends on the deployment proxy. Vault CRUD
   limits instead use the authenticated user ID.
6. Schema and migration use text IDs, not the UUID database types and richer
   binary column types described in parts of `DATABASE_DESIGN.md`.
7. Vercel and Neon are described by an example file and migration-script
   comments, but no deployment configuration or environment mapping verifies
   a current deployment. Preview migration refusal and explicit migration
   guardrails are code-verified; separate Neon branches and actual
   Local/Preview/Production values are not.
8. The reported production registration HTTP 500 and local `localhost:5432`
   Prisma issue cannot be confirmed or dismissed from the checked-in source;
   no logs or active local environment settings are available here. The
   registration handler catches failures and returns 500, while the schema
   chooses its host from environment variables.
9. The previous npm peer-dependency conflict is not represented by an existing
   report in the inspected code. A `package-lock.json` is checked in, but no
   install/build was run to confirm dependency resolution.
10. The repository contains Vitest unit tests, no `test` script, and no E2E
    test files under the configured Playwright directory. Assertions
    that simulate behavior are not proof of end-to-end integration or
    independently verified prior security fixes.
11. `KEYNIX_PREDEPLOYMENT_SECURITY_REPORT.md` claims Production approval and a
    successful build, but is an older report and conflicts with current source
    and recent verification. Do not rely on its readiness conclusion.
12. Password-change and account-delete routes now reject requests with HTTP
    501 because the primary login flow sends a reusable derived auth key and
    provides no fresh, operation-bound proof. The installed OPAQUE package is
    currently used for recovery only. A primary-auth migration still needs an
    explicit legacy enrollment, rollback, and old-client plan.
13. Sessionless recovery is implemented only for accounts with both an OPAQUE
    recovery record and v2 account-bound recovery wrapper. Legacy v1 accounts
    must use the authenticated enrollment flow; there is no weaker recovery
    fallback. OPAQUE setup format is checked, but deployed configuration is
    unknown.
14. Existing v1 encrypted items authenticate their stored AAD metadata but
    the client does not compare v1 AAD identity to the canonical database row
    ID. New V1 writes are rejected; old rows remain readable and no bulk
    migration was performed. Safe migration requires staged, resumable
    client-side verification and re-encryption while retaining old ciphertext
    until replacement read-back verification.
