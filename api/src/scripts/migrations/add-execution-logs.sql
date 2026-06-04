-- Migration : table des logs d'exécution des formules DSL
-- Exécuter : PGPASSWORD=test psql -U platon -h localhost -d indicators -f .../add-execution-logs.sql

CREATE TABLE IF NOT EXISTS indicator_execution_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID,
  user_id      VARCHAR(255),
  value        DOUBLE PRECISION,
  duration_ms  INTEGER,
  error        TEXT,
  executed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exec_logs_indicator
  ON indicator_execution_logs(indicator_id, executed_at DESC);
