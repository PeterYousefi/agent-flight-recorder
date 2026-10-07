-- Atomic scheduling intent; duplicate publication after a crash is permitted.
CREATE TABLE "message_outbox" (
  "id" UUID NOT NULL PRIMARY KEY,
  "execution_id" UUID NOT NULL,
  "message" JSONB NOT NULL,
  "available_at" TIMESTAMPTZ(6) NOT NULL,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "message_outbox_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "message_outbox_published_at_available_at_idx" ON "message_outbox"("published_at", "available_at");
