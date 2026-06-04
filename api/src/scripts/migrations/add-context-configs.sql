-- Migration : ajout de contextConfigs sur indicator_definitions
-- Remplace les champs formula + visualization par un modèle multi-contexte/multi-vue

ALTER TABLE indicator_definitions
  ADD COLUMN IF NOT EXISTS context_configs JSONB;

-- Rétro-compatibilité : convertir formula + visualization existants en contextConfigs
-- si context_configs est absent mais formula est présent → construire un contextConfig learner par défaut
UPDATE indicator_definitions
SET context_configs = jsonb_build_array(
  jsonb_build_object(
    'contextType', 'learner',
    'views', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'label', 'Vue principale',
        'formula', formula,
        'visualization', visualization
      )
    )
  )
)
WHERE context_configs IS NULL
  AND formula IS NOT NULL;
