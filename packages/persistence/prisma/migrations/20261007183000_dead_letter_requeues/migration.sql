-- Requeue relationships are separate facts; historical dead-letter rows remain unchanged.
CREATE TABLE "dead_letter_requeues" (
  "id" UUID NOT NULL PRIMARY KEY,
  "dead_letter_id" UUID NOT NULL UNIQUE,
  "new_execution_id" UUID NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "dead_letter_requeues_dead_letter_id_fkey" FOREIGN KEY ("dead_letter_id") REFERENCES "dead_letters"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dead_letter_requeues_new_execution_id_fkey" FOREIGN KEY ("new_execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
