-- Additive, nullable recovery protocol fields preserve existing account rows.
ALTER TABLE "users"
  ADD COLUMN "recovery_encrypted_key_v2" TEXT,
  ADD COLUMN "recovery_opaque_record" TEXT,
  ADD COLUMN "recovery_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "recovery_challenges" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "user_id" TEXT,
  "purpose" TEXT NOT NULL,
  "state_ciphertext" TEXT NOT NULL,
  "state_iv" TEXT NOT NULL,
  "recovery_version" INTEGER,
  "session_id" TEXT,
  "candidate_opaque_record" TEXT,
  "candidate_envelope" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recovery_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recovery_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recovery_challenges_token_hash_key"
  ON "recovery_challenges"("token_hash");
CREATE INDEX "recovery_challenges_user_id_purpose_expires_at_idx"
  ON "recovery_challenges"("user_id", "purpose", "expires_at");
