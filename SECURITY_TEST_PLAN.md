# Security Test Plan & Quality Assurance Gates

## 1. Security Testing Strategy & Scope

The security test plan for Keynix combines automated unit tests (Vitest), integration & API tests, and browser-level E2E tests (Playwright) to verify zero-knowledge guarantees, cryptographic correctness, input sanitization, and session hardening.

```
+-----------------------------------------------------------------------------------+
| AUTOMATED SECURITY QUALITY GATES                                                  |
+-----------------------------------------------------------------------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+------------------+           +------------------+           +------------------+
| 1. VITEST UNIT   |           | 2. API & SERVER  |           | 3. PLAYWRIGHT    |
|    CRYPTO TESTS  |           |    INTEGRATION   |           |    E2E ZERO-K    |
| - KDF Isolation  |           | - Zod Strict     |           | - Net Inspection |
| - AEAD Tag Check |           | - Ownership SQL  |           | - Auto-Lock E2E  |
| - Nonce Uniqueness           | - Rate Limits    |           | - CSP Validation |
| - Zeroization    |           | - CSRF Headers   |           | - Storage Audit  |
+------------------+           +------------------+           +------------------+
```

---

## 2. Unit Testing Specifications (Vitest)

### Test Suite 1: Key Derivation Function Isolation (`crypto/kdf.test.ts`)
* **Objective**: Guarantee that $K_{\text{auth}}$ and $K_{\text{master\_enc}}$ are derived deterministically, are strictly un-linkable, and never match.
* **Test Cases**:
  1. `test_argon2id_determinism`: Given identical password $P$ and salt $S_{\text{master}}$, Argon2id must produce identical 256-bit $MK$.
  2. `test_argon2id_salt_variance`: Given identical password $P$ and different salts $S_1 \neq S_2$, Argon2id must produce completely distinct outputs.
  3. `test_hkdf_subkey_separation`: $K_{\text{auth}}$ and $K_{\text{master\_enc}}$ derived from the same $MK$ MUST NOT share any identical bytes (`Buffer.compare(K_auth, K_master_enc) !== 0`).

### Test Suite 2: AEAD Encryption & Tag Verification (`crypto/aead.test.ts`)
* **Objective**: Validate AES-256-GCM encryption, decryption, and authentication tag enforcement.
* **Test Cases**:
  1. `test_aes_gcm_roundtrip`: Encrypting plaintext payload and decrypting with valid key, IV, and AAD must yield exact original plaintext.
  2. `test_tag_tampering_rejection`: Modifying a single bit in the 16-byte authentication tag MUST cause decryption to throw a `DOMException` (OperationError).
  3. `test_ciphertext_tampering_rejection`: Modifying a single byte in the ciphertext MUST fail tag validation.
  4. `test_aad_mismatch_rejection`: Decrypting ciphertext with altered AAD (e.g. changing `itemId` in metadata) MUST fail tag validation.

### Test Suite 3: Nonce Uniqueness & Collision Analysis (`crypto/nonce.test.ts`)
* **Objective**: Ensure $IV$ generation never produces duplicate nonces under the same key.
* **Test Cases**:
  1. `test_nonce_uniqueness_100k`: Generate 100,000 nonces using `crypto.getRandomValues()` and assert zero duplicate 96-bit arrays exist in the set.
  2. `test_nonce_length_enforcement`: Passing an IV of length $\neq 12\text{ bytes}$ to AES-GCM functions MUST throw an explicit error.

### Test Suite 4: In-Memory Zeroization (`crypto/memory.test.ts`)
* **Objective**: Verify zeroization methods zero out Uint8Array buffers.
* **Test Cases**:
  1. `test_buffer_zeroization`: Instantiating a key buffer, populating it with random bytes, calling `.dispose()` / `.fill(0)` MUST result in all elements equaling `0`.

---

## 3. Server & API Integration Testing (Vitest / Supertest)

### Test Suite 5: Zod Input Boundary Hardening (`api/validation.test.ts`)
* **Objective**: Reject malformed or unauthorized request parameters.
* **Test Cases**:
  1. `test_zod_strict_mode`: Sending extra key-value pairs in request bodies to `/api/auth/register` or `/api/vault/items` MUST return HTTP 400 Bad Request.
  2. `test_sql_injection_resilience`: Passing SQL escape sequences in email or ID parameters MUST be safely handled by Prisma without SQL syntax errors or data exposure.

### Test Suite 6: Ownership & Cross-Tenant Access (`api/authorization.test.ts`)
* **Objective**: Prevent horizontal privilege escalation between users.
* **Test Cases**:
  1. `test_cross_tenant_item_fetch`: User A attempts `GET /api/vault/items/[Item_B_ID]`. Server MUST return HTTP 404 or 403.
  2. `test_cross_tenant_item_delete`: User A attempts `DELETE /api/vault/items/[Item_B_ID]`. Server MUST return HTTP 404 or 403 and item MUST remain intact in database.

### Test Suite 7: Rate Limiting & CSRF Enforcement (`api/security_headers.test.ts`)
* **Objective**: Validate abuse protection mechanisms.
* **Test Cases**:
  1. `test_rate_limiter_auth`: Trigger 6 consecutive failed logins to `/api/auth/login` for the same account. The 6th request MUST return HTTP 429 Too Many Requests.
  2. `test_csrf_header_check`: Send `POST /api/vault/items` without `X-Keynix-Request: 1` header. Server MUST reject request with HTTP 403 Forbidden.

---

## 4. End-to-End Browser Testing (Playwright)

### Test Suite 8: Zero-Knowledge Network Interception (`e2e/zero_knowledge.spec.ts`)
* **Objective**: Verify via real browser network proxies that no secret key material crosses the wire.
* **Test Procedure**:
  1. Launch Playwright test runner with network request interception enabled.
  2. Perform user registration with Master Password `SuperSecretPassword123!`.
  3. Capture ALL outgoing HTTP request bodies, query strings, and headers sent to `http://localhost:3000`.
  4. Assert that the string `SuperSecretPassword123!` DOES NOT exist in any HTTP request payload.
  5. Create a vault item with password `MyTopSecretVaultPassword!`.
  6. Assert that `MyTopSecretVaultPassword!` DOES NOT exist in any network payload.
  7. Assert that outgoing payload contains ONLY encrypted base64/byte arrays and IVs.

### Test Suite 9: Vault Lock & Session Auto-Lock (`e2e/auto_lock.spec.ts`)
* **Objective**: Verify memory and UI locking behavior on idle or tab close.
* **Test Procedure**:
  1. Log in and unlock vault.
  2. Fast-forward browser clock by 15 minutes.
  3. Assert that vault UI shifts to Locked state.
  4. Assert that attempting to view items requires re-entering Master Password.
  5. Inspect `localStorage` and `sessionStorage` to verify $K_{\text{master\_enc}}$ and $K_{\text{vault}}$ are NOT stored in browser web storage.

---

## 5. Security Decision Test Acceptance Matrix

| Security Decision | Test File Target | Automation Tool | Required Outcome |
| :--- | :--- | :--- | :--- |
| **Two-Tier Key Derivation** | `crypto/kdf.test.ts` | Vitest | $K_{\text{auth}} \neq K_{\text{master\_enc}}$, 100% deterministic |
| **AES-GCM Tag Integrity** | `crypto/aead.test.ts` | Vitest | Tag tampering throws `OperationError` |
| **Zero Nonce Reuse** | `crypto/nonce.test.ts` | Vitest | 0 collisions in 100,000 runs |
| **Zero-Knowledge Transport** | `e2e/zero_knowledge.spec.ts` | Playwright | 0 occurrences of plaintext passwords in wire logs |
| **Cross-Tenant Isolation** | `api/authorization.test.ts` | Vitest | Unauthorized item queries return HTTP 404/403 |
| **Rate Limiting** | `api/security_headers.test.ts` | Vitest | 6th failed attempt returns HTTP 429 |
| **Strict Zod Input** | `api/validation.test.ts` | Vitest | Unknown fields yield HTTP 400 |

---

## 6. Unresolved Security Questions for Architecture Review

1. **Automated Penetration Testing in CI/CD**: Should OWASP ZAP automated scanner be executed against Next.js API endpoints as part of GitHub Actions PR checks? *Recommendation: Integrate OWASP ZAP baseline scan into CI pipeline.*
2. **Browser Storage Audit**: Should Playwright tests automatically fail if any key matching `*password*` or `*key*` is detected in `indexedDB`, `localStorage`, or `sessionStorage`? *Recommendation: Enforce strict storage assertion in Playwright teardown hooks.*
