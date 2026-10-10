# Threat Model & Vulnerability Analysis

## 1. System Topology & STRIDE Threat Matrix

Keynix components are categorized across five primary operational zones:
1. **Client UI & Cryptographic Engine (Browser)**
2. **Network & Transport Layer (HTTPS / TLS 1.3)**
3. **Application Server Layer (Next.js App Router API Routes)**
4. **Database & Storage Layer (PostgreSQL + Prisma)**
5. **Third-Party Dependencies & Infrastructure (npm, CDN, Vercel/Node)**

| STRIDE Threat Category | Affected Component | Threat Description | Primary Mitigation |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Client / Server Auth | Attacker impersonates a legitimate user to fetch encrypted vault snapshots. | Authentication via $K_{\text{auth}}$ derived from Master Password, server-side Argon2id hash check, session token signed with HTTP-only cookies. |
| **Tampering** | Vault Ciphertext | Attacker modifies ciphertext in DB or transit to alter decrypted output or trigger oracle attacks. | AES-256-GCM authenticated encryption with Tag validation and AAD binding (User ID, Item ID). |
| **Repudiation** | Server API Routes | User denies performing vault mutations or administrative actions. | Server-side audit logging of metadata (timestamp, user ID, event type) without logging plaintext or secrets. |
| **Information Disclosure** | Database / Transit / Memory | Plaintext vault items or keys are exposed via SQL injection, DB leak, or heap inspection. | E2EE with client-derived $K_{\text{master\_enc}}$, memory zeroization, HTTPS-only, no server-side plaintext persistence. |
| **Denial of Service** | API Routes / Auth | Attacker floods login or KDF endpoints to exhaust server memory/CPU or lock out users. | Redis-backed sliding-window rate limiting on login/register endpoints, IP-based & account-level throttling. |
| **Elevation of Privilege** | Server API / DB | Attacker manipulates vault item IDs in requests to access another user's encrypted items. | Server-side strict authorization checks enforcing `WHERE user_id = session.user_id` on every database query. |

---

## 2. In-Depth Attack Scenarios & Vector Analysis

### Scenario A: Full Database Snapshot Leakage (Stolen Backup / SQLi)
* **Attack Vector**: An attacker gains access to a complete dump of the PostgreSQL database containing `users` and `vault_items` tables.
* **Impact Analysis**:
  - The attacker obtains user emails, master salts, Argon2id/bcrypt hashes of $K_{\text{auth}}$, and encrypted vault items (`ciphertext`, `iv`, `tag`).
  - Because $P$ was never transmitted or stored, and $K_{\text{auth}} \neq K_{\text{master\_enc}}$, the attacker cannot decrypt `vault_items` directly from the database dump.
  - The attacker can perform an offline brute-force attack against $P$ using the stolen $K_{\text{auth}}$ hash or encrypted vault items.
* **Mitigation**:
  - Argon2id with high memory cost ($64\text{ MiB}, t=3, p=4$) applied client-side makes offline brute-forcing computationally prohibitive ($> \$100,000$ per weak password).
  - Strong client-side password strength rules enforced during registration/password change.

### Scenario B: Malicious Application Update / Compromised CDN Payload
* **Attack Vector**: An attacker compromises the hosting infrastructure (or Next.js deployment pipeline) and injects malicious JavaScript into the client bundle to capture $P$ during form input.
* **Impact Analysis**: High severity. In a browser password manager, if the delivered JavaScript is malicious, zero-knowledge encryption can be bypassed before key derivation occurs.
* **Mitigation**:
  - Enforce strict Content Security Policy (CSP) headers: `script-src 'self' 'nonce-...'`.
  - Immutable deployment pipelines with Subresource Integrity (SRI) hashes.
  - Optional client-side desktop wrapper (Electron/Tauri) with fixed code signing as a secondary distribution channel.

### Scenario C: Cross-Site Scripting (XSS) Stealing Memory Keys
* **Attack Vector**: A vulnerability in a third-party UI library allows arbitrary code execution in the browser context while the vault is unlocked.
* **Impact Analysis**: The malicious script accesses the V8 heap or Web Worker memory containing $K_{\text{vault}}$ or unencrypted item buffers.
* **Mitigation**:
  - Enable Trusted Types and strict CSP prohibiting `eval()` and inline scripts.
  - Use React's automatic JSX escaping; forbid `dangerouslySetInnerHTML`.
  - Perform key isolation inside an un-exported Web Worker closure.
  - Zeroize sensitive array buffers immediately after use.

### Scenario D: AES-GCM Nonce Reuse (Catastrophic Loss of Confidentiality)
* **Attack Vector**: An implementation bug causes the client to encrypt two distinct vault items under the same $K_{\text{vault}}$ using the same 96-bit nonce ($IV$).
* **Impact Analysis**: In AES-GCM, reusing a nonce under the same key allows an attacker to compute the XOR of the two plaintexts ($C_1 \oplus C_2 = P_1 \oplus P_2$) and recover the authentication key (GHASH key $H$), completely destroying confidentiality and authenticity.
* **Mitigation**:
  - Nonces MUST be generated using 96-bit CSPRNG (`crypto.getRandomValues()`).
  - Key hierarchy uses random intermediate $K_{\text{vault}}$ and individual item nonces.
  - Unit tests verify nonce uniqueness across $100,000$ consecutive simulated encryptions.

### Scenario E: Ciphertext Relocation & Parameter Swap Attack
* **Attack Vector**: An authenticated user (or malicious server) takes a valid encrypted vault item belonging to User A and swaps it into User B's vault record or moves it to a different item field.
* **Impact Analysis**: When User B attempts decryption, or User A decrypts in a different context, structural corruption occurs or information is revealed.
* **Mitigation**:
  - AES-GCM Associated Authenticated Data (AAD) is enforced for every item encryption.
  - AAD includes: `JSON.stringify({ itemId: "...", userId: "...", schemaVersion: 1 })`.
  - Decryption fails authenticated tag validation if ciphertext is moved or reassigned.

---

## 3. Defense-in-Depth Security Decisions

### Decision 2.1: Strict Content Security Policy (CSP) & Header Hardening
* **Threat Addressed**: XSS data exfiltration and inline script injection.
* **Assumptions**: Modern browsers strictly respect standard CSP headers.
* **Trade-Offs**: Disables inline analytics, external script widgets, and unsafe dynamic code evaluation.
* **Failure Modes**: Misconfigured CSP directives allow unauthorized script execution or block legitimate app chunk loading.
* **Testable Acceptance Criterion**: Security headers MUST score `A+` on securityheaders.com with directives: `default-src 'self'`, `script-src 'self' 'nonce-...'`, `object-src 'none'`, `frame-ancestors 'none'`, `connect-src 'self'`.

### Decision 2.2: Rate Limiting & Online Brute-Force Prevention
* **Threat Addressed**: Credential stuffing and online dictionary attacks against user accounts.
* **Assumptions**: Redis or distributed memory store tracks client IP addresses and user account identifiers accurately.
* **Trade-Offs**: Legitimate users behind NAT or shared corporate IPs could be throttled during high load.
* **Failure Modes**: Rate limiting bypass via IP spoofing (X-Forwarded-For headers if reverse proxy validation is missing).
* **Testable Acceptance Criterion**: The server MUST return HTTP 429 (Too Many Requests) after 5 failed authentication attempts within a 15-minute window for a specific account or IP address.

---

## 4. Unresolved Security Questions for Architecture Review

1. **Handling Compromised NPM Packages**: What automated dependency scanning tool (e.g., Socket.dev, Snyk, npm audit) will be embedded into the CI/CD pipeline to block supply chain attacks?
2. **CSP Nonce Delivery Strategy**: In Next.js App Router static/dynamic rendering, how will script nonces be generated per request without breaking server component caching?
