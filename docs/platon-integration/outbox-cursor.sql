-- =============================================================================
-- Curseur du relais d'événements vers Indicateurs
-- À exécuter sur la BDD PLaTon, en plus de api/scripts/migrations/platon-outbox.sql
-- (côté Indicateurs) qui crée déjà la table platon_outbox_events elle-même.
-- =============================================================================

-- Une seule ligne (id fixé à 1, contrainte CHECK) : pas besoin de plusieurs flux côté
-- PLaTon, contrairement à l'ancien curseur côté Indicateurs (ingestion_cursors, table
-- à streamName multiples) qui anticipait un besoin qui ne s'est jamais présenté.
CREATE TABLE IF NOT EXISTS indicateurs_outbox_cursor (
  id          SMALLINT     PRIMARY KEY DEFAULT 1,
  last_id     BIGINT       NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO indicateurs_outbox_cursor (id, last_id)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
