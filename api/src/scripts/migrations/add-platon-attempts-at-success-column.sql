-- Migration sur la base PLaTon ("platon", pas "indicators") : ajout d'une
-- colonne "attempts_at_success" sur SessionData, calculée depuis la table
-- "Answers" (le vrai journal des réponses soumises, une ligne par tentative).
--
-- Pourquoi : la colonne "attempts" existante est un compteur cumulatif qui
-- continue d'augmenter même après une première réussite (si l'étudiant
-- retente ensuite) - elle ne peut donc pas servir à mesurer "le nombre de
-- tentatives qu'il a fallu pour réussir la première fois". Voir les
-- indicateurs "Tentatives avant réussite" (indicators.indicator_definitions)
-- qui utilisaient auparavant à tort ce champ.
--
-- Définition : attempts_at_success = rang chronologique de la première
-- réponse notée 100, parmi toutes les réponses (Answers) de la session.
-- NULL si la session n'a jamais été réussie.
--
-- IMPORTANT : le rôle applicatif "platon" n'est PAS propriétaire des tables
-- PLaTon - ce script doit être exécuté avec un rôle à privilèges élevés
-- (voir PLATON_DB_ADMIN_USERNAME / PLATON_DB_ADMIN_PASSWORD dans api/.env).

ALTER TABLE "SessionData" ADD COLUMN IF NOT EXISTS attempts_at_success INTEGER;

WITH ranked AS (
  SELECT session_id, grade, created_at,
         ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at ASC) AS attempt_rank
  FROM "Answers"
),
first_success AS (
  SELECT session_id, MIN(attempt_rank) AS attempts_at_success
  FROM ranked
  WHERE grade = 100
  GROUP BY session_id
)
UPDATE "SessionData" sd
SET attempts_at_success = fs.attempts_at_success
FROM first_success fs
WHERE sd.id = fs.session_id;
