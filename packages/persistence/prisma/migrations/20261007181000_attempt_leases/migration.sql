-- Attempt IDs fence completion; lease expiry permits crash recovery.
ALTER TABLE "execution_attempts" ADD COLUMN "lease_expires_at" TIMESTAMPTZ(6);
