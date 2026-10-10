# Security Model & Architecture Guarantees

## 1. System Overview & Zero-Knowledge Security Goal

**Keynix** is a web-based, end-to-end encrypted (E2EE) password management system built using Next.js (App Router), TypeScript, PostgreSQL, Prisma, and the Web Crypto API (supplemented by Argon2id compiled to WebAssembly for client-side key derivation).

The core security goal of Keynix is to implement a **Zero-Knowledge Architecture**. In this architecture:
- The server host, database administrators, and network intermediaries never possess or receive the user's plaintext Master Password ($P$).
- The server host never receives or stores the unencrypted Master Encryption Key ($K_{\text{enc}}$) or intermediate Vault Symmetric Key ($K_{\text{vault}}$).
- The server never possesses the plaintext contents of any vault item (passwords, usernames, URLs, secure notes).
- All cryptographic key derivation, encryption, and decryption operations occur exclusively in the user's client browser execution context.

---

## 2. Trust Boundaries & Threat Agents

```
+-----------------------------------------------------------------------------------+
| CLIENT BROWSER EXECUTION CONTEXT (Untrusted Host, Trusted User Input)            |
|                                                                                   |
|  [ User Input (Master Password) ]                                                 |
|          |                                                                        |
|          v                                                                        |
|  [ Argon2id KDF Engine (Wasm) ] ---> Derives Master Key (MK)                     |
|          |                                                                        |
|          +-------------------------------------+                                  |
|          |                                     |                                  |
|          v                                     v                                  |
|  [ HKDF: Auth Key (K_auth) ]         [ HKDF: Master Enc Key (K_master_enc) ]      |
|          |                                     |                                  |
|          | (Transmitted over TLS)              v                                  |
|          |                           [ Decrypts Vault Key (K_vault) ]             |
|          |                                     |                                  |
|          |                                     v                                  |
|          |                           [ AES-256-GCM Decrypt Vault Items ]          |
+----------|-------------------------------------|----------------------------------+
           |                                     |
== HTTP / TLS BOUNDARY ==========================|===================================
           |                                     | (Encrypted Payloads & Nonces Only)
           v                                     v
+-----------------------------------------------------------------------------------+
| SERVER & INFRASTRUCTURE BOUNDARY (Untrusted for Confidentiality)                 |
|                                                                                   |
|  [ Next.js API Middleware / Route Handlers ]                                      |
|          |                                                                        |
|          v                                                                        |
|  [ Argon2id / bcrypt Hash Verification of K_auth ]                                |
|          |                                                                        |
|          v                                                                        |
|  [ PostgreSQL Database (Stores Hash, Salts, Encrypted Vault & Keys) ]            |
+-----------------------------------------------------------------------------------+
```

### 2.1 Threat Agents
1. **Malicious / Compromised Database Administrator (DBA)**: An attacker with full read/write access to PostgreSQL database dumps or live queries.
2. **Untrusted Server Infrastructure**: An attacker controlling the Next.js backend server or hosting environment, capable of inspecting memory or environment variables.
3. **Network Adversary (Man-in-the-Middle)**: An attacker sniffing or modifying traffic between client and server.
4. **Malicious / Compromised Dependency**: Malicious code injected into third-party `npm` dependencies executing in the client browser.
5. **Client-Side Attacker (Local Access / Cross-Site Scripting)**: An attacker executing arbitrary JavaScript in the victim browser tab or possessing physical/local access to the client device.

---

## 3. Core Architectural Guarantees

### Guarantee 1: Strict Separation of Authentication and Encryption
- **Mechanics**: The client derives two mathematically un-linkable cryptographic keys from the single Master Password ($P$) using HKDF-SHA-256 over a derived Master Key ($MK$).
- **Authentication Key ($K_{\text{auth}}$)**: Transmitted to the server over TLS to prove account ownership. The server performs a second-stage one-way hashing function (e.g., Argon2id/bcrypt) before storing it in the database.
- **Master Encryption Key ($K_{\text{master\_enc}}$)**: Kept strictly client-side to unwrap the symmetric Vault Key ($K_{\text{vault}}$). It is **never** sent across the network.

### Guarantee 2: Client-Side Authenticated Encryption
- All vault payloads are encrypted using **AES-256-GCM** on the client before network transmission.
- Every encrypted item payload includes a 128-bit authentication tag and explicit Associated Authenticated Data (AAD) binding the payload to the item ID, user ID, and vault schema version.

### Guarantee 3: Defense against Nonce Reuse
- Every AES-GCM encryption call generates a cryptographically random 96-bit (12-byte) initialization vector (IV/nonce) via `crypto.getRandomValues()`.
- Vault architectures support per-item keying and intermediate key rotation to maintain strict safety margins under NIST SP 800-38D bounds ($<2^{32}$ invocations per key).

---

## 4. Security Decisions & Formal Trade-Off Matrix

### Decision 1.1: Web Crypto API & Wasm Argon2id Execution Context
* **Threat Addressed**: Weak key derivation algorithms (e.g., single-iteration SHA-256) vulnerable to GPU-accelerated offline brute-force attacks against stolen database hashes.
* **Assumptions**: The browser supports WebAssembly and the W3C Web Crypto API (`crypto.subtle`).
* **Trade-Offs**: Argon2id execution consumes client memory ($m=64\text{ MiB}$) and CPU time ($\sim 300\text{--}800\text{ ms}$ on mobile/desktop), slightly slowing down user login.
* **Failure Modes**: Low-spec mobile browsers may experience memory allocation failure or UI thread freezing if Argon2id is executed without Web Workers.
* **Testable Acceptance Criterion**: The key derivation step must successfully complete using Argon2id ($m=64\text{ MiB}, t=3, p=4$) inside a background Web Worker without blocking the main UI thread, producing identical 256-bit derived keys for identical inputs.

### Decision 1.2: Strict In-Memory Ephemerality & Zeroization
* **Threat Addressed**: Cold boot attacks, heap inspection, or memory leakage of $MK$, $K_{\text{master\_enc}}$, and plaintext passwords.
* **Assumptions**: Modern JavaScript V8 engines allow array buffer zeroization via `.fill(0)`, though garbage collection timing cannot be guaranteed 100% deterministically.
* **Trade-Offs**: Developers must strictly manage key lifecycle using explicit `TypedArray` objects (`Uint8Array`) instead of immutable native JS strings.
* **Failure Modes**: Accidental conversion of key buffers to JavaScript strings creates immutable heap copies that linger until garbage collected.
* **Testable Acceptance Criterion**: All sensitive crypto buffers must be wrapped in a zeroization class whose `.dispose()` method executes `buffer.fill(0)` upon lock or tab unload, leaving zero key traces in memory references.

### Decision 1.3: Browser Security Limitations Acknowledgment
* **Threat Addressed**: False sense of absolute security in a browser environment.
* **Assumptions**: Browser environments inherently trust the server delivering the HTML/JS application bundles on each page load.
* **Trade-Offs**: Requires extensive HTTP security headers (strict CSP, HSTS, Subresource Integrity, Trusted Types) and server code signing/integrity checks.
* **Failure Modes**: If the backend server is compromised, an attacker can serve a modified `index.html` or `main.js` bundle that exfiltrates $P$ during typing.
* **Testable Acceptance Criterion**: The application MUST enforce Content Security Policy (CSP) headers that disallow unsafe-inline scripts, restrict script sources to hashed/signed origins, and mandate HTTPS via HSTS.

---

## 5. Unresolved Security Questions for Architecture Review

1. **Subresource Integrity (SRI) in Next.js App Router**: Next.js dynamically chunks code across routes. How do we best guarantee SRI hashes or deployment bundle signatures when client code changes during continuous deployments?
2. **Web Worker Crypto Persistence**: Should the unlocked $K_{\text{vault}}$ reside in a dedicated Web Worker memory closure or SharedWorker to isolate it from the DOM thread?
3. **Session Auto-Lock vs Browser State**: How should auto-lock behave when browser tabs are closed versus minimized, considering Page Visibility API limitations across desktop and mobile browsers?
