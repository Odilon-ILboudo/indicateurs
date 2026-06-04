-- Migration : ajout de la colonne formula sur indicator_definitions
-- À exécuter UNE SEULE FOIS via : psql -U platon -d indicators -f add-formula-column.sql

ALTER TABLE indicator_definitions
  ADD COLUMN IF NOT EXISTS formula JSONB DEFAULT NULL;

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'indicator_definitions' AND column_name = 'formula';
