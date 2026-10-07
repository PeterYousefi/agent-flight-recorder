-- Persist normalized input for worker processing and immutable replay.
ALTER TABLE "executions" ADD COLUMN "input" JSONB NOT NULL DEFAULT '{}';
