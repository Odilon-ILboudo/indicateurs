import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ivm from 'isolated-vm';
import { PlatonService } from '../../../core/platon/platon.service';
import { IndicatorExecutionLog } from '../entities/indicator-execution-log.entity';

export interface FormulaStep {
  id: string;
  type: 'fetch' | 'join' | 'filter' | 'groupBy' | 'findFirst' | 'extract' | 'aggregate' | 'round' | 'divide' | 'js';
  label?: string;
  params: Record<string, any>;
}

export interface FormulaDefinition {
  version: '1.0';
  dataSource: 'platon.sessions' | 'platon.activities';
  pipeline: FormulaStep[];
}

export interface FormulaContext {
  userId?: string;
  activityId?: string;
  courseId?: string;
  groupId?: string;
  indicatorId?: string;
}

export interface CandidateEntry {
  sortValue: any;
  extractedValue: number;
  passes: boolean;
}
export type CandidateRowsMap = Record<string, CandidateEntry>;
export type GroupCandidateRowsMap = Record<string, CandidateRowsMap>;

export interface IncrementalShape {
  extractField: string;
  postSteps: FormulaStep[];
  filterSteps: FormulaStep[];
  joinSteps: FormulaStep[];
  /** Vrai si la shape contient des joins → nécessite un SQL ciblé (1 ligne) dans le chemin incrémental. */
  needsTargetedFetch: boolean;
  /** Présent si le pipeline contient un groupBy → stocke groupRowValues ou groupCandidateRows. */
  groupByField?: string;
  /** Présent si le pipeline contient un findFirst → stocke candidateRows ou groupCandidateRows. */
  findFirst?: { sortField?: string; whereField?: string; whereValue?: any };
}

@Injectable()
export class FormulaInterpreterService {
  private readonly logger = new Logger(FormulaInterpreterService.name);

  constructor(
    private readonly platonService: PlatonService,
    @InjectRepository(IndicatorExecutionLog, 'indicators')
    private readonly logRepo: Repository<IndicatorExecutionLog>,
  ) {}

  /** Exécute le pipeline étape par étape et retourne le snapshot de chaque étape (pour debug). */
  async interpretWithSteps(
    formula: FormulaDefinition,
    context: FormulaContext,
  ): Promise<{ steps: Array<{ index: number; type: string; durationMs: number; output: any; error?: string; truncated?: boolean }> }> {
    if (!formula?.pipeline?.length) return { steps: [] };

    const steps: Array<{ index: number; type: string; durationMs: number; output: any; error?: string; truncated?: boolean }> = [];
    let current: any = null;

    for (let i = 0; i < formula.pipeline.length; i++) {
      const step = formula.pipeline[i];
      const t0 = Date.now();
      try {
        current = await this.executeStep(step, current, context);
        const truncated = Array.isArray(current) && current.length > 200;
        const debugOutput = truncated ? current.slice(0, 200) : current;
        steps.push({ index: i, type: step.type, durationMs: Date.now() - t0, output: debugOutput, truncated });
        // Plafonner les données intermédiaires à 5000 lignes entre les étapes :
        // évite l'explosion mémoire serveur sur les jointures, tout en restant
        // 10× au-dessus de l'ancien fetchLimit=500 (qui causait des résultats incorrects).
        if (Array.isArray(current) && current.length > 5000) {
          current = current.slice(0, 5000);
        }
      } catch (err) {
        steps.push({ index: i, type: step.type, durationMs: Date.now() - t0, output: null, error: (err as Error).message });
        break;
      }
    }
    return { steps };
  }

  /**
   * Exécute un pipeline DSL et retourne le résultat brut.
   * number → valeur scalaire (card/gauge/line-chart), object → { clé: valeur } (bar-chart),
   * array → [{ bucket, count }] (histogram). Enregistre un log dans indicator_execution_logs.
   */
  async interpret(formula: FormulaDefinition, context: FormulaContext): Promise<any> {
    if (!formula?.pipeline?.length) return 0;

    const start = Date.now();
    this.logger.log(`Interprétation pipeline (${formula.pipeline.length} étapes) - contexte: ${JSON.stringify(context)}`);

    let current: any = null;
    let execError: string | undefined;

    try {
      for (const step of formula.pipeline) {
        try {
          current = await this.executeStep(step, current, context);
          this.logger.debug(`Étape [${step.type}] → ${Array.isArray(current) ? `${current.length} éléments` : JSON.stringify(current)}`);
        } catch (err) {
          this.logger.error(`Erreur étape [${step.type}]: ${(err as Error).message}`);
          execError = `[${step.type}] ${(err as Error).message}`;
          current = 0;
          break;
        }
      }
    } catch (err) {
      execError = (err as Error).message;
    }

    const result = execError ? 0 : current;
    const scalarValue = typeof result === 'number' ? result : 0;
    const durationMs = Date.now() - start;

    if (context.indicatorId) {
      this.logRepo.save({
        indicatorId: context.indicatorId,
        userId: context.userId ?? context.groupId,
        value: execError ? undefined : scalarValue,
        durationMs,
        error: execError,
      }).catch(e => this.logger.warn(`Échec sauvegarde log: ${e.message}`));
    }

    return result;
  }

  /**
   * Détecte si une formule est éligible au calcul incrémental (delta).
   * Formes acceptées :
   *   fetch(SessionData, contextFields ∋ user_id)
   *   [join]*
   *   [filter]*
   *   [groupBy(groupField)]   ← optionnel - active le chemin groupRowValues
   *   extract(field)
   *   aggregate(avg|sum|count|min|max)
   *   [round|divide]*
   *
   * Retourne null pour tout pipeline contenant findFirst ou js.
   */
  getIncrementalShape(formula: FormulaDefinition): IncrementalShape | null {
    const pipeline = formula?.pipeline ?? [];
    if (pipeline.length < 3) return null;

    const [fetchStep, ...rest] = pipeline;

    if (fetchStep.type !== 'fetch') return null;
    const table = FormulaInterpreterService.LEGACY_TABLE_MAP[fetchStep.params?.table] ?? fetchStep.params?.table;
    if (table !== 'SessionData') return null;
    if (!(fetchStep.params?.contextFields ?? []).includes('user_id')) return null;

    let i = 0;

    const joinSteps: FormulaStep[] = [];
    while (i < rest.length && rest[i].type === 'join') {
      joinSteps.push(rest[i++]);
    }

    const filterSteps: FormulaStep[] = [];
    while (i < rest.length && rest[i].type === 'filter') {
      filterSteps.push(rest[i++]);
    }

    let groupByField: string | undefined;
    if (i < rest.length && rest[i].type === 'groupBy') {
      groupByField = rest[i].params?.groupField;
      if (!groupByField) return null;
      i++;
    }

    let findFirst: IncrementalShape['findFirst'];
    if (i < rest.length && rest[i].type === 'findFirst') {
      findFirst = {
        sortField: rest[i].params?.sortField,
        whereField: rest[i].params?.whereField,
        whereValue: rest[i].params?.whereValue,
      };
      i++;
    }

    if (i >= rest.length || rest[i].type !== 'extract' || !rest[i].params?.extractField) return null;
    const extractField: string = rest[i++].params.extractField;

    const postSteps = rest.slice(i);
    if (!postSteps.every(s => ['aggregate', 'round', 'divide', 'js'].includes(s.type))) return null;
    const aggregateSteps = postSteps.filter(s => s.type === 'aggregate');
    if (aggregateSteps.length !== 1) return null;
    if (!['avg', 'sum', 'count', 'min', 'max'].includes(aggregateSteps[0].params?.aggregateFn)) return null;

    return {
      extractField,
      postSteps,
      filterSteps,
      joinSteps,
      needsTargetedFetch: joinSteps.length > 0,
      groupByField,
      findFirst,
    };
  }

  /** Applique la chaîne aggregate/round/divide/js sur un tableau de valeurs numériques déjà extraites. */
  async applyPostSteps(values: number[], postSteps: FormulaStep[]): Promise<number> {
    let current: any = values;
    for (const step of postSteps) {
      switch (step.type) {
        case 'aggregate': current = this.executeAggregate(step.params, current); break;
        case 'round':     current = this.executeRound(step.params, current); break;
        case 'divide':    current = this.executeDivide(step.params, current); break;
        case 'js':        current = await this.executeJs(step.params, current); break;
      }
    }
    return typeof current === 'number' ? current : 0;
  }

  /** Calcul complet pour une formule incrémentable : fetch + joins/filtres, map sessionId →
   *  valeur, puis aggregate/round/divide. Utilisé au premier événement et en fallback. */
  async computeWithRowMap(
    formula: FormulaDefinition,
    context: FormulaContext,
    shape: IncrementalShape,
  ): Promise<{ result: number; rowValues: Record<string, number> }> {
    let rows = await this.executeFetch(formula.pipeline[0].params, context);

    for (const joinStep of shape.joinSteps) {
      rows = await this.executeJoin(joinStep.params, rows, context);
    }
    for (const filterStep of shape.filterSteps) {
      rows = this.executeFilter(filterStep.params, rows);
    }

    const rowValues: Record<string, number> = {};
    for (const row of rows) {
      const v = parseFloat(row[shape.extractField]);
      if (!isNaN(v) && row.id != null) rowValues[String(row.id)] = v;
    }

    return { result: await this.applyPostSteps(Object.values(rowValues), shape.postSteps), rowValues };
  }

  /** Équivalent de computeWithRowMap avec groupBy : map groupKey → { sessionId → valeur }. */
  async computeWithGroupRowMap(
    formula: FormulaDefinition,
    context: FormulaContext,
    shape: IncrementalShape,
  ): Promise<{ result: number; groupRowValues: Record<string, Record<string, number>> }> {
    let rows = await this.executeFetch(formula.pipeline[0].params, context);

    for (const joinStep of shape.joinSteps) {
      rows = await this.executeJoin(joinStep.params, rows, context);
    }
    for (const filterStep of shape.filterSteps) {
      rows = this.executeFilter(filterStep.params, rows);
    }

    const groupRowValues: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (row.id == null) continue;
      const v = parseFloat(row[shape.extractField]);
      if (isNaN(v)) continue;
      const groupKey = String(row[shape.groupByField!] ?? '__null__');
      if (!groupRowValues[groupKey]) groupRowValues[groupKey] = {};
      groupRowValues[groupKey][String(row.id)] = v;
    }

    const allValues = Object.values(groupRowValues).flatMap(g => Object.values(g));
    return { result: await this.applyPostSteps(allValues, shape.postSteps), groupRowValues };
  }

  /**
   * Calcul complet pour findFirst semi-incrémental.
   * Construit candidateRows (sans groupBy) ou groupCandidateRows (avec groupBy).
   * Chaque entrée stocke : sortValue, extractedValue, passes (condition whereField).
   */
  async computeWithCandidateRows(
    formula: FormulaDefinition,
    context: FormulaContext,
    shape: IncrementalShape,
  ): Promise<{ result: number; candidateRows?: CandidateRowsMap; groupCandidateRows?: GroupCandidateRowsMap }> {
    let rows = await this.executeFetch(formula.pipeline[0].params, context);
    for (const joinStep of shape.joinSteps) {
      rows = await this.executeJoin(joinStep.params, rows, context);
    }
    for (const filterStep of shape.filterSteps) {
      rows = this.executeFilter(filterStep.params, rows);
    }

    const { sortField, whereField, whereValue } = shape.findFirst!;

    const buildEntry = (row: any): CandidateEntry | null => {
      const extractedValue = parseFloat(row[shape.extractField]);
      if (isNaN(extractedValue)) return null;
      return {
        sortValue: sortField ? row[sortField] : null,
        extractedValue,
        passes: whereField != null ? String(row[whereField]) === String(whereValue) : true,
      };
    };

    if (shape.groupByField) {
      const groupCandidateRows: GroupCandidateRowsMap = {};
      for (const row of rows) {
        if (row.id == null) continue;
        const entry = buildEntry(row);
        if (!entry) continue;
        const groupKey = String(row[shape.groupByField] ?? '__null__');
        if (!groupCandidateRows[groupKey]) groupCandidateRows[groupKey] = {};
        groupCandidateRows[groupKey][String(row.id)] = entry;
      }
      return { result: await this.computeResultFromGroupCandidates(groupCandidateRows, shape), groupCandidateRows };
    } else {
      const candidateRows: CandidateRowsMap = {};
      for (const row of rows) {
        if (row.id == null) continue;
        const entry = buildEntry(row);
        if (!entry) continue;
        candidateRows[String(row.id)] = entry;
      }
      return { result: await this.computeResultFromCandidates(candidateRows, shape), candidateRows };
    }
  }

  /** Calcule le résultat depuis candidateRows plat (findFirst sans groupBy). O(n) scan. */
  async computeResultFromCandidates(candidateRows: CandidateRowsMap, shape: IncrementalShape): Promise<number> {
    const winner = this.findCandidateWinner(candidateRows, shape.findFirst?.sortField);
    return winner !== null ? this.applyPostSteps([winner], shape.postSteps) : 0;
  }

  /** Calcule le résultat depuis groupCandidateRows (findFirst avec groupBy). O(n) total. */
  async computeResultFromGroupCandidates(groupCandidateRows: GroupCandidateRowsMap, shape: IncrementalShape): Promise<number> {
    const winners: number[] = [];
    for (const entries of Object.values(groupCandidateRows)) {
      const w = this.findCandidateWinner(entries, shape.findFirst?.sortField);
      if (w !== null) winners.push(w);
    }
    return this.applyPostSteps(winners, shape.postSteps);
  }

  /**
   * Évalue un seul filtre DSL sur une ligne (row). Retourne true si la ligne passe le filtre.
   * Utilisé dans le chemin incrémental pour éviter un SQL complet.
   */
  evaluateFilterRow(params: Record<string, any>, row: Record<string, any>): boolean {
    const { field, operator, value } = params;
    const rowVal = row[field];
    const cmpVal = typeof rowVal === 'number' ? Number(value) : String(value);
    switch (operator) {
      case '==': return rowVal == cmpVal;
      case '!=': return rowVal != cmpVal;
      case '>':  return rowVal > cmpVal;
      case '<':  return rowVal < cmpVal;
      case '>=': return rowVal >= cmpVal;
      case '<=': return rowVal <= cmpVal;
      default:   return false;
    }
  }

  /**
   * Fetch ciblé pour le chemin incrémental avec join : récupère 1 seule ligne SessionData
   * par sessionId, puis applique les joins de la shape en mémoire.
   * Retourne null si la session n'existe pas en BDD.
   */
  async fetchSingleSessionRow(
    sessionId: string,
    context: FormulaContext,
    shape: IncrementalShape,
  ): Promise<Record<string, any> | null> {
    let rows = await this.platonService.queryTable('SessionData', { id: sessionId });
    if (!rows.length) return null;

    for (const joinStep of shape.joinSteps) {
      rows = await this.executeJoin(joinStep.params, rows, context);
    }

    return rows.length ? rows[0] : null;
  }

  private async executeStep(step: FormulaStep, input: any, context: FormulaContext, fetchLimit?: number): Promise<any> {
    switch (step.type) {
      case 'fetch':     return this.executeFetch(step.params, context, fetchLimit);
      case 'join':      return this.executeJoin(step.params, input, context);
      case 'filter':    return this.executeFilter(step.params, input);
      case 'groupBy':   return this.executeGroupBy(step.params, input);
      case 'findFirst': return this.executeFindFirst(step.params, input);
      case 'extract':   return this.executeExtract(step.params, input);
      case 'aggregate': return this.executeAggregate(step.params, input);
      case 'round':     return this.executeRound(step.params, input);
      case 'divide':    return this.executeDivide(step.params, input);
      case 'js':        return await this.executeJs(step.params, input);
      default:
        this.logger.warn(`Type d'étape inconnu: ${step.type}`);
        return input;
    }
  }

  // ── Étapes ───────────────────────────────────────────────────────────────

  // Rétro-compatibilité : anciens noms DSL → noms réels de tables PLaTon
  private static readonly LEGACY_TABLE_MAP: Record<string, string> = {
    sessions:   'SessionData',
    activities: 'Activities',
  };

  // Mapping entre nom de colonne de contexte et valeur du FormulaContext
  private static readonly CONTEXT_FIELD_MAP: Record<string, keyof FormulaContext> = {
    user_id:     'userId',
    activity_id: 'activityId',
    course_id:   'courseId',
  };

  private async executeFetch(params: Record<string, any>, context: FormulaContext, limit?: number): Promise<any[]> {
    const { contextFields = [] } = params;
    const rawTable: string = params['table'] ?? '';
    const table = FormulaInterpreterService.LEGACY_TABLE_MAP[rawTable] ?? rawTable;

    // group_id déclenche une jointure vers CourseGroupsMember/CourseGroups, scopée par
    // activityId ou courseId - l'un ou l'autre, jamais aucun.
    const wantsGroup = (contextFields as string[]).includes('group_id');
    if (wantsGroup && context.groupId) {
      const scope = context.activityId
        ? { activityId: context.activityId }
        : context.courseId
          ? { courseId: context.courseId }
          : null;
      if (!scope) {
        this.logger.warn(`Étape [fetch] ignorée : activityId/courseId manquant pour groupe ${context.groupId}`);
        return [];
      }
      const extraFilters: Record<string, string> = {};
      for (const col of contextFields as string[]) {
        if (col === 'group_id' || col === 'activity_id' || col === 'course_id') continue;
        const ctxKey = FormulaInterpreterService.CONTEXT_FIELD_MAP[col];
        const val = ctxKey ? context[ctxKey] : undefined;
        if (val) extraFilters[col] = val as string;
      }
      return this.platonService.queryTableForGroup(table, context.groupId, scope, extraFilters);
    }

    // Cas standard : filtres simples col = val
    const filters: Record<string, string> = {};
    for (const col of contextFields as string[]) {
      const ctxKey = FormulaInterpreterService.CONTEXT_FIELD_MAP[col];
      const val = ctxKey ? context[ctxKey] : undefined;
      if (val) filters[col] = val as string;
    }

    return this.platonService.queryTable(table, filters, limit);
  }

  /**
   * Joint les lignes en entrée (table gauche) avec une seconde table PLaTon (table droite).
   * Params : table, contextFields (optionnel), leftKey, rightKey, joinType (optionnel, défaut 'left')
   *   - 'left'  : toutes les lignes gauches, fusionnées si correspondance trouvée
   *   - 'inner' : uniquement les lignes gauches avec une correspondance
   *   - 'right' : toutes les lignes droites, fusionnées si correspondance trouvée
   *   - 'full'  : union de 'left' et 'right'
   * En cas de fusion, les champs gauches sont prioritaires (écrasent les champs droits en cas de conflit de nom).
   */
  private async executeJoin(params: Record<string, any>, input: any, context: FormulaContext): Promise<any[]> {
    const joinType: 'left' | 'inner' | 'right' | 'full' = params['joinType'] ?? 'left';
    const includesRight = joinType === 'right' || joinType === 'full';
    const includesUnmatchedLeft = joinType === 'left' || joinType === 'full';

    const leftRows: any[] = Array.isArray(input) ? input : [];
    if (!leftRows.length && !includesRight) return [];

    const { leftKey, rightKey } = params;
    const rawTable: string = params['table'] ?? '';
    if (!rawTable || !leftKey || !rightKey) {
      this.logger.warn('[join] paramètres incomplets (table / leftKey / rightKey requis)');
      return leftRows;
    }

    const table = FormulaInterpreterService.LEGACY_TABLE_MAP[rawTable] ?? rawTable;
    const contextFields: string[] = params['contextFields'] ?? [];

    const filters: Record<string, string> = {};
    for (const col of contextFields) {
      const ctxKey = FormulaInterpreterService.CONTEXT_FIELD_MAP[col];
      const val = ctxKey ? context[ctxKey] : undefined;
      if (val) filters[col] = val as string;
    }

    const rightRows = await this.platonService.queryTable(table, filters);

    // Index la table droite par la valeur de rightKey pour éviter O(n²)
    const rightIndex = new Map<string, any[]>();
    for (const row of rightRows) {
      const key = String(row[rightKey] ?? '__null__');
      if (!rightIndex.has(key)) rightIndex.set(key, []);
      rightIndex.get(key)!.push(row);
    }

    // Clés droites ayant matché au moins une ligne gauche (pour 'right'/'full')
    const matchedRightKeys = new Set<string>();

    const result: any[] = [];
    for (const leftRow of leftRows) {
      const key = String(leftRow[leftKey] ?? '__null__');
      const matches = rightIndex.get(key);
      if (matches?.length) {
        matchedRightKeys.add(key);
        for (const rightRow of matches) {
          result.push({ ...rightRow, ...leftRow });
        }
      } else if (includesUnmatchedLeft) {
        result.push({ ...leftRow });
      }
    }

    if (includesRight) {
      for (const rightRow of rightRows) {
        const key = String(rightRow[rightKey] ?? '__null__');
        if (!matchedRightKeys.has(key)) {
          result.push({ ...rightRow });
        }
      }
    }

    return result;
  }

  private executeFilter(params: Record<string, any>, rows: any[]): any[] {
    if (!Array.isArray(rows)) return [];
    const { field, operator, value } = params;

    return rows.filter(row => {
      const rowVal = row[field];
      const cmpVal = typeof rowVal === 'number' ? Number(value) : String(value);
      switch (operator) {
        case '==': return rowVal == cmpVal;
        case '!=': return rowVal != cmpVal;
        case '>':  return rowVal > cmpVal;
        case '<':  return rowVal < cmpVal;
        case '>=': return rowVal >= cmpVal;
        case '<=': return rowVal <= cmpVal;
        default:
          throw new Error(`Opérateur de filtre inconnu : "${operator}". Opérateurs valides : ==, !=, >, <, >=, <=`);
      }
    });
  }

  /**
   * groupBy reçoit des lignes plates et retourne un tableau de groupes (any[][]).
   */
  private executeGroupBy(params: Record<string, any>, rows: any[]): any[][] {
    if (!Array.isArray(rows)) return [];
    const { groupField } = params;
    const map = new Map<string, any[]>();

    for (const row of rows) {
      const key = String(row[groupField] ?? '__null__');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }

    return Array.from(map.values());
  }

  /**
   * findFirst accepte des groupes (any[][]) ou des lignes plates (any[]).
   * Retourne une ligne par groupe (ou une ligne depuis un tableau plat).
   */
  private executeFindFirst(params: Record<string, any>, input: any[]): any[] {
    const { whereField, whereValue, sortField } = params;
    const groups: any[][] = this.isGroups(input) ? input : [input];
    const results: any[] = [];

    for (const group of groups) {
      const sorted = sortField
        ? [...group].sort((a, b) => {
            const av = a[sortField], bv = b[sortField];
            return av < bv ? -1 : av > bv ? 1 : 0;
          })
        : group;

      const found = whereField != null
        ? sorted.find(row => String(row[whereField]) == String(whereValue))
        : sorted[0];

      if (found != null) results.push(found);
    }

    return results;
  }

  /**
   * extract accepte des lignes plates ou des groupes.
   * Retourne un tableau de nombres.
   */
  private executeExtract(params: Record<string, any>, input: any): number[] {
    const { extractField } = params;
    const rows: any[] = this.isGroups(input) ? input.flat() : (Array.isArray(input) ? input : []);

    return rows
      .map(row => parseFloat(row[extractField]))
      .filter(v => !isNaN(v));
  }

  private executeAggregate(params: Record<string, any>, input: any[]): number {
    const { aggregateFn } = params;
    const values = Array.isArray(input) ? input.filter(v => typeof v === 'number') : [];
    if (!values.length) return 0;

    switch (aggregateFn) {
      case 'avg':   return values.reduce((a, b) => a + b, 0) / values.length;
      case 'sum':   return values.reduce((a, b) => a + b, 0);
      case 'count': return values.length;
      case 'min':   return Math.min(...values);
      case 'max':   return Math.max(...values);
      default:      return 0;
    }
  }

  private executeRound(params: Record<string, any>, value: number): number {
    const decimals = params.decimals ?? 2;
    return parseFloat(value.toFixed(decimals));
  }

  private executeDivide(params: Record<string, any>, value: number): number {
    const by = Number(params.divideBy);
    return by !== 0 ? value / by : 0;
  }

  /**
   * Patterns interdits dans le code JS des formules.
   * Bloque les vecteurs d'évasion connus du module `vm` Node.js :
   * accès à `process`, chargement de modules (`require`/`import`),
   * constructeur Function (échappement classique), Buffer, variables système.
   */
  private static readonly JS_FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
    { pattern: /\bprocess\b/,                          label: '"process" (accès système interdit)' },
    { pattern: /\brequire\s*\(/,                       label: '"require()" (import de module interdit)' },
    { pattern: /\bimport\s*\(/,                        label: '"import()" (import dynamique interdit)' },
    { pattern: /\b__dirname\b|\b__filename\b/,         label: '"__dirname" / "__filename" (chemin système interdit)' },
    { pattern: /\bglobal\b/,                           label: '"global" (objet global interdit)' },
    { pattern: /\bBuffer\b/,                           label: '"Buffer" (accès mémoire brute interdit)' },
    { pattern: /\beval\s*\(/,                          label: '"eval()" (exécution dynamique interdite)' },
    { pattern: /\bFunction\s*\(/,                      label: '"Function()" (constructeur dynamique interdit)' },
    { pattern: /\.constructor\s*\(/,                   label: '".constructor()" (évasion de sandbox interdite)' },
    { pattern: /\bsetTimeout\b|\bsetInterval\b/,       label: '"setTimeout" / "setInterval" (minuteries interdites)' },
    { pattern: /\bfetch\s*\(|\bXMLHttpRequest\b/,      label: '"fetch" / "XMLHttpRequest" (réseau interdit)' },
    { pattern: /\bchild_process\b|\bexec\s*\(/,        label: '"child_process" / "exec" (commandes système interdites)' },
    { pattern: /\bfs\b\.\w+\s*\(/,                     label: '"fs.*" (système de fichiers interdit)' },
  ];

  /**
   * Vérifie que le code JS ne contient aucun pattern dangereux.
   * Lève une erreur explicite si un pattern interdit est détecté.
   */
  private validateJsCode(code: string): void {
    for (const { pattern, label } of FormulaInterpreterService.JS_FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        throw new Error(`Code JS refusé : utilisation de ${label}`);
      }
    }
  }

  /**
   * Exécute du code JS dans un vrai isolate V8 (isolated-vm).
   * L'isolate est un processus V8 complètement séparé : process, require,
   * fs, Buffer, global - rien de Node.js n'est accessible par défaut.
   * L'analyse statique reste en place comme filet de sécurité complémentaire.
   */
  private async executeJs(params: Record<string, any>, input: any): Promise<any> {
    const { code } = params;
    if (!code?.trim()) return input;

    this.validateJsCode(code);

    const isolate = new ivm.Isolate({ memoryLimit: 32 });
    try {
      const context = await isolate.createContext();

      // Injecter `input` sérialisé dans l'isolate
      const inputCopy = new ivm.ExternalCopy(input);
      await context.global.set('input', inputCopy.copyInto());

      const script = await isolate.compileScript(
        `(function(input) { ${code} })(input)`,
      );
      // copy: true transfère automatiquement le résultat hors de l'isolate.
      // Sans cette option, les objets et tableaux retournent undefined.
      return await script.run(context, { timeout: 2000, copy: true });
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Erreur dans l'étape Code JS (isolate) : ${error.stack ?? error.message}`);
      const safeMessage = (error.message || 'erreur inconnue')
        .replace(/evalmachine\.<anonymous>:\d+(:\d+)?/gi, 'le code')
        .replace(/\/[^\s:]+/g, '[chemin masqué]');
      throw new Error(`Erreur dans le code JS : ${safeMessage}`);
    } finally {
      isolate.dispose();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Trouve le gagnant dans un CandidateRowsMap : tri ascending par sortField, premier qui passe la condition. */
  private findCandidateWinner(entries: CandidateRowsMap, sortField?: string): number | null {
    const passing = Object.values(entries).filter(e => e.passes);
    if (!passing.length) return null;
    if (sortField) {
      passing.sort((a, b) => a.sortValue < b.sortValue ? -1 : a.sortValue > b.sortValue ? 1 : 0);
    }
    return passing[0].extractedValue;
  }

  /** Vérifie si la donnée est un tableau de groupes (any[][]) */
  private isGroups(data: any): data is any[][] {
    return Array.isArray(data) && data.length > 0 && Array.isArray(data[0]);
  }
}
