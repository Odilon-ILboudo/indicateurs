-- Migration sur la base "indicators" : ajout d'une colonne visibilityRoles
-- sur indicator_definitions.
--
-- Pourquoi : les contextes "course" et "activity" sont visibles par tous les
-- rôles par défaut (RoleService.INDICATOR_VISIBILITY, frontend). Mais un
-- indicateur de ce contexte peut retourner un résultat nominatif (ex. une
-- répartition des performances par étudiant, en barres) qui ne doit pas être
-- proposé aux étudiants eux-mêmes. Cette colonne permet à l'administrateur de
-- restreindre explicitement la visibilité d'un indicateur précis à une liste
-- de rôles, en override de la règle par défaut du contextType.
--
-- NULL ou tableau vide = pas de restriction, la règle par défaut du
-- contextType s'applique normalement.

ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS "visibilityRoles" jsonb;
