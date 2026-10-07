-- CreateTable
CREATE TABLE "executions" (
    "id" UUID NOT NULL,
    "agent_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "current_attempt" INTEGER,
    "idempotency_key" TEXT,
    "original_execution_id" UUID,
    "budget_policy" JSONB,
    "metadata" JSONB,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_attempts" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "error_code" TEXT,
    "error_message" TEXT,
    "retryable" BOOLEAN,

    CONSTRAINT "execution_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_events" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "correlation_id" TEXT,
    "causation_event_id" TEXT,
    "trace_id" TEXT,
    "span_id" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "execution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_records" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "attempt_id" UUID,
    "category" TEXT NOT NULL,
    "source" TEXT,
    "kind" TEXT NOT NULL,
    "amount_micro_usd" BIGINT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "cost_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" TEXT,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replay_relationships" (
    "id" UUID NOT NULL,
    "original_execution_id" UUID NOT NULL,
    "replay_execution_id" UUID NOT NULL,
    "replay_mode" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replay_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letters" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "final_attempt" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "error" JSONB,
    "dead_lettered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requeued_as_execution_id" UUID,

    CONSTRAINT "dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_records" (
    "id" UUID NOT NULL,
    "execution_id" UUID,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "executions_idempotency_key_key" ON "executions"("idempotency_key");

-- CreateIndex
CREATE INDEX "executions_status_idx" ON "executions"("status");

-- CreateIndex
CREATE INDEX "executions_created_at_idx" ON "executions"("created_at");

-- CreateIndex
CREATE INDEX "executions_provider_idx" ON "executions"("provider");

-- CreateIndex
CREATE INDEX "executions_status_created_at_idx" ON "executions"("status", "created_at");

-- CreateIndex
CREATE INDEX "executions_original_execution_id_idx" ON "executions"("original_execution_id");

-- CreateIndex
CREATE INDEX "execution_attempts_execution_id_idx" ON "execution_attempts"("execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "execution_attempts_execution_id_attempt_number_key" ON "execution_attempts"("execution_id", "attempt_number");

-- CreateIndex
CREATE INDEX "execution_events_execution_id_idx" ON "execution_events"("execution_id");

-- CreateIndex
CREATE INDEX "execution_events_event_type_idx" ON "execution_events"("event_type");

-- CreateIndex
CREATE INDEX "execution_events_timestamp_idx" ON "execution_events"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "execution_events_execution_id_sequence_key" ON "execution_events"("execution_id", "sequence");

-- CreateIndex
CREATE INDEX "cost_records_execution_id_idx" ON "cost_records"("execution_id");

-- CreateIndex
CREATE INDEX "cost_records_timestamp_idx" ON "cost_records"("timestamp");

-- CreateIndex
CREATE INDEX "artifacts_execution_id_idx" ON "artifacts"("execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "replay_relationships_replay_execution_id_key" ON "replay_relationships"("replay_execution_id");

-- CreateIndex
CREATE INDEX "replay_relationships_original_execution_id_idx" ON "replay_relationships"("original_execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "dead_letters_execution_id_key" ON "dead_letters"("execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "dead_letters_requeued_as_execution_id_key" ON "dead_letters"("requeued_as_execution_id");

-- CreateIndex
CREATE INDEX "dead_letters_dead_lettered_at_idx" ON "dead_letters"("dead_lettered_at");

-- CreateIndex
CREATE INDEX "dead_letters_execution_id_idx" ON "dead_letters"("execution_id");

-- CreateIndex
CREATE INDEX "audit_records_execution_id_idx" ON "audit_records"("execution_id");

-- CreateIndex
CREATE INDEX "audit_records_timestamp_idx" ON "audit_records"("timestamp");

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_original_execution_id_fkey" FOREIGN KEY ("original_execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "execution_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_relationships" ADD CONSTRAINT "replay_relationships_original_execution_id_fkey" FOREIGN KEY ("original_execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_relationships" ADD CONSTRAINT "replay_relationships_replay_execution_id_fkey" FOREIGN KEY ("replay_execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letters" ADD CONSTRAINT "dead_letters_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letters" ADD CONSTRAINT "dead_letters_requeued_as_execution_id_fkey" FOREIGN KEY ("requeued_as_execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Structural invariants intentionally kept below the domain state machine.
ALTER TABLE "executions" ADD CONSTRAINT "executions_current_attempt_positive_check"
CHECK ("current_attempt" IS NULL OR "current_attempt" > 0);
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_attempt_number_positive_check"
CHECK ("attempt_number" > 0);
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_sequence_positive_check"
CHECK ("sequence" > 0);
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_schema_version_positive_check"
CHECK ("schema_version" > 0);
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_amount_micro_usd_non_negative_check"
CHECK ("amount_micro_usd" >= 0);
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_size_bytes_non_negative_check"
CHECK ("size_bytes" >= 0);
ALTER TABLE "replay_relationships" ADD CONSTRAINT "replay_relationships_distinct_executions_check"
CHECK ("original_execution_id" <> "replay_execution_id");
ALTER TABLE "dead_letters" ADD CONSTRAINT "dead_letters_final_attempt_positive_check"
CHECK ("final_attempt" > 0);
