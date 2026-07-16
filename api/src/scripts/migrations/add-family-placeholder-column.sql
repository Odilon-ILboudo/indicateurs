-- Migration sur la base "indicators" : ajout d'une colonne isFamilyPlaceholder sur
-- indicator_definitions.
--
-- Pourquoi : il n'existe pas de table "Famille" dédiée - familyName est un simple
-- champ partagé entre plusieurs indicateurs. Pour permettre de créer une famille
-- vide (aucun indicateur réel pour l'instant, à compléter plus tard), on crée une
-- ligne technique qui ne représente aucun indicateur~: toujours isActive=false
-- (donc déjà invisible des utilisateurs finaux via GET /indicators), visible
-- uniquement dans la gestion admin (GET /indicators/all), et supprimée
-- automatiquement dès qu'un premier vrai indicateur rejoint la famille.

ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS "isFamilyPlaceholder" boolean NOT NULL DEFAULT false;
