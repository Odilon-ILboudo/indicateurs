-- Migration : table des versions de formules DSL
-- Exécuter : PGPASSWORD=test psql -U platon -h localhost -d indicators -f .../add-formula-versions.sql

CREATE TABLE IF NOT EXISTS indicator_formula_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES indicator_definitions(id) ON DELETE CASCADE,
  version_num  INTEGER NOT NULL,
  formula      JSONB NOT NULL,
  created_by   VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_formula_versions_indicator
  ON indicator_formula_versions(indicator_id, version_num DESC);
