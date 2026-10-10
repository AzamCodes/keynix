# Cryptographic Design & Key Hierarchy

## 1. Cryptographic Primitives & Standards

Keynix uses standard, non-customized, peer-reviewed cryptographic primitives enforced by NIST and standard browser implementations:

| Function | Primitive / Algorithm | Parameter Specification |
| :--- | :--- | :--- |
| **Primary Key Derivation (KDF1)** | Argon2id | $t=3$ iterations, $m=64\text{ MiB}$ ($65536\text{ KiB}$), $p=4$ parallelism, hash length $= 32\text{ bytes}$ (256 bits) |
| **Subkey Expansion (KDF2)** | HKDF-SHA-256 | RFC 5869 compliant, salt $=$ 32-byte zero buffer or KDF1 output, output $= 32\text{ bytes}$ |
| **Authenticated Encryption (AEAD)** | AES-256-GCM | 256-bit key length, 96-bit (12-byte) IV, 128-bit (16-byte) Authentication Tag |
| **Random Number Generator (CSPRNG)** | Web Crypto API | `crypto.getRandomValues()` |
| **Server-Side Authentication Hashing** | Argon2id / bcrypt | Argon2id ($t=2, m=19\text{ MiB}, p=1$) or bcrypt ($cost=12$) |

---

## 2. Key Hierarchy Architecture & Mathematical Specification

```
                          [ Master Password (P) ]
                                     |
                                     v
   [ Master Salt (S_master) ] ----> [ Argon2id KDF ]
   (16 bytes CSPRNG)                 |
                                     v
                           [ Master Key (MK) ] (256 bits)
                                     |
                +--------------------+--------------------+
                |                                         |
                v                                         v
   [ HKDF-Expand (Info: "keynix:v1:auth") ]  [ HKDF-Expand (Info: "keynix:v1:master_enc") ]
                |                                         |
                v                                         v
    [ Auth Key (K_auth) ] (256 bits)         [ Master Encryption Key (K_master_enc) ] (256 bits)
                |                                         |
                | (Sent to Server over TLS)               v (Client-Only)
                v                            [ AES-256-GCM Unwraps Encrypted Vault Key ]
    [ Server Hashes with Argon2id ]                       |
                |                                         v
                v                            [ Vault Symmetric Key (K_vault) ] (256 bits)
    [ Stored in DB: auth_hash ]                           |
                                                          v
                                             [ AES-256-GCM Encrypts Vault Item Payload ]
```

### Step 1: Master Key Derivation ($MK$)
From the user's Master Password ($P$) and a unique 16-byte CSPRNG Master Salt ($S_{\text{master}}$):
$$MK = \text{Argon2id}\left(P, S_{\text{master}}, t=3, m=64\text{ MiB}, p=4, \text{keyLen}=32\text{ bytes}\right)$$

### Step 2: Key Splitting & Subkey Derivation ($K_{\text{auth}}$ and $K_{\text{master\_enc}}$)
Using HKDF-SHA-256 (RFC 5869) with $MK$ as the Pseudo-Random Key ($PRK$):

1. **Authentication Key ($K_{\text{auth}}$)**:
   $$K_{\text{auth}} = \text{HKDF-Expand}\left(MK, \text{info} = \text{"keynix:v1:auth"}, L = 32\right)$$
   *Purpose*: Proves identity to the server during authentication. Never used for encryption.

2. **Master Encryption Key ($K_{\text{master\_enc}}$)**:
   $$K_{\text{master\_enc}} = \text{HKDF-Expand}\left(MK, \text{info} = \text{"keynix:v1:master\_enc"}, L = 32\right)$$
   *Purpose*: Client-side key wrapping key used to encrypt and decrypt $K_{\text{vault}}$. Never transmitted to the server.

### Step 3: Server Hashing of $K_{\text{auth}}$
When $K_{\text{auth}}$ arrives at the Next.js backend over TLS:
$$\text{auth\_hash} = \text{Argon2id}_{\text{server}}\left(K_{\text{auth}}, S_{\text{server}}, t=2, m=19\text{ MiB}, p=1\right)$$
*Purpose*: Prevents a database breach from exposing raw $K_{\text{auth}}$ values that would allow an attacker to log into the account without knowing $P$.

### Step 4: Vault Key Wrapping ($K_{\text{vault}}$)
To support fast Master Password changes without re-encrypting every individual vault item:
1. During registration, the client generates a random 256-bit **Vault Key** ($K_{\text{vault}}$) using CSPRNG.
2. The client encrypts $K_{\text{vault}}$ using $K_{\text{master\_enc}}$ via AES-256-GCM:
   $$C_{\text{vkey}}, T_{\text{vkey}} = \text{AES-GCM-Encrypt}\left(K_{\text{master\_enc}}, IV_{\text{vkey}}, K_{\text{vault}}, AAD_{\text{vkey}}\right)$$
   where $AAD_{\text{vkey}} = \text{"keynix:v1:vault\_key:"} \parallel \text{userId}$.
3. $C_{\text{vkey}}$, $IV_{\text{vkey}}$, and $T_{\text{vkey}}$ are sent to the server and stored in `users.encrypted_vault_key`.

*Master Password Change Procedure*:
When the user updates $P \to P_{\text{new}}$:
- Client derives $K_{\text{master\_enc}}^{\text{new}}$.
- Client re-encrypts $K_{\text{vault}}$ under $K_{\text{master\_enc}}^{\text{new}}$ to produce $C_{\text{vkey}}^{\text{new}}$.
- Client sends updated $C_{\text{vkey}}^{\text{new}}$ and new $K_{\text{auth}}^{\text{new}}$ hash to server. Vault items do **not** need re-encryption.

### Step 5: Vault Item Payload Encryption
For each vault item (credentials, secure notes, card details):
1. Payload object is serialized to UTF-8 JSON:
   $$\text{Plaintext} = \text{JSON.stringify}\left(\{ \text{title}, \text{username}, \text{password}, \text{url}, \text{notes} \}\right)$$
2. Generate 96-bit CSPRNG Initialization Vector ($IV_{\text{item}}$).
3. Compute Associated Authenticated Data ($AAD_{\text{item}}$):
   $$AAD_{\text{item}} = \text{JSON.stringify}\left(\{ \text{itemId}, \text{userId}, \text{version}: 1 \}\right)$$
4. Encrypt payload:
   $$C_{\text{item}}, T_{\text{item}} = \text{AES-GCM-Encrypt}\left(K_{\text{vault}}, IV_{\text{item}}, \text{Plaintext}, AAD_{\text{item}}\right)$$
5. Store $C_{\text{item}}$, $IV_{\text{item}}$, and $T_{\text{item}}$ in database table `vault_items`.

---

## 3. Nonce & Salt Generation Rules

1. **Master Salt ($S_{\text{master}}$)**: Must be 16 bytes (128 bits) minimum, generated via `crypto.getRandomValues(new Uint8Array(16))`. Uniquely generated per user at registration.
2. **AES-GCM IV ($IV$)**: Must be strictly 12 bytes (96 bits) generated via `crypto.getRandomValues(new Uint8Array(12))`.
   - **NIST SP 800-38D Compliance**: A 96-bit random IV ensures that the probability of IV collision under the same key remains below $2^{-32}$ for up to $2^{32}$ encryptions.
   - **Guaranteed Uniqueness**: Every encryption operation (whether item creation, update, or key wrapping) MUST fetch fresh randomness. Static or incrementing nonces without persistent state counters are strictly prohibited to prevent browser state desynchronization bugs.

---

## 4. Cryptographic Envelope & Versioning Format

All encrypted payloads stored in the database or transmitted across APIs are encapsulated in a standardized JSON cryptographic envelope:

```json
{
  "version": 1,
  "cipher": "AES-256-GCM",
  "iv": "base64_encoded_12_bytes",
  "tag": "base64_encoded_16_bytes",
  "ciphertext": "base64_encoded_payload",
  "aad": {
    "itemId": "uuid-v4",
    "userId": "uuid-v4",
    "version": 1
  }
}
```

---

## 5. Security Decisions & Formal Trade-Off Matrix

### Decision 3.1: Two-Tier Key Architecture (Intermediate Vault Key $K_{\text{vault}}$)
* **Threat Addressed**: Performance bottleneck and potential data corruption during Master Password changes across large vaults.
* **Assumptions**: Client can safely wrap/unwrap $K_{\text{vault}}$ in memory using $K_{\text{master\_enc}}$.
* **Trade-Offs**: Adds one extra AES-GCM decryption layer during vault unlock.
* **Failure Modes**: Corruption of `encrypted_vault_key` renders the entire vault inaccessible (mitigated by versioned backups).
* **Testable Acceptance Criterion**: Changing the master password MUST update `users.encrypted_vault_key` and `users.auth_hash` in a single atomic database transaction without modifying any record in `vault_items`.

### Decision 3.2: Strict Associated Authenticated Data (AAD) Binding
* **Threat Addressed**: Ciphertext swapping, item transposition, or cross-tenant payload migration attacks by compromised server/DBA.
* **Assumptions**: AES-GCM tag verification fails if any byte in AAD or ciphertext is modified.
* **Trade-Offs**: Client must construct identical AAD context objects during both encryption and decryption.
* **Failure Modes**: Mismatched AAD parameters during client UI refactoring will cause tag validation errors and failed item decryptions.
* **Testable Acceptance Criterion**: Decrypting a valid ciphertext with a modified `itemId` or `userId` in the AAD MUST throw a `DOMException` (OperationError) and refuse to return plaintext.

---

## 6. Unresolved Security Questions for Architecture Review

1. **Wasm Argon2id Fallback**: In legacy browsers or restrictive web workers where WebAssembly is disabled, should the application fail shut or fallback to Web Crypto PBKDF2-HMAC-SHA256 ($600,000$ iterations)? *Recommendation: Fail shut to enforce zero-knowledge strength.*
2. **Buffer Zeroization Guarantee in V8**: Since JS engine garbage collection is non-deterministic, should key operations be confined entirely to C/Rust compiled to WebAssembly where memory zeroization can be guaranteed?
