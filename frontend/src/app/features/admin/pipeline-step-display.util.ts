import { PipelineStep } from './pipeline-import-types';

/* Détail complet d'une étape pour la vue "Pipeline" des cartes (Prédéfinis / Existants) - le
 type JS est traité à part dans le template (bloc de code en lecture seule).
*/
export function stepDetails(s: PipelineStep): { label: string; value: string }[] {
  switch (s.type) {
    case 'fetch':
      return [
        { label: 'Table', value: s.table || '—' },
        { label: 'Filtrer par contexte', value: s.contextFields?.length ? s.contextFields.join(', ') : '—' },
        { label: 'Requête groupe de TP', value: s.useGroupContext ? 'Oui' : 'Non' },
      ];
    case 'join':
      return [
        { label: 'Table jointe', value: s.joinTable || '—' },
        { label: 'Type de jointure', value: (s.joinType || 'left').toUpperCase() },
        { label: 'Clé left', value: s.joinLeftKey || '—' },
        { label: 'Clé right', value: s.joinRightKey || '—' },
        { label: 'Filtrer par contexte', value: s.joinContextFields?.length ? s.joinContextFields.join(', ') : '—' },
      ];
    case 'filter':
      return [
        { label: 'Champ', value: s.filterField || '—' },
        { label: 'Opérateur', value: s.filterOperator || '—' },
        { label: 'Valeur', value: s.filterValue != null ? String(s.filterValue) : '—' },
      ];
    case 'groupBy':
      return [{ label: 'Grouper par', value: s.groupField || '—' }];
    case 'findFirst':
      return [
        { label: 'Condition (champ)', value: s.whereField || '—' },
        { label: 'Valeur attendue', value: s.whereValue != null ? String(s.whereValue) : '—' },
        { label: 'Trier par', value: s.sortField || '—' },
      ];
    case 'extract':
      return [{ label: 'Champ à extraire', value: s.extractField || '—' }];
    case 'aggregate':
      return [{ label: 'Fonction', value: s.aggregateFn || '—' }];
    case 'round':
      return [{ label: 'Décimales', value: s.decimals != null ? String(s.decimals) : '—' }];
    case 'divide':
      return [{ label: 'Diviser par', value: s.divideBy != null ? String(s.divideBy) : '—' }];
    default:
      return [];
  }
}

const CONTEXT_FIELD_PATTERNS: { label: string; patterns: string[] }[] = [
  { label: 'Utilisateur concerné', patterns: ['user_id'] },
  { label: 'Cours',                patterns: ['course_id'] },
  { label: 'Activité',             patterns: ['activity_id'] },
  { label: 'Session',              patterns: ['session_id'] },
];

/** Suggère une configuration de règle event-rule à partir du pipeline courant (table,
 colonnes, mapping de contexte) - une suggestion à vérifier, jamais une garantie.
*/
export function eventRuleHint(pipeline: PipelineStep[]): {
  tables: string[];
  columns: string[];
  contextMapping: { label: string; column: string | null }[];
} | null {
  const fetchStep = pipeline.find(s => s.type === 'fetch');
  if (!fetchStep) return null;

  const tables = new Set<string>();
  if (fetchStep.table) tables.add(fetchStep.table);
  for (const s of pipeline) {
    if (s.type === 'join' && s.joinTable) tables.add(s.joinTable);
  }

  const columns = new Set<string>();
  for (const s of pipeline) {
    if (s.type === 'extract' && s.extractField) columns.add(s.extractField);
    if (s.type === 'filter' && s.filterField) columns.add(s.filterField);
    if (s.type === 'groupBy' && s.groupField) columns.add(s.groupField);
    if (s.type === 'findFirst') {
      if (s.whereField) columns.add(s.whereField);
      if (s.sortField) columns.add(s.sortField);
    }
  }

  const contextFields = [...(fetchStep.contextFields ?? [])];
  for (const s of pipeline) {
    if (s.type === 'join' && s.joinContextFields) contextFields.push(...s.joinContextFields);
  }

  const contextMapping = CONTEXT_FIELD_PATTERNS.map(({ label, patterns }) => ({
    label,
    column: contextFields.find(f => patterns.some(p => f === p || f.includes(p))) ?? null,
  }));

  return { tables: [...tables], columns: [...columns], contextMapping };
}
