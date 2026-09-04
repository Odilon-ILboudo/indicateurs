/*
Parsing/validation d'un import YAML/JSON d'indicateur - partagé entre le wizard et la modale
de choix initial, qui doit valider avant d'ouvrir le wizard.
*/
import * as yaml from 'js-yaml';
import {
  ImportedIndicatorMeta,
  PipelineError,
  PipelineStep,
  PlatonTableSchema,
  REQUIRED_ROOT_KEYS,
  STEP_TYPE_LABELS,
  StepType,
  VALID_CONTEXT_TYPES,
  VALID_ROOT_KEYS,
  VALID_VIZ_TYPES,
} from './pipeline-import-types';

export * from './pipeline-import-types';

export function dehydrateStep(s: any): PipelineStep {
  return {
    id:              s.id ?? crypto.randomUUID(),
    type:            s.type,
    label:           s.label ?? s.type,
    // fetch
    table:           s.type === 'fetch' ? s.params?.table : undefined,
    contextFields:   s.type === 'fetch' ? s.params?.contextFields : undefined,
    useGroupContext: s.type === 'fetch' ? s.params?.contextFields?.includes('group_id') : undefined,
    // join
    joinTable:          s.type === 'join' ? s.params?.table : undefined,
    joinContextFields:  s.type === 'join' ? s.params?.contextFields : undefined,
    joinLeftKey:        s.type === 'join' ? s.params?.leftKey : undefined,
    joinRightKey:       s.type === 'join' ? s.params?.rightKey : undefined,
    joinType:           s.type === 'join' ? (s.params?.joinType ?? 'left') : undefined,
    filterField:     s.params?.field,
    filterOperator:  s.params?.operator,
    filterValue:     s.params?.value,
    groupField:      s.params?.groupField,
    whereField:      s.params?.whereField,
    whereValue:      s.params?.whereValue,
    sortField:       s.params?.sortField,
    extractField:    s.params?.extractField,
    aggregateFn:     s.params?.aggregateFn,
    decimals:        s.params?.decimals,
    divideBy:        s.params?.divideBy,
    jsCode:          s.params?.code,
  };
}

/** Vérifie qu'une étape du pipeline a bien ses champs requis pour son type. Ne vérifie pas
 qu'il y a au moins une étape : un brouillon peut avoir un pipeline vide ou partiel.
*/
export function validatePipelineStepComplete(s: PipelineStep, stepIndex: number): string | null {
  const ctx = `Étape ${stepIndex + 1} (${STEP_TYPE_LABELS[s.type]})`;
  switch (s.type) {
    case 'fetch':
      if (!s.table?.trim()) return `${ctx} : la table est requise.`;
      break;
    case 'join':
      if (!s.joinTable?.trim()) return `${ctx} : la table à joindre est requise.`;
      if (!s.joinLeftKey?.trim()) return `${ctx} : la clé de jointure (données courantes) est requise.`;
      if (!s.joinRightKey?.trim()) return `${ctx} : la clé de jointure (table jointe) est requise.`;
      break;
    case 'filter':
      if (!s.filterField?.trim()) return `${ctx} : la colonne à filtrer est requise.`;
      if (!s.filterOperator) return `${ctx} : l'opérateur est requis.`;
      if (s.filterValue === undefined || s.filterValue === null || s.filterValue === '')
        return `${ctx} : la valeur de comparaison est requise.`;
      break;
    case 'groupBy':
      if (!s.groupField?.trim()) return `${ctx} : la colonne de regroupement est requise.`;
      break;
    case 'findFirst':
      if (s.whereField?.trim() && (s.whereValue === undefined || s.whereValue === null || s.whereValue === ''))
        return `${ctx} : la valeur de condition est requise quand une colonne de condition est choisie.`;
      break;
    case 'extract':
      if (!s.extractField?.trim()) return `${ctx} : la colonne à extraire est requise.`;
      break;
    case 'aggregate':
      if (!s.aggregateFn) return `${ctx} : la fonction d'agrégation est requise.`;
      break;
    case 'round':
      if (s.decimals === undefined || s.decimals === null) return `${ctx} : le nombre de décimales est requis.`;
      break;
    case 'divide':
      if (s.divideBy === undefined || s.divideBy === null) return `${ctx} : la constante de division est requise.`;
      if (s.divideBy === 0) return `${ctx} : la constante de division ne peut pas être 0.`;
      break;
    case 'js':
      if (!s.jsCode?.trim()) return `${ctx} : le code JavaScript est requis.`;
      break;
  }
  return null;
}

function validateAndDehydrateStep(raw: any, stepNum: number): PipelineStep {
  const VALID_TYPES: StepType[] = ['fetch', 'join', 'filter', 'groupBy', 'findFirst', 'extract', 'aggregate', 'round', 'divide', 'js'];
  const VALID_AGGREGATE_FNS = ['avg', 'sum', 'count', 'min', 'max'];
  const VALID_FILTER_OPERATORS = ['==', '!=', '>', '<', '>=', '<='];
  const VALID_JOIN_TYPES = ['left', 'inner', 'right', 'full'];
  const VALID_STEP_KEYS = ['type', 'label', 'params'];
  const VALID_PARAMS: Record<StepType, string[]> = {
    fetch:     ['table', 'contextFields'],
    join:      ['table', 'contextFields', 'leftKey', 'rightKey', 'joinType'],
    filter:    ['field', 'operator', 'value'],
    groupBy:   ['groupField'],
    findFirst: ['whereField', 'whereValue', 'sortField'],
    extract:   ['extractField'],
    aggregate: ['aggregateFn'],
    round:     ['decimals'],
    divide:    ['divideBy'],
    js:        ['code'],
  };

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Étape ${stepNum} : doit être un objet avec au minimum les clés "type" et "params".`);
  }

  //  Niveau 1 : clés de l'étape (type / label / params) 
  const stepKeys = Object.keys(raw);
  const wrongStepKey = stepKeys.find(k => !VALID_STEP_KEYS.includes(k));

  if (!raw.type) {
    if (wrongStepKey) {
      throw new PipelineError(
        `Étape ${stepNum} : clé "${wrongStepKey}" inconnue - le nom correct est "type".`,
        ['type'], 'Clé attendue', wrongStepKey,
      );
    }
    throw new PipelineError(
      `Étape ${stepNum} : la clé "type" est manquante. Pour du code JavaScript personnalisé, utilisez "type: js" avec "params.code".`,
      VALID_TYPES, 'Types disponibles',
    );
  }
  if (!VALID_TYPES.includes(raw.type)) {
    throw new PipelineError(
      `Étape ${stepNum} : type "${raw.type}" inconnu. Pour du code JavaScript personnalisé, utilisez "type: js" avec "params.code".`,
      VALID_TYPES, 'Types valides', raw.type,
      VALID_TYPES.map(t => `${t} - ${STEP_TYPE_LABELS[t]}`),
    );
  }
  // Clé étrangère présente malgré un type valide (ex: prams, lable…)
  if (wrongStepKey) {
    throw new PipelineError(
      `Étape ${stepNum} : clé "${wrongStepKey}" inconnue au niveau de l'étape.`,
      VALID_STEP_KEYS, 'Clés valides d\'une étape', wrongStepKey,
    );
  }

  if (!raw.label) raw.label = STEP_TYPE_LABELS[raw.type as StepType];
  const ctx = `Étape ${stepNum} (${STEP_TYPE_LABELS[raw.type as StepType]})`;

  //  Niveau 2 : params doit être un objet plain
  if (raw.params !== undefined && raw.params !== null) {
    if (Array.isArray(raw.params))
      throw new Error(`${ctx} : "params" doit être un objet clé:valeur, pas une liste.`);
    if (typeof raw.params !== 'object')
      throw new Error(`${ctx} : "params" doit être un objet clé:valeur (reçu : ${typeof raw.params}).`);
  }
  const p = raw.params ?? {};

  //  Niveau 3 : clés à l'intérieur de params 
  const validParamKeys = VALID_PARAMS[raw.type as StepType];
  const wrongParamKey = Object.keys(p).find(k => !validParamKeys.includes(k));
  if (wrongParamKey) {
    throw new PipelineError(
      `${ctx} : clé de paramètre "${wrongParamKey}" inconnue.`,
      validParamKeys, 'Paramètres valides', wrongParamKey,
    );
  }

  switch (raw.type as StepType) {
    case 'fetch': {
      if (!p.table || typeof p.table !== 'string' || !p.table.trim())
        throw new Error(`${ctx} : "params.table" est requis - nom de la table PLaTon, ex: SessionData.`);
      if (p.contextFields !== undefined && !Array.isArray(p.contextFields))
        throw new Error(`${ctx} : "params.contextFields" doit être une liste, ex: [user_id, activity_id].`);
      if (Array.isArray(p.contextFields) && p.contextFields.some((f: any) => typeof f !== 'string'))
        throw new Error(`${ctx} : "params.contextFields" doit contenir uniquement des noms de colonnes (chaînes de caractères).`);
      break;
    }
    case 'join': {
      if (!p.table || typeof p.table !== 'string' || !p.table.trim())
        throw new Error(`${ctx} : "params.table" est requis - nom de la table à joindre.`);
      if (!p.leftKey || typeof p.leftKey !== 'string')
        throw new Error(`${ctx} : "params.leftKey" est requis - colonne dans les données courantes servant de clé de jointure.`);
      if (!p.rightKey || typeof p.rightKey !== 'string')
        throw new Error(`${ctx} : "params.rightKey" est requis - colonne correspondante dans la table à joindre.`);
      if (p.contextFields !== undefined && !Array.isArray(p.contextFields))
        throw new Error(`${ctx} : "params.contextFields" doit être une liste, ex: [user_id, activity_id].`);
      if (Array.isArray(p.contextFields) && p.contextFields.some((f: any) => typeof f !== 'string'))
        throw new Error(`${ctx} : "params.contextFields" doit contenir uniquement des noms de colonnes (chaînes de caractères).`);
      if (p.joinType !== undefined && !VALID_JOIN_TYPES.includes(p.joinType))
        throw new PipelineError(`${ctx} : "params.joinType" invalide ("${p.joinType}").`, VALID_JOIN_TYPES, 'Valeurs possibles (défaut : left)', p.joinType);
      break;
    }
    case 'filter': {
      if (!p.field || typeof p.field !== 'string')
        throw new Error(`${ctx} : "params.field" est requis - nom de la colonne à tester.`);
      if (!p.operator)
        throw new PipelineError(`${ctx} : "params.operator" est requis.`, VALID_FILTER_OPERATORS, 'Opérateurs valides');
      if (!VALID_FILTER_OPERATORS.includes(p.operator))
        throw new PipelineError(`${ctx} : opérateur "${p.operator}" inconnu.`, VALID_FILTER_OPERATORS, 'Opérateurs valides', p.operator);
      if (p.value === undefined || p.value === null)
        throw new Error(`${ctx} : "params.value" est requis - valeur à comparer avec "${p.field}".`);
      if (typeof p.value !== 'string' && typeof p.value !== 'number')
        throw new Error(`${ctx} : "params.value" doit être une chaîne ou un nombre (reçu : ${typeof p.value}).`);
      break;
    }
    case 'groupBy': {
      if (!p.groupField || typeof p.groupField !== 'string')
        throw new Error(`${ctx} : "params.groupField" est requis - nom de la colonne de regroupement.`);
      break;
    }
    case 'findFirst': {
      if (p.whereField !== undefined && typeof p.whereField !== 'string')
        throw new Error(`${ctx} : "params.whereField" doit être une chaîne (nom de colonne).`);
      if (p.whereField && (p.whereValue === undefined || p.whereValue === null))
        throw new Error(`${ctx} : "params.whereValue" est requis quand "params.whereField" est défini.`);
      if (p.sortField !== undefined && typeof p.sortField !== 'string')
        throw new Error(`${ctx} : "params.sortField" doit être une chaîne (nom de colonne).`);
      break;
    }
    case 'extract': {
      if (!p.extractField || typeof p.extractField !== 'string')
        throw new Error(`${ctx} : "params.extractField" est requis - nom de la colonne dont extraire la valeur.`);
      break;
    }
    case 'aggregate': {
      if (!p.aggregateFn)
        throw new PipelineError(`${ctx} : "params.aggregateFn" est requis.`, VALID_AGGREGATE_FNS, 'Fonctions valides');
      if (!VALID_AGGREGATE_FNS.includes(p.aggregateFn))
        throw new PipelineError(`${ctx} : fonction "${p.aggregateFn}" inconnue.`, VALID_AGGREGATE_FNS, 'Fonctions valides', p.aggregateFn);
      break;
    }
    case 'round': {
      if (p.decimals === undefined || p.decimals === null)
        throw new Error(`${ctx} : "params.decimals" est requis - nombre de décimales (ex: 0, 1, 2).`);
      if (typeof p.decimals !== 'number' || !Number.isInteger(p.decimals) || p.decimals < 0)
        throw new Error(`${ctx} : "params.decimals" doit être un entier positif ou nul (reçu : ${p.decimals}).`);
      break;
    }
    case 'divide': {
      if (p.divideBy === undefined || p.divideBy === null)
        throw new Error(`${ctx} : "params.divideBy" est requis - constante de division (ex: 60, 100).`);
      if (typeof p.divideBy !== 'number')
        throw new Error(`${ctx} : "params.divideBy" doit être un nombre (reçu : ${typeof p.divideBy}).`);
      if (p.divideBy === 0)
        throw new Error(`${ctx} : "params.divideBy" ne peut pas être 0 (division par zéro).`);
      break;
    }
    case 'js': {
      if (!p.code || typeof p.code !== 'string' || !p.code.trim())
        throw new Error(`${ctx} : "params.code" est requis - le code JavaScript à exécuter. Utilisez "return", ex: return input.length;`);
      break;
    }
  }
  return dehydrateStep({ id: crypto.randomUUID(), type: raw.type, label: raw.label, params: p });
}

function validatePipelineColumns(pipeline: PipelineStep[], platonSchema: PlatonTableSchema[]): void {
  if (!platonSchema.length) return;

  const tableNames = platonSchema.map(t => t.name);
  const colsOf = (tableName: string): Set<string> =>
    new Set(platonSchema.find(t => t.name === tableName)?.columns.map(c => c.name) ?? []);

  let knownCols = new Set<string>();

  for (let i = 0; i < pipeline.length; i++) {
    const s = pipeline[i];
    const n = i + 1;
    const ctx = `Étape ${n} (${STEP_TYPE_LABELS[s.type]})`;

    switch (s.type) {
      case 'fetch': {
        if (!tableNames.includes(s.table!))
          throw new PipelineError(`${ctx} : table "${s.table}" introuvable dans le schéma PLaTon.`, tableNames, 'Tables disponibles', s.table);
        const cols = colsOf(s.table!);
        for (const f of s.contextFields ?? []) {
          // "group_id" est un mot-clé spécial (jointure groupe), pas une vraie colonne à valider
          if (f === 'group_id') continue;
          if (!cols.has(f))
            throw new PipelineError(`${ctx} : colonne de contexte "${f}" introuvable dans "${s.table}".`, [...cols], 'Colonnes disponibles', f);
        }
        knownCols = cols;
        break;
      }
      case 'join': {
        if (!tableNames.includes(s.joinTable!))
          throw new PipelineError(`${ctx} : table "${s.joinTable}" introuvable dans le schéma PLaTon.`, tableNames, 'Tables disponibles', s.joinTable);
        const joinCols = colsOf(s.joinTable!);
        if (knownCols.size && s.joinLeftKey && !knownCols.has(s.joinLeftKey))
          throw new PipelineError(`${ctx} : colonne de jointure gauche "${s.joinLeftKey}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.joinLeftKey);
        if (s.joinRightKey && !joinCols.has(s.joinRightKey))
          throw new PipelineError(`${ctx} : colonne de jointure droite "${s.joinRightKey}" introuvable dans "${s.joinTable}".`, [...joinCols], 'Colonnes disponibles', s.joinRightKey);
        for (const f of s.joinContextFields ?? []) {
          if (!joinCols.has(f))
            throw new PipelineError(`${ctx} : colonne de filtre "${f}" introuvable dans "${s.joinTable}".`, [...joinCols], 'Colonnes disponibles', f);
        }
        for (const col of joinCols) knownCols.add(col);
        break;
      }
      case 'filter': {
        if (knownCols.size && s.filterField && !knownCols.has(s.filterField))
          throw new PipelineError(`${ctx} : colonne "${s.filterField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.filterField);
        break;
      }
      case 'groupBy': {
        if (knownCols.size && s.groupField && !knownCols.has(s.groupField))
          throw new PipelineError(`${ctx} : colonne de regroupement "${s.groupField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.groupField);
        break;
      }
      case 'findFirst': {
        if (knownCols.size && s.whereField && !knownCols.has(s.whereField))
          throw new PipelineError(`${ctx} : colonne de filtre "${s.whereField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.whereField);
        if (knownCols.size && s.sortField && !knownCols.has(s.sortField))
          throw new PipelineError(`${ctx} : colonne de tri "${s.sortField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.sortField);
        break;
      }
      case 'extract': {
        if (knownCols.size && s.extractField && !knownCols.has(s.extractField))
          throw new PipelineError(`${ctx} : colonne "${s.extractField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.extractField);
        knownCols = new Set();
        break;
      }
      case 'js':
        knownCols = new Set();
        break;
      // aggregate, round, divide : ne changent pas le contexte de colonnes
    }
  }
}

/** `true` si `text` est du JSON strictement valide - utilisé pour rejeter du JSON collé par
 erreur en mode YAML (le YAML est un sur-ensemble du JSON, `yaml.load` l'accepterait
 silencieusement sinon) : voir `parseIndicatorImport` et `formatImportText`.
*/
export function looksLikeJson(text: string): boolean {
  try { JSON.parse(text); return true; } catch { return false; }
}

/** Parse et valide un import YAML/JSON complet d'indicateur (pas seulement le pipeline).
 `platonSchema` peut être vide (validation des tables/colonnes alors ignorée) - utile pour
 valider avant que le schéma PLaTon soit chargé. Lève `PipelineError`/`Error` sur tout
 problème, avec un message prêt à afficher tel quel.
*/
export function parseIndicatorImport(
  text: string,
  mode: 'yaml' | 'json',
  platonSchema: PlatonTableSchema[] = [],
): { pipeline: PipelineStep[]; meta: ImportedIndicatorMeta } {
  if (!text.trim()) throw new Error('Le champ est vide. Collez votre indicateur ci-dessus avant d\'appliquer.');

  /*
  Mode strict : le YAML est un sur-ensemble du JSON (js-yaml accepterait silencieusement du
  JSON collé par erreur en mode YAML) - on rejette explicitement ce cas plutôt que de laisser
  passer, pour que le mode sélectionné corresponde vraiment au texte collé.
  */
  if (mode === 'yaml' && looksLikeJson(text)) {
    throw new Error(
      'Ce texte est du JSON valide, pas du YAML. Sélectionnez le mode JSON, ou reformulez en syntaxe YAML (indentation, sans accolades).',
    );
  }

  let raw: any;
  try {
    raw = mode === 'yaml' ? yaml.load(text) : JSON.parse(text);
  } catch {
    throw new Error(
      mode === 'yaml'
        ? 'Le YAML contient une erreur de syntaxe. Vérifiez l\'indentation (utilisez des espaces, pas des tabulations) et les guillemets.'
        : 'Le JSON contient une erreur de syntaxe. Vérifiez les virgules, les guillemets et les accolades.'
    );
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('Le document doit commencer par "name:" et "pipeline:" (YAML) ou { "name": ..., "pipeline": [...] } (JSON).');
  }

  const unknownKeys = Object.keys(raw).filter(k => !VALID_ROOT_KEYS.includes(k));
  if (unknownKeys.length > 0) {
    throw new PipelineError(
      `Clé${unknownKeys.length > 1 ? 's' : ''} racine inconnue${unknownKeys.length > 1 ? 's' : ''} : ` +
      `${unknownKeys.map(k => `"${k}"`).join(', ')} - clés valides : ${VALID_ROOT_KEYS.join(', ')}.`,
    );
  }

  const missingKeys = REQUIRED_ROOT_KEYS.filter(k => {
    if (k === 'name') return !String(raw.name ?? '').trim();
    return raw[k] === undefined || raw[k] === null;
  });
  if (missingKeys.length > 0) {
    throw new Error(
      `Champ${missingKeys.length > 1 ? 's' : ''} obligatoire${missingKeys.length > 1 ? 's' : ''} manquant${missingKeys.length > 1 ? 's' : ''} : ` +
      `${missingKeys.map(k => `"${k}"`).join(', ')}.`,
    );
  }

  if (!Array.isArray(raw.pipeline)) {
    throw new Error('Le champ "pipeline" doit contenir une liste d\'étapes.');
  }
  if (raw.pipeline.length === 0) {
    throw new Error('Le pipeline est vide. Ajoutez au moins une étape.');
  }
  const pipeline = raw.pipeline.map((s: any, j: number) => validateAndDehydrateStep(s, j + 1));
  validatePipelineColumns(pipeline, platonSchema);

  const meta: ImportedIndicatorMeta = { name: String(raw.name).trim() };
  if (raw.description !== undefined) meta.description = String(raw.description);
  if (raw.interpretationHint !== undefined) meta.interpretationHint = String(raw.interpretationHint);
  if (raw.requiredEvents !== undefined) {
    if (!Array.isArray(raw.requiredEvents)) throw new Error('"requiredEvents" doit être une liste de noms d\'événements.');
    meta.requiredEvents = raw.requiredEvents.map((e: any) => String(e));
  }
  if (raw.contextType !== undefined) {
    if (!VALID_CONTEXT_TYPES.includes(raw.contextType)) {
      throw new PipelineError(
        `"contextType" invalide : "${raw.contextType}".`,
        VALID_CONTEXT_TYPES, 'Valeurs valides', raw.contextType,
      );
    }
    meta.contextType = raw.contextType;
  }
  if (raw.thresholds !== undefined && raw.thresholds !== null) {
    if (typeof raw.thresholds !== 'object' || Array.isArray(raw.thresholds)) {
      throw new Error('"thresholds" doit être un objet avec les clés good/warning/critical.');
    }
    for (const key of ['good', 'warning', 'critical'] as const) {
      const v = raw.thresholds[key];
      if (v !== undefined && v !== null && typeof v !== 'number') {
        throw new Error(`"thresholds.${key}" doit être un nombre (reçu : "${v}").`);
      }
    }
    meta.thresholds = raw.thresholds;
  }
  if (raw.visualizations !== undefined) {
    if (!Array.isArray(raw.visualizations)) throw new Error('"visualizations" doit être une liste.');
    raw.visualizations.forEach((v: any, idx: number) => {
      if (!v || typeof v !== 'object') {
        throw new Error(`"visualizations[${idx}]" doit être un objet.`);
      }
      if (v.type !== undefined && !VALID_VIZ_TYPES.includes(v.type)) {
        throw new PipelineError(
          `"visualizations[${idx}].type" invalide : "${v.type}".`,
          VALID_VIZ_TYPES, 'Valeurs valides', v.type,
        );
      }
    });
    meta.visualizations = raw.visualizations;
  }

  return { pipeline, meta };
}
