-- Migration sur la base "indicators" : création de la table indicator_pins.
--
-- Pourquoi : permettre à un enseignant ayant un droit d'écriture sur un cours
-- (ou une activité de ce cours) de "figer" un indicateur course/activity
-- existant sur cette ressource précise - tous les membres l'ont alors actif
-- et non désactivable, avec des seuils propres à ce contexte.
--
-- IMPORTANT : cette table est volontairement indépendante de
-- user_indicator_preferences (préférence perso globale par utilisateur, sans
-- notion de cours/activité). Aucune des deux n'écrit jamais dans l'autre :
-- figer un indicateur ici ne modifie aucune préférence utilisateur (donc pas
-- de fuite sur les autres cours/activités d'un membre), et désactiver sa
-- préférence perso n'a aucun effet sur un pin existant.

CREATE TABLE IF NOT EXISTS indicator_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "indicatorId" uuid NOT NULL,
  "contextType" varchar NOT NULL,
  "contextId" varchar NOT NULL,
  "thresholdsOverride" jsonb,
  "pinnedByUserId" varchar NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("indicatorId", "contextType", "contextId")
);

CREATE INDEX IF NOT EXISTS idx_indicator_pins_context ON indicator_pins ("contextType", "contextId");
