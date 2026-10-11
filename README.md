# Keynix

Keynix is a browser-based password manager built with Next.js App Router,
TypeScript, Prisma, and PostgreSQL. Vault items are encrypted in the browser
before they are sent to the server. This repository is under active security
remediation.

> [!CAUTION]
> **This revision is not approved for production deployment.** Primary login
> still sends a reusable password-derived credential, existing V1 vault items
> do not bind their decrypted identity to the canonical database row ID, and
> the production build has not completed in the current environment. Password
> changes and account deletion intentionally return HTTP 501 until fresh,
> operation-bound authorization is available. See
> [`KEYNIX_PREDEPLOYMENT_SECURITY_REPORT.md`](KEYNIX_PREDEPLOYMENT_SECURITY_REPORT.md)
> and [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) for verified implementation
> details and remaining release gates.

## Architecture

- **Web application:** Next.js App Router, React, and TypeScript.
- **Database:** PostgreSQL through Prisma 6. The repository does not verify
  which hosted PostgreSQL provider or deployment environments are configured.
- **Browser cryptography:** Argon2id key derivation, HKDF-SHA-256, AES-GCM,
  BIP-39 recovery material, and encrypted backup support.
- **Authentication:** Database-backed sessions and a server-side HMAC verifier.
  The current primary login protocol is still a legacy reusable-credential
  flow. OPAQUE is used by recovery flows, not primary login.
- **Deployment target:** Vercel is a possible hosting target, but no checked-in
  deployment configuration verifies the current Vercel project, database
  mapping, environment variables, or release workflow.

The browser handles plaintext vault keys and decrypted item data while the
vault is unlocked. The server stores encrypted vault records and wrapped key
material. This design does not protect data from a compromised application
server or malicious JavaScript delivered to the browser.

## Requirements

- Node.js `>=20.9.0` (the installed Next.js version requires this range).
- npm.
- PostgreSQL for application runtime and Prisma migrations.
- A shared rate-limit service for a multi-instance deployment; this code
  supports Upstash Redis and a PostgreSQL-backed fallback.

## Local setup

1. Install the locked dependencies with `npm ci`.
2. Configure a local `.env` file with the required values for `DATABASE_URL`,
   `DIRECT_URL`, and `SESSION_SECRET`. Recovery flows also require a stable
   `OPAQUE_SERVER_SETUP`; deployed rate limiting should be configured with
   Upstash credentials. Keep all values private and server-only. Never use a
   production database for local development or tests.
3. Review the Prisma schema and migration history before preparing a local
   PostgreSQL database. The migration command has explicit target guards; it
   does not run automatically as part of `npm run build`.
4. Start the development server with `npm run dev` and open
   [http://localhost:3000](http://localhost:3000).

Do not point Prisma at `prisma/dev.db`: the application schema uses PostgreSQL,
and that SQLite artifact is tracked in Git and contains user, vault-item,
session, and audit-log rows. Its provenance and whether the data is synthetic
have not been established. Treat it as potentially sensitive; do not publish,
copy, or use it as a test database until its handling has been reviewed.

## Common commands

```bash
npm run dev       # Start the local Next.js development server
npm run lint      # Run ESLint
npm run build     # Generate Prisma Client and run the Next.js production build
npm run start     # Serve a successfully built production app
npm run db:migrate # Run the guarded Prisma migration wrapper
```

The repository has Vitest tests but no `test` npm script. With dependencies
already installed, run the suite using:

```bash
./node_modules/.bin/vitest run
```

`npm run db:migrate` is a database-changing operation. Read
[`scripts/migrate.js`](scripts/migrate.js), verify the target and migration
plan, and use only a disposable local or isolated staging database unless a
separately approved production release process authorizes otherwise. Preview
migrations are refused by the wrapper. No migration should be run against
Production without explicit approval.

## Vercel deployment status

Vercel deployment has **not** been validated from this repository. There is no
checked-in `vercel.json` or CI release pipeline, and project settings cannot
be inferred from source code. Before any staging deployment, independently
verify that:

- Preview and Production use separate PostgreSQL databases or isolated
  database branches and appropriately scoped credentials.
- `SESSION_SECRET` is a strong, stable server-only value of at least 32 bytes.
  Changing it can invalidate existing authentication hashes and encrypted
  transient recovery state; do not rotate it as a deployment experiment.
- `OPAQUE_SERVER_SETUP` is generated and provisioned securely, remains stable,
  and is never exposed to the browser. Changing it can invalidate existing
  OPAQUE recovery records.
- Shared rate limiting is configured and its failure behavior is tested.
- Database host, role, backup, restore, and migration procedures are reviewed
  privately. Never place connection strings in source, logs, or shell history.
- The build completes in the actual supported deployment environment and
  security headers, cookies, caching, and trusted proxy behavior are verified
  on an isolated staging deployment.

Do not deploy this checkout to Production. A passing lint or test suite does
not establish production security. The outstanding authentication, legacy
record integrity, tracked SQLite artifact, database-integration, and build
verification issues must be addressed before release review.

## Security reporting

Report security issues privately to the maintainers. Do not include real
passwords, recovery phrases, session cookies, database connection strings, or
other credentials in an issue or log. See [`AGENTS.md`](AGENTS.md) for
repository-specific coding and security guidance.
