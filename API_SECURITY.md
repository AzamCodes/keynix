# API Security & Server Architecture

## 1. Zero-Trust API Architecture

The Next.js App Router backend is treated as an **untrusted proxy** by the client, and conversely, the server treats **all incoming API requests as untrusted data**. 

Even though the server cannot decrypt vault payloads, it enforces strict authentication, authorization, ownership boundaries, input validation, and rate limiting on every route handler.

```
+----------------------------------------------------------------------------------+
| INCOMING HTTP REQUEST                                                            |
+----------------------------------------------------------------------------------+
                                         |
                                         v
+----------------------------------------------------------------------------------+
| 1. NEXT.JS MIDDLEWARE                                                            |
|    - Security Headers Injection (CSP, HSTS, X-Frame-Options)                     |
|    - CSRF Header Verification (`X-Keynix-Request: 1`)                             |
|    - IP & Global Sliding Window Rate Limiting                                    |
+----------------------------------------------------------------------------------+
                                         |
                                         v
+----------------------------------------------------------------------------------+
| 2. SESSION AUTHENTICATION LAYER                                                  |
|    - Extracts `keynix_session` Cookie (HttpOnly, Secure, SameSite=Strict)        |
|    - Hashes Token (SHA-256) and Queries `Session` Table                           |
|    - Validates Expiration & Revocation Status                                    |
+----------------------------------------------------------------------------------+
                                         |
                                         v
+----------------------------------------------------------------------------------+
| 3. ZOD RUNTIME INPUT VALIDATION                                                  |
|    - Validates Schema (Strict Mode: Disallows Unknown Fields)                    |
|    - Returns 400 Bad Request on Schema Mismatch                                  |
+----------------------------------------------------------------------------------+
                                         |
                                         v
+----------------------------------------------------------------------------------+
| 4. DOMAIN AUTHORIZATION & ROW-LEVEL OWNERSHIP ENFORCEMENT                        |
|    - Validates `userId` matches Session Owner (`where: { id, userId }`)          |
|    - Executes DB Mutation via Prisma                                             |
+----------------------------------------------------------------------------------+
                                         |
                                         v
+----------------------------------------------------------------------------------+
| 5. SANITIZED RESPONSE GENERATION                                                 |
|    - Returns Response with Zero Internal Error Stack Traces                      |
|    - Audit Event Logged (Metadata Only)                                          |
+----------------------------------------------------------------------------------+
```

---

## 2. API Endpoints Specification

### 2.1 Authentication Endpoints (`/api/auth/*`)

#### `POST /api/auth/register`
* **Request Body (Zod Validated)**:
  ```ts
  z.object({
    email: z.string().email().max(255),
    authKey: z.string().length(64), // Base64 or Hex 256-bit derived K_auth
    masterSalt: z.string().length(24), // Base64 16 bytes
    kdfParams: z.object({
      algorithm: z.literal("argon2id"),
      m: z.literal(65536),
      t: z.literal(3),
      p: z.literal(4),
    }),
    encryptedVaultKey: z.object({
      iv: z.string(),
      tag: z.string(),
      ciphertext: z.string(),
    }),
  }).strict()
  ```
* **Server Logic**:
  1. Verify email uniqueness.
  2. Compute `auth_hash = Argon2id(authKey, S_server)`.
  3. Create `User` row in DB.
  4. Issue session token cookie.

#### `POST /api/auth/login`
* **Request Body (Zod Validated)**:
  ```ts
  z.object({
    email: z.string().email(),
    authKey: z.string().length(64),
  }).strict()
  ```
* **Server Logic**:
  1. Retrieve user by email.
  2. Compare `Argon2id(authKey, S_server)` against `user.auth_hash` using constant-time comparison (`crypto.timingSafeEqual`).
  3. On success: Issue new session cookie, create `Session` row in DB.
  4. On failure: Increment failure counter, return 401 with generic `"Invalid credentials"` message.

#### `POST /api/auth/logout`
* **Server Logic**:
  1. Extract session token from cookie.
  2. Set `revokedAt = now()` in `Session` table.
  3. Clear HTTP-only session cookie.

#### `GET /api/auth/session`
* **Server Logic**: Validates active session and returns user metadata (`email`, `masterSalt`, `kdfParams`, `encryptedVaultKey`).

---

### 2.2 Vault Management Endpoints (`/api/vault/*`)

#### `GET /api/vault/items`
* **Server Logic**: Fetches all `VaultItem` records where `userId == session.userId`.

#### `POST /api/vault/items`
* **Request Body**:
  ```ts
  z.object({
    ciphertext: z.string(), // Base64
    iv: z.string(),         // Base64 12 bytes
    tag: z.string(),        // Base64 16 bytes
    aadMeta: z.object({
      itemId: z.string().uuid(),
      version: z.number().int(),
    }),
  }).strict()
  ```
* **Server Logic**: Verifies `aadMeta.userId` matches session, inserts new `VaultItem` bound to `session.userId`.

#### `PUT /api/vault/items/[id]`
* **Server Logic**: Updates item where `id == params.id AND userId == session.userId`.

#### `DELETE /api/vault/items/[id]`
* **Server Logic**: Deletes item where `id == params.id AND userId == session.userId`.

#### `POST /api/account/delete`
* **Server Logic**: Hard-deletes `User` row (triggering cascading SQL deletion of all items, sessions, and keys).

---

## 3. Session & Token Hardening Rules

1. **Opaque Token Generation**: Session tokens are 32-byte (256-bit) CSPRNG hex strings generated on the server (`crypto.randomBytes(32).toString('hex')`).
2. **Database Hashing**: The raw session token is never stored in the database. The server stores `SHA-256(sessionToken)` in `Session.tokenHash`.
3. **Cookie Configuration**:
   ```ts
   cookies().set('keynix_session', sessionToken, {
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production',
     sameSite: 'strict',
     path: '/',
     maxAge: 60 * 60 * 8, // 8 hours absolute expiration
   });
   ```
4. **CSRF Defense**: Require custom HTTP request header `X-Keynix-Request: 1` on all mutating routes (`POST`, `PUT`, `DELETE`). Next.js route handlers reject requests missing this header.

---

## 4. Security Decisions & Formal Trade-Off Matrix

### Decision 5.1: Strict Zod Input Validation with `.strict()`
* **Threat Addressed**: Parameter pollution, prototype pollution, and unknown payload field injection attacks.
* **Assumptions**: Zod strips or rejects any object keys not explicitly defined in the schema.
* **Trade-Offs**: Requires maintaining sync between frontend TypeScript types and backend Zod schemas.
* **Failure Modes**: Missing schema fields cause valid client requests to be rejected with 400 Bad Request.
* **Testable Acceptance Criterion**: Sending an API payload with an extra field (e.g., `{ "authKey": "...", "maliciousExtra": true }`) MUST be rejected by the server with HTTP 400.

### Decision 5.2: Constant-Time Authentication Hash Comparison
* **Threat Addressed**: Timing attacks on $K_{\text{auth}}$ comparison allowing an attacker to reconstruct valid authentication hashes byte-by-byte.
* **Assumptions**: `crypto.timingSafeEqual` prevents execution time variance based on string match position.
* **Trade-Offs**: None. Standard cryptographic best practice.
* **Failure Modes**: Comparing strings of unequal length throws an exception in `timingSafeEqual` (handled by pre-hashing or padding).
* **Testable Acceptance Criterion**: Authentication route timing MUST exhibit uniform distribution regardless of how many leading characters of `auth_hash` match.

---

## 5. Unresolved Security Questions for Architecture Review

1. **Session Idle Timeout vs Client Auto-Lock**: If the browser client auto-locks after 15 minutes of inactivity, should the server session cookie remain active for 8 hours, or should the server session also expire after 15 minutes of API inactivity? *Recommendation: Implement 15-minute sliding idle expiration on the server session as well.*
2. **Web Application Firewall (WAF) Integration**: Should API routes be protected by an upstream WAF (e.g., Cloudflare Workers / AWS WAF) for automated DDoS and bot mitigation?
