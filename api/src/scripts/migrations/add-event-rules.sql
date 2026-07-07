-- Migration : table des règles de classification d'événements dynamiques
-- Une règle transforme un changement brut PLaTon (table/colonne/condition) en event_type métier.

CREATE TABLE IF NOT EXISTS indicator_event_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id       UUID NOT NULL REFERENCES indicator_event_types(id) ON DELETE RESTRICT,
  source_table        VARCHAR NOT NULL,
  watched_column      VARCHAR,
  operation           VARCHAR NOT NULL DEFAULT 'UPDATE',
  condition           JSONB NOT NULL,
  context_mapping     JSONB NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  mode                VARCHAR NOT NULL DEFAULT 'generic',
  trigger_installed   BOOLEAN NOT NULL DEFAULT false,
  installed_at        TIMESTAMPTZ,
  last_applied_sql    TEXT,
  last_install_error  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_indicator_event_rules_source_table ON indicator_event_rules(source_table);
CREATE INDEX IF NOT EXISTS idx_indicator_event_rules_event_type_id ON indicator_event_rules(event_type_id);
