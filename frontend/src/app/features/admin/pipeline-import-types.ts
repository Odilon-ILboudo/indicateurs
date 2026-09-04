import { IndicatorScope, ViewVisualizationType } from '../../core/models/indicator.model';

export const VALID_CONTEXT_TYPES: IndicatorScope[] = ['learner', 'teacher', 'admin', 'course', 'activity', 'group'];
export const VALID_VIZ_TYPES: ViewVisualizationType[] = ['card', 'gauge', 'line-chart', 'bar-chart', 'histogram'];

export type StepType = 'fetch' | 'join' | 'filter' | 'groupBy' | 'findFirst' | 'extract' | 'aggregate' | 'round' | 'divide' | 'js';

export interface PipelineStep {
  id: string; type: StepType; label: string;
  // fetch
  table?: string; contextFields?: string[]; useGroupContext?: boolean;
  // join
  joinTable?: string; joinContextFields?: string[]; joinLeftKey?: string; joinRightKey?: string;
  joinType?: 'left' | 'inner' | 'right' | 'full';
  // filter
  filterField?: string; filterOperator?: string; filterValue?: string | number;
  // groupBy
  groupField?: string;
  // findFirst
  whereField?: string; whereValue?: string | number; sortField?: string;
  // extract
  extractField?: string;
  // aggregate
  aggregateFn?: string;
  // round / divide / js
  decimals?: number; divideBy?: number; jsCode?: string;
}

export interface PlatonTableSchema { name: string; columns: { name: string; type: string }[]; }

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  fetch: 'Récupérer données', join: 'Jointure', filter: 'Filtrer',
  groupBy: 'Grouper par', findFirst: 'Premier résultat', extract: 'Extraire champ',
  aggregate: 'Agréger', round: 'Arrondir', divide: 'Diviser', js: 'Code JS',
};

/** Champs de l'indicateur reconnus au niveau racine d'un import YAML/JSON, en plus du
 pipeline. `name` est le seul obligatoire avec `pipeline` - le reste garde les valeurs déjà
 présentes dans le formulaire si absent de l'import.
*/
export interface ImportedIndicatorMeta {
  name: string;
  description?: string;
  interpretationHint?: string;
  requiredEvents?: string[];
  contextType?: IndicatorScope;
  thresholds?: { good?: number | null; warning?: number | null; critical?: number | null } | null;
  visualizations?: { label?: string; type?: string; icon?: string; color?: string; unit?: string }[];
}

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly available?: string[],
    readonly availableLabel?: string,
    readonly wrongValue?: string,
    readonly availableDisplay?: string[], // étiquettes d'affichage (si différentes de available)
  ) { super(message); }
}

/** Forme d'affichage d'une erreur de `parseIndicatorImport()`, partagée par tous les panneaux
 d'import (wizard étape 3, modale de choix initial) pour un rendu cohérent.
*/
export interface ImportErrorDisplay {
  main: string;
  available?: string[];           // valeurs à insérer au clic
  availableDisplay?: string[];    // étiquettes affichées (si différentes de available)
  availableLabel?: string;
  wrongValue?: string;
}

export function toImportErrorDisplay(e: unknown): ImportErrorDisplay {
  if (e instanceof PipelineError) {
    return { main: e.message, available: e.available, availableLabel: e.availableLabel, wrongValue: e.wrongValue, availableDisplay: e.availableDisplay };
  }
  return { main: e instanceof Error ? e.message : String(e) };
}

/** Remplace la valeur fautive par la suggestion choisie dans le texte importé (clic sur une
 valeur proposée) - utilisé par le bouton "cliquer pour corriger" des panneaux d'import.
*/
export function replaceValueInText(text: string, wrongValue: string, suggestion: string): string {
  const escaped = wrongValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(["']?)\\b${escaped}\\b\\1`);
  return text.replace(re, `$1${suggestion}$1`);
}

export const VALID_ROOT_KEYS = [
  'name', 'description', 'interpretationHint', 'requiredEvents',
  'contextType', 'thresholds', 'visualizations', 'pipeline',
];
export const REQUIRED_ROOT_KEYS = ['name', 'pipeline'];
