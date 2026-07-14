-- Migration sur la base PLaTon ("platon", pas "indicators") : anticipation
-- d'une colonne "status" sur SessionData, annoncée par l'équipe PLaTon comme
-- déjà en place en production. Reproduite ici sur le dump de test pour
-- aligner l'environnement de développement local sur la future réalité.
--
-- IMPORTANT : le rôle applicatif "platon" n'est PAS propriétaire des tables
-- PLaTon (ex. SessionData appartient à "postgres") - ce script doit être
-- exécuté avec un rôle à privilèges élevés (voir PLATON_DB_ADMIN_USERNAME /
-- PLATON_DB_ADMIN_PASSWORD dans api/.env), jamais avec le rôle applicatif.
--
-- Valeurs possibles : 'non commencé' | 'commencé' | 'réussi' | 'échoué' | 'erreur'

ALTER TABLE "SessionData" ADD COLUMN IF NOT EXISTS status VARCHAR(20);

UPDATE "SessionData" SET status = CASE
  WHEN attempts = 0 AND started_at IS NULL THEN 'non commencé'
  WHEN grade = -1 AND attempts > 0 THEN 'commencé'
  WHEN grade = 100 THEN 'réussi'
  WHEN grade >= 0 AND grade < 100 THEN 'échoué'
  ELSE 'erreur'
END;
