# Account Recovery Strategy & Zero-Knowledge Preservations

## 1. Problem Statement & Zero-Knowledge Constraint

In traditional web applications, account recovery relies on server-managed password reset links sent via email or SMS. 

In a **Zero-Knowledge Architecture**, traditional password resets are **cryptographically impossible**:
- The server does not possess the keys required to decrypt the vault.
- If the server could reset the password and decrypt the vault on behalf of the user, it would mean the server holds a master decryption key or backdoor—completely invalidating the zero-knowledge security model.

Therefore, Keynix implements a **Client-Side Cryptographic Recovery Key** mechanism that allows password resetting **without creating a server backdoor or weakening zero-knowledge guarantees**.

---

## 2. Insecure Recovery Anti-Patterns (Explicitly Forbidden)

The following design anti-patterns are strictly **forbidden** in Keynix:
1. **Server-Side Master Key Escrow**: Storing a copy of $K_{\text{master\_enc}}$ encrypted by a server-side master key (HSM/KMS key). *Reason*: Admins or subpoenaed operators could decrypt user vaults without user consent.
2. **Email Magic-Link Vault Decryption**: Emailing a link that grants vault access. *Reason*: Compromising the user's email account allows total vault compromise.
3. **K-of-N Shamir Secret Sharing with Server as Guardian**: Storing secret shares on the server without explicit multi-party threshold execution. *Reason*: Introduces complex side-channel attack vectors.

---

## 3. Cryptographic Recovery Architecture

```
                    [ Registration Phase ]
                              |
                              +---------------------------------------+
                              |                                       |
                              v                                       v
                [ Derive K_master_enc from P ]           [ Generate Random Recovery Key (R) ]
                              |                          (256-bit CSPRNG / 24 BIP-39 words)
                              v                                       |
                [ Encrypt K_vault with K_master_enc ]                 v
                              |                         [ Derive K_rec via Argon2id(R) ]
                              v                                       |
              { Stored in DB: encrypted_vault_key }                   v
                                                        [ Encrypt K_vault with K_rec ]
                                                                      |
                                                                      v
                                                    { Stored in DB: recovery_encrypted_key }
```

### 3.1 Recovery Key Generation ($R$)
During account registration (or initial vault setup):
1. The client generates 256 bits of CSPRNG entropy:
   $$R = \text{crypto.getRandomValues(new Uint8Array(32))}$$
2. $R$ is formatted as a 24-word BIP-39 mnemonic phrase (or a 32-character Base32 Emergency Kit key).
3. The client derives a **Recovery Encryption Key** ($K_{\text{recovery\_enc}}$) from $R$:
   $$K_{\text{recovery\_enc}} = \text{Argon2id}\left(R, S_{\text{master}}, t=3, m=64\text{ MiB}, p=4\right)$$
4. The client encrypts the active Vault Key ($K_{\text{vault}}$) using $K_{\text{recovery\_enc}}$ via AES-256-GCM:
   $$C_{\text{rec}}, T_{\text{rec}} = \text{AES-GCM-Encrypt}\left(K_{\text{recovery\_enc}}, IV_{\text{rec}}, K_{\text{vault}}, AAD_{\text{rec}}\right)$$
   where $AAD_{\text{rec}} = \text{"keynix:v1:recovery\_key:"} \parallel \text{userId}$.
5. $C_{\text{rec}}$, $IV_{\text{rec}}$, and $T_{\text{rec}}$ are transmitted to the server and stored in `users.recovery_encrypted_key`.
6. The user is prompted to print or securely store their **Emergency Kit (PDF / Offline Paper Backup)** containing $R$.

---

## 4. Recovery Execution Workflow

When a user forgets their Master Password ($P$):

```
+-----------------------------------------------------------------------------------+
| RECOVERY EXECUTION (CLIENT-SIDE)                                                  |
|                                                                                   |
| 1. User inputs 24-word Recovery Key (R) into Emergency Recovery Page.            |
| 2. Client derives K_recovery_enc = Argon2id(R, S_master).                        |
| 3. Client fetches `recovery_encrypted_key` payload from server.                   |
| 4. Client decrypts K_vault = AES-GCM-Decrypt(K_recovery_enc, payload).            |
| 5. User inputs NEW Master Password (P_new).                                      |
| 6. Client derives NEW MK_new, K_auth_new, K_master_enc_new.                       |
| 7. Client re-encrypts K_vault under K_master_enc_new.                             |
| 8. Client generates NEW Recovery Key (R_new) and re-encrypts K_vault.            |
| 9. Client sends updated auth_hash, encrypted_vault_key, and recovery_encrypted_key|
|    to server in single atomic API transaction.                                   |
+-----------------------------------------------------------------------------------+
```

---

## 5. Nuclear Option: Unrecoverable Account Reset & Data Purge

If a user loses **both** their Master Password ($P$) and their Recovery Key ($R$):
- **Vault contents are cryptographically unrecoverable**.
- Keynix provides an **Account Reset Endpoint** (`POST /api/account/reset`):
  - Sends a confirmation token to the user's registered email address.
  - Upon email confirmation, the server executes `DELETE FROM users WHERE id = userId`.
  - Cascading SQL deletes all `vault_items`, `sessions`, and `encrypted_vault_key` records.
  - The user can then register a fresh account using the same email address.

---

## 6. Security Decisions & Formal Trade-Off Matrix

### Decision 6.1: High-Entropy Offline Recovery Key ($R$)
* **Threat Addressed**: Weak or guessable recovery answers (e.g., "Mother's maiden name") vulnerable to social engineering or OSINT dictionary attacks.
* **Assumptions**: 24-word BIP-39 mnemonic phrase contains 256 bits of entropy, making brute-force attacks mathematically impossible ($2^{256}$ search space).
* **Trade-Offs**: Requires user responsibility to store paper Emergency Kit physically.
* **Failure Modes**: User loses paper backup and forgets master password, resulting in permanent data loss.
* **Testable Acceptance Criterion**: Recovery key verification MUST require exact 256-bit entropy input; partial or invalid word phrases MUST be rejected client-side before key derivation.

### Decision 6.2: Automated Recovery Key Invalidation Post-Recovery
* **Threat Addressed**: Replay or theft of old recovery keys after an account recovery event.
* **Assumptions**: Generating a fresh $R_{\text{new}}$ on every recovery event ensures forward secrecy of old paper backups.
* **Trade-Offs**: User must download/print a new Emergency Kit after every password recovery event.
* **Failure Modes**: User relies on old Emergency Kit paper backup after performing a recovery.
* **Testable Acceptance Criterion**: Completing an account recovery MUST generate a new $R_{\text{new}}$ and update `recovery_encrypted_key` in the database, invalidating all previous recovery keys.

---

## 7. Unresolved Security Questions for Architecture Review

1. **Optional Multi-User Social Recovery**: Should Keynix support an optional Shamir Secret Sharing social recovery scheme for enterprise/teams, splitting $R$ into 3-of-5 trusted user shares? *Recommendation: Out of scope for v1. Keep single-user Emergency Kit.*
