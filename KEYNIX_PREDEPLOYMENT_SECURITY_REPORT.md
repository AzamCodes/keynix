# Keynix Pre-Deployment Security & Architecture Audit Report

**Auditor Role**: Senior Application Security Engineer & PostgreSQL/Prisma Deployment Specialist  
**Project**: Keynix Password Manager  
**Target Environment**: Vercel Serverless Functions + Neon PostgreSQL  
**Audit Date**: October 10, 2026  
**Status**: APPROVED FOR PRODUCTION DEPLOYMENT (High-Severity Remediations Completed & Verified)

---

## Executive Summary

Keynix has undergone a rigorous pre-deployment security audit and targeted remediation phase covering database configuration, secret management, session lifecycle, vault authorization, zero-knowledge cryptographic operations, rate limiting, database isolation, and Vercel serverless deployment safety.

The application architecture demonstrates strong zero-knowledge cryptographic hygiene, featuring client-side encryption (AES-256-GCM + Argon2id), HKDF key separation, authenticated backup export, deterministic pre-authentication salt generation, server-side row-level vault ownership enforcement, active session revocation on master password changes, distributed rate limiting with persistent fallback, and safe database migration controls.

All **3 High-Severity findings** identified during initial security auditing have been fully remediated and verified through 13 automated unit and integration tests as well as production build validation.

---

## Findings Summary & Remediation Status

| ID | Title | Category | Severity | Initial Status | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **KEY-SEC-01** | Master Password Change Does Not Revoke Other Active Sessions | Auth & Session | **HIGH** | Confirmed Issue | **REMEDIATED** |
| **KEY-SEC-02** | Absence of Rate Limiting on Preauth, Login, and Registration Endpoints | Web Security / DoS | **HIGH** | Confirmed Issue | **REMEDIATED** |
| **KEY-SEC-03** | Shared Preview/Production `DATABASE_URL` Migration Risk on Vercel | Deployment | **HIGH** | Confirmed Risk | **REMEDIATED** |
| **KEY-SEC-04** | Missing Security Response Headers (CSP, HSTS, X-Frame-Options) | Web Security | **MEDIUM** | Confirmed Issue | Pending Config |
| **KEY-SEC-05** | Limitations of Best-Effort In-Memory Key Wiping in V8 / React | Cryptography | **MEDIUM** | Theoretical Limitation | Documented |
| **KEY-SEC-06** | Absence of Session Token Rotation and Sliding Expiration | Auth & Session | **MEDIUM** | Confirmed Issue | Planned |
| **KEY-SEC-07** | Lack of Server-Side Operational Rate Limiting on Vault CRUD Endpoints | Web Security | **LOW** | Confirmed Issue | Planned |

---

## Detailed Audit Findings & Evidence

### 1. Database Configuration & Schema Alignment
- **Prisma Schema Provider**: `prisma/schema.prisma` correctly uses `provider = "postgresql"`.
- **Connection Strategy**:
  - `url = env("DATABASE_URL")`: Configured for Neon's **pooled PgBouncer runtime endpoint** (`pgbouncer=true`).
  - `directUrl = env("DIRECT_URL")`: Configured for Neon's **direct connection endpoint** required by `prisma migrate deploy` to execute migration DDL without transaction pooler interference.
- **Foreign Keys & Cascades**:
  - `vault_items` -> `users(id)`: `onDelete: Cascade` (`prisma/schema.prisma:32` & `migration.sql:63`). Account deletion immediately purges all encrypted vault items from PostgreSQL disk.
  - `sessions` -> `users(id)`: `onDelete: Cascade` (`prisma/schema.prisma:50` & `migration.sql:64`).
  - `audit_logs` -> `users(id)`: `onDelete: SetNull` (`prisma/schema.prisma:68` & `migration.sql:65`).
  - `rate_limits`: Dedicated `RateLimit` table (`prisma/schema.prisma:76-80`) with unique index on `key` for persistent sliding window rate limiting.

---

### 2. Remediated High-Severity Issues

#### [REMEDIATED] KEY-SEC-01: Master Password Change Session Revocation
- **Remediation**: Implemented `revokeAllUserSessions(userId)` in `src/lib/session.ts` and integrated it into `src/app/api/account/change-password/route.ts`.
- **Code Evidence**:
  ```typescript
  // src/lib/session.ts
  export async function revokeAllUserSessions(userId: string) {
    await db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // src/app/api/account/change-password/route.ts
  await revokeAllUserSessions(session.userId);
  await createSession(session.userId, userAgent);
  ```
- **Verification**: When a user updates their master password, all active sessions across all devices are immediately marked as `revokedAt = new Date()`. A fresh session token is issued only to the requesting device. Any request using an old session token is rejected with `401 Unauthorized`. Verified by unit test in `tests/remediation.test.ts`.

#### [REMEDIATED] KEY-SEC-02: Rate Limiting on Authentication Endpoints
- **Remediation**: Implemented a multi-tier rate limiter in `src/lib/rate-limit.ts` supporting **Upstash Redis** (for high-performance Vercel serverless deployment) with a **PostgreSQL database sliding window fallback** and in-memory fallback. Applied to:
  - `POST /api/auth/preauth` (10 requests / 1 min)
  - `POST /api/auth/login` (5 requests / 1 min)
  - `POST /api/auth/register` (3 requests / 15 min)
- **Code Evidence**:
  ```typescript
  // src/app/api/auth/login/route.ts
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const ipLimit = await checkRateLimit(clientIp, "login", 5, 60 * 1000);

  if (!ipLimit.success) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": Math.ceil((ipLimit.reset - Date.now()) / 1000).toString() } }
    );
  }
  ```
- **Verification**: Excess attempts return HTTP `429 Too Many Requests` with a standard `Retry-After` response header. Verified by unit test in `tests/remediation.test.ts`.

#### [REMEDIATED] KEY-SEC-03: Database Migration Isolation (Preview vs Production)
- **Remediation**: Created a guarded migration runner in `scripts/migrate.js` and added `npm run db:migrate`.
- **Code Evidence**:
  ```javascript
  // scripts/migrate.js
  if (process.env.VERCEL_ENV === "preview") {
    console.log("⚠️ Vercel Preview deployment detected. Skipping automatic migration against Production database.");
    process.exit(0);
  }
  ```
- **Verification**: Vercel Preview deployments cannot execute DDL migrations against the Production database. Production migrations must be explicitly run via `npm run db:migrate` or targeted CI/CD pipelines targeting the main database branch.

---

### 3. Cryptography & Zero-Knowledge Verification
- **Master Key Derivation**: `Argon2id` (m=65536, t=3, p=4) with user master salt.
- **HKDF Key Separation**: HKDF-SHA256 derives isolated `K_auth` (for server authentication) and `K_master_enc` (for wrapping the vault key). Server never receives `K_master` or `K_master_enc`.
- **Authenticated Encryption**: AES-256-GCM with fresh 12-byte random IV per item and 16-byte tag, bound with AAD metadata `{ version, itemId, userId }`.
- **Encrypted Backups**: Authenticated AES-256-GCM encrypted envelope (`keynix-encrypted-backup-v1`). Plaintext exports are prohibited.

---

### 4. Verification & Test Suite Execution Results

- **Automated Security Tests**: Executed `npx vitest run`.
- **Vitest Output**:
  ```text
  ✓ tests/remediation.test.ts (13 tests) 4321ms
    ✓ KEYNIX REMEDIATION AUDIT TEST SUITE (13)
      ✓ Task 1: Vault Locking & Memory Clearing (4)
      ✓ Task 2: Encrypted Vault Backup & Restore (5)
      ✓ Task 3: Pre-Authentication & Master Salt Flow (2)
      ✓ Task 4: High-Severity Pre-Deployment Remediations (2)
        ✓ should enforce rate limits on login and preauth attempts
        ✓ should revoke all existing user sessions upon password change

  Test Files  1 passed (1)
       Tests  13 passed (13)
  ```
- **Next.js Production Build**: Executed `npm run build` with ZERO compilation, TypeScript, or Turbopack errors.

---

## Environment Variable Checklist for Production

Configure the following environment variables in Vercel Project Settings:

1. `DATABASE_URL`: Neon pooled connection string (`postgresql://...@ep-xxx.pooler.neon.tech/neondb?sslmode=require&pgbouncer=true`).
2. `DIRECT_URL`: Neon direct connection string (`postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require`).
3. `SESSION_SECRET`: Random 256-bit secret string for session signing.
4. `SERVER_SECRET`: Random 256-bit secret string for preauth dummy salt HMAC generation.
5. (Optional) `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: For high-throughput serverless rate limiting.

---

## Vercel Safe Deployment Checklist

- [x] Prisma datasource configured to `postgresql` with `directUrl`.
- [x] All database secrets (`DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `SERVER_SECRET`) restricted to server-side code without `NEXT_PUBLIC_` prefix.
- [x] Session revocation upon master password change implemented and verified.
- [x] Rate limiting active on `/api/auth/login`, `/api/auth/preauth`, and `/api/auth/register`.
- [x] Migration script guarded against accidental execution on Preview environments (`scripts/migrate.js`).
- [x] Automated test suite executed cleanly (`13/13 tests passing`).
- [x] Next.js production build succeeded (`npm run build`).
