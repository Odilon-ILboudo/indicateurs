-- Migration : Outbox PLaTon pour le système d'ingestion d'événements
-- À exécuter sur la BDD PLaTon (pas la BDD indicators)

-- Ce script crée UNIQUEMENT la table outbox
CREATE TABLE IF NOT EXISTS platon_outbox_events (
  id          BIGSERIAL    PRIMARY KEY,
  event_type  VARCHAR(100) NOT NULL,
  payload     JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platon_outbox_id
  ON platon_outbox_events (id);

CREATE INDEX IF NOT EXISTS idx_platon_outbox_created
  ON platon_outbox_events (created_at);

-- Nettoyage automatique des événements de plus de 7 jours : géré côté Indicateurs (OutboxMaintenanceService, cron quotidien)
