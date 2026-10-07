-- Nullable for legacy rows: old keys without fingerprints cannot be safely reused.
ALTER TABLE "executions" ADD COLUMN "request_fingerprint" TEXT;
