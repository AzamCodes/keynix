# Database Design & Relational Schema

## 1. Relational Schema Architecture

Keynix uses PostgreSQL as its primary datastore, managed via Prisma ORM. The database stores user authentication metadata, encrypted key envelopes, session states, audit logs, and encrypted vault items. 

At no point does the database contain unencrypted master passwords, unencrypted vault keys, or plaintext item payloads.

```
+---------------------------------------------------+
|                     User                          |
+---------------------------------------------------+
| PK  id                  UUID                      |
| U   email               VARCHAR(255)              |
|     auth_hash           VARCHAR(255)              |
|     master_salt         BYTEA / VARCHAR(64)       |
|     kdf_params          JSONB                     |
|     encrypted_vault_key JSONB                     |
|     recovery_enc_key    JSONB (Optional)          |
|     version             INT                       |
|     created_at          TIMESTAMPTZ               |
|     updated_at          TIMESTAMPTZ               |
+---------------------------------------------------+
          |                           |
          | 1:N                       | 1:N
          v                           v
+-----------------------+   +-----------------------+
|      VaultItem        |   |        Session        |
+-----------------------+   +-----------------------+
| PK  id          UUID  |   | PK  id          UUID  |
| FK  user_id     UUID  |   | FK  user_id     UUID  |
|     ciphertext  BYTEA |   | U   token_hash  STR   |
|     iv          BYTEA |   |     ip_address  INET  |
|     tag         BYTEA |   |     user_agent  STR   |
|     aad_meta    JSONB |   |     expires_at  TZ    |
|     version     INT   |   |     revoked_at  TZ    |
|     created_at  TZ    |   +-----------------------+
|     updated_at  TZ    |
+-----------------------+
```

---

## 2. Complete Prisma Schema Definition (`schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id                  String      @id @default(uuid()) @db.Uuid
  email               String      @unique @db.VarChar(255)
  authHash            String      @map("auth_hash") @db.VarChar(255)
  masterSalt          String      @map("master_salt") @db.VarChar(64) // Base64 16 bytes
  kdfParams           Json        @map("kdf_params") // { algorithm: "argon2id", m: 65536, t: 3, p: 4 }
  encryptedVaultKey   Json        @map("encrypted_vault_key") // { iv, tag, ciphertext }
  recoveryEncryptedKey Json?      @map("recovery_encrypted_key") // { iv, tag, ciphertext }
  version             Int         @default(1)
  createdAt           DateTime    @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt           DateTime    @updatedAt @map("updated_at") @db.Timestamptz()

  vaultItems          VaultItem[]
  sessions            Session[]
  auditLogs           AuditLog[]

  @@map("users")
}

model VaultItem {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  ciphertext  Bytes    @db.ByteA // AES-256-GCM Payload
  iv          Bytes    @db.ByteA // 12 bytes
  tag         Bytes    @db.ByteA // 16 bytes
  aadMeta     Json     @map("aad_meta") // { version: 1, itemId: "...", userId: "..." }
  
  version     Int      @default(1)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@index([userId])
  @@map("vault_items")
}

model Session {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  tokenHash   String    @unique @map("token_hash") @db.VarChar(64) // SHA-256 of session token
  ipAddress   String?   @map("ip_address") @db.VarChar(45)
  userAgent   String?   @map("user_agent") @db.Text
  
  expiresAt   DateTime  @map("expires_at") @db.Timestamptz()
  revokedAt   DateTime? @map("revoked_at") @db.Timestamptz()
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  @@index([userId])
  @@index([tokenHash])
  @@map("sessions")
}

model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String?  @map("user_id") @db.Uuid
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  
  eventType String   @map("event_type") @db.VarChar(64) // e.g. "AUTH_SUCCESS", "VAULT_SYNC"
  ipAddress String?  @map("ip_address") @db.VarChar(45)
  userAgent String?  @map("user_agent") @db.Text
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@index([userId])
  @@index([eventType])
  @@map("audit_logs")
}
```

---

## 3. Data Integrity & Ownership Isolation

1. **Foreign Key Cascade Constraints**:
   - `VaultItem` and `Session` records are linked to `User` with `onDelete: Cascade`. Deleting a user account automatically scrubs all associated vault items, sessions, and encrypted keys from PostgreSQL storage.
2. **Server-Side Row-Level Ownership Enforcement**:
   - PostgreSQL queries MUST NEVER perform parameterless or un-scoped queries on `vault_items`.
   - Every Prisma read, update, or delete operation MUST include `where: { id: itemId, userId: authenticatedSession.userId }`.
3. **Prevention of Side-Channel Information Leakage**:
   - **Ciphertext Length Padding**: Small plaintexts (e.g., short 4-character passwords vs long 64-character API keys) leak length information through AES-GCM ciphertext byte sizes.
   - **Mitigation**: The client application pads all plaintexts to fixed block size increments (e.g., 256 bytes or 512 bytes) prior to encryption, ensuring ciphertexts do not reveal password length.

---

## 4. Security Decisions & Formal Trade-Off Matrix

### Decision 4.1: Database-Enforced Binary Storage for IV, Tag, and Ciphertext
* **Threat Addressed**: Performance overhead and Base64 string decoding vulnerabilities.
* **Assumptions**: PostgreSQL native `BYTEA` type efficiently handles binary arrays without text encoding overhead.
* **Trade-Offs**: Requires Prisma custom conversions (`Buffer` / `Uint8Array`) between Node.js API handlers and DB layer.
* **Failure Modes**: Misinterpreting binary buffers as UTF-8 strings corrupts binary ciphertext tags.
* **Testable Acceptance Criterion**: Storing and retrieving binary ciphertext buffers through Prisma MUST preserve exact byte equality (`Buffer.compare(original, retrieved) === 0`).

### Decision 4.2: Structured Non-Sensitive Audit Logging
* **Threat Addressed**: Log injection attacks and accidental leakage of vault metadata or auth keys into DB audit tables.
* **Assumptions**: `AuditLog` table strictly records system event enumerations (`AUTH_LOGIN_SUCCESS`, `VAULT_ITEM_CREATED`) without request bodies or payload parameters.
* **Trade-Offs**: Reduces deep debugging capability for failed user operations.
* **Failure Modes**: Developer error introducing `JSON.stringify(request.body)` into audit log calls.
* **Testable Acceptance Criterion**: Automated AST linting rules MUST forbid passing request body objects or key parameters into `prisma.auditLog.create()`.

---

## 5. Unresolved Security Questions for Architecture Review

1. **Database Encryption at Rest**: Should PostgreSQL utilize transparent data encryption (TDE) or cloud provider volume-level encryption (AWS EBS / GCP KMS) as an extra layer of defense for non-vault tables (`users`, `sessions`)? *Recommendation: Enforce KMS volume encryption.*
2. **Database Soft-Delete vs Hard-Delete**: Should vault item deletion perform immediate SQL `DELETE` or soft-delete with a 30-day purge queue? *Zero-knowledge recommendation: Immediate hard-delete to enforce immediate cryptographic data destruction.*
