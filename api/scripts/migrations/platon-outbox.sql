-- =============================================================================
-- Migration : Outbox PLaTon pour le système d'ingestion d'événements
-- À exécuter sur la BDD PLaTon (pas la BDD indicators)
-- =============================================================================

-- Table outbox : reçoit un enregistrement à chaque réponse d'apprenant
-- Pas de colonne "processed" : le curseur est géré côté indicators DB (lecture seule ici)
CREATE TABLE IF NOT EXISTS platon_outbox_events (
  id          BIGSERIAL    PRIMARY KEY,
  event_type  VARCHAR(100) NOT NULL DEFAULT 'exercise.answered',
  payload     JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platon_outbox_id
  ON platon_outbox_events (id);

CREATE INDEX IF NOT EXISTS idx_platon_outbox_created
  ON platon_outbox_events (created_at);

-- Fonction trigger : écrit dans l'outbox lors d'une insertion ou mise à jour de grade
CREATE OR REPLACE FUNCTION fn_platon_outbox_session_data()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO platon_outbox_events (event_type, payload)
  VALUES (
    'exercise.answered',
    jsonb_build_object(
      'userId',     NEW.user_id::text,
      'sessionId',  NEW.id::text,
      'activityId', NEW.activity_id::text,
      'courseId',   COALESCE(NEW.course_id::text, ''),
      'grade',      NEW.grade,
      'attempts',   NEW.attempts,
      'timestamp',  extract(epoch from now())::bigint
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur SessionData : déclenché après INSERT ou mise à jour du grade
DROP TRIGGER IF EXISTS trg_platon_outbox_session_data ON "SessionData";
CREATE TRIGGER trg_platon_outbox_session_data
  AFTER INSERT OR UPDATE OF grade
  ON "SessionData"
  FOR EACH ROW
  EXECUTE FUNCTION fn_platon_outbox_session_data();

-- Nettoyage automatique : supprime les événements de plus de 7 jours via un cron PostgreSQL
-- (optionnel, nécessite pg_cron ou une tâche externe)
-- DELETE FROM platon_outbox_events WHERE created_at < now() - INTERVAL '7 days';
