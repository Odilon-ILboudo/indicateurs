-- Migration sur la base "indicators" : ajout d'une colonne baseIndicatorId sur
-- indicator_definitions.
--
-- Pourquoi : permet de créer un indicateur en partant du pipeline d'un indicateur
-- déjà existant ("capitalisation des indicateurs"), pour éviter de reconstruire un
-- pipeline proche à la main à chaque fois.
--
-- IMPORTANT : c'est un champ de pure traçabilité, jamais relu pour un recalcul.
-- La composition (copie du pipeline de la source + overrides + étapes
-- supplémentaires) se fait une seule fois, côté frontend, au moment de la création.
-- Modifier l'indicateur de base par la suite n'a strictement aucun effet sur les
-- indicateurs qui ont été créés à partir de lui - ils deviennent totalement
-- autonomes dès leur création. Ce champ ne sert qu'à afficher "Basé sur : X" dans
-- l'interface d'administration.

ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS "baseIndicatorId" varchar;
