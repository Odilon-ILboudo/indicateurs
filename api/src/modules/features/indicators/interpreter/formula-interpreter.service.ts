// src/modules/features/indicators/interpreter/formula-interpreter.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as vm from 'vm';
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
    fetchLimit = 500,
  ): Promise<{ steps: Array<{ index: number; type: string; durationMs: number; output: any; error?: string; truncated?: boolean }> }> {
    if (!formula?.pipeline?.length) return { steps: [] };

    const steps: Array<{ index: number; type: string; durationMs: number; output: any; error?: string; truncated?: boolean }> = [];
    let current: any = null;

    for (let i = 0; i < formula.pipeline.length; i++) {
      const step = formula.pipeline[i];
      const t0 = Date.now();
      try {
        current = await this.executeStep(step, current, context, fetchLimit);
        const truncated = Array.isArray(current) && current.length > 200;
        const debugOutput = truncated ? current.slice(0, 200) : current;
        steps.push({ index: i, type: step.type, durationMs: Date.now() - t0, output: debugOutput, truncated });
      } catch (err) {
        steps.push({ index: i, type: step.type, durationMs: Date.now() - t0, output: null, error: (err as Error).message });
        break;
      }
    }
    return { steps };
  }

  /**
   * Exécute un pipeline DSL et retourne le résultat brut du pipeline.
   * - Si le résultat est un number  → valeur scalaire (card / gauge / line-chart)
   * - Si le résultat est un object  → { clé: valeur } (bar-chart par champ)
   * - Si le résultat est un array   → [{ bucket, count }] (histogram)
   * Enregistre un log d'exécution dans indicator_execution_logs.
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
   * Détecte si une formule a la forme "agrégat simple sur SessionData" éligible au calcul
   * incrémental (delta) : fetch(SessionData, contextFields incluant user_id) → extract(field)
   * → exactement un aggregate (avg/sum/count/min/max), suivi optionnellement de round/divide.
   * Retourne null si la formule a une autre forme (filter/join/groupBy/js, etc.) - ces
   * pipelines restent recalculés intégralement à chaque événement.
   */
  getIncrementalShape(formula: FormulaDefinition): { extractField: string; postSteps: FormulaStep[] } | null {
    const pipeline = formula?.pipeline ?? [];
    if (pipeline.length < 3) return null;

    const [fetchStep, extractStep, ...rest] = pipeline;

    if (fetchStep.type !== 'fetch') return null;
    const table = FormulaInterpreterService.LEGACY_TABLE_MAP[fetchStep.params?.table] ?? fetchStep.params?.table;
    if (table !== 'SessionData') return null;
    if (!(fetchStep.params?.contextFields ?? []).includes('user_id')) return null;

    if (extractStep.type !== 'extract' || !extractStep.params?.extractField) return null;

    if (!rest.every(s => ['aggregate', 'round', 'divide'].includes(s.type))) return null;
    const aggregateSteps = rest.filter(s => s.type === 'aggregate');
    if (aggregateSteps.length !== 1) return null;
    if (!['avg', 'sum', 'count', 'min', 'max'].includes(aggregateSteps[0].params?.aggregateFn)) return null;

    return { extractField: extractStep.params.extractField, postSteps: rest };
  }

  /** Applique la chaîne aggregate/round/divide sur un tableau de valeurs numériques déjà extraites. */
  applyPostSteps(values: number[], postSteps: FormulaStep[]): number {
    let current: any = values;
    for (const step of postSteps) {
      switch (step.type) {
        case 'aggregate': current = this.executeAggregate(step.params, current); break;
        case 'round':     current = this.executeRound(step.params, current); break;
        case 'divide':    current = this.executeDivide(step.params, current); break;
      }
    }
    return typeof current === 'number' ? current : 0;
  }

  /**
   * Calcul complet pour une formule "agrégat simple" (cf. getIncrementalShape) : exécute le
   * fetch, construit la map `sessionId → valeur extraite` (état initial pour le calcul
   * incrémental) et applique la chaîne aggregate/round/divide. Utilisé au premier événement
   * pour un (indicateur, utilisateur) et lors d'un recalcul complet.
   */
  async computeWithRowMap(
    formula: FormulaDefinition,
    context: FormulaContext,
    shape: { extractField: string; postSteps: FormulaStep[] },
  ): Promise<{ result: number; rowValues: Record<string, number> }> {
    const rows = await this.executeFetch(formula.pipeline[0].params, context);

    const rowValues: Record<string, number> = {};
    for (const row of rows) {
      const v = parseFloat(row[shape.extractField]);
      if (!isNaN(v) && row.id != null) rowValues[String(row.id)] = v;
    }

    return { result: this.applyPostSteps(Object.values(rowValues), shape.postSteps), rowValues };
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
      case 'js':        return this.executeJs(step.params, input);
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

    // Cas group_id : déclenche une requête JOIN vers CourseGroupsMember/CourseGroups.
    // L'activityId est résolu depuis le contexte (TARGET_ACTIVITY_ID via configuration).
    const wantsGroup = (contextFields as string[]).includes('group_id');
    if (wantsGroup && context.groupId) {
      const activityId = context.activityId;
      if (!activityId) {
        this.logger.warn(`Étape [fetch] ignorée : activityId manquant pour groupe ${context.groupId}`);
        return [];
      }
      const extraFilters: Record<string, string> = {};
      for (const col of contextFields as string[]) {
        if (col === 'group_id' || col === 'activity_id') continue;
        const ctxKey = FormulaInterpreterService.CONTEXT_FIELD_MAP[col];
        const val = ctxKey ? context[ctxKey] : undefined;
        if (val) extraFilters[col] = val as string;
      }
      return this.platonService.queryTableForGroup(table, context.groupId, activityId, extraFilters);
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
   * Exécute du code JS arbitraire dans un sandbox Node.js (vm module).
   * La variable `input` contient la sortie de l'étape précédente.
   * Le code doit retourner une valeur numérique (ou un tableau/objet passé à l'étape suivante).
   *
   * Note : pour une isolation maximale en production, remplacer par isolated-vm.
   */
  private executeJs(params: Record<string, any>, input: any): any {
    const { code } = params;
    if (!code?.trim()) return input;

    const sandbox = { input, result: undefined as any };
    const script = new vm.Script(`result = (function(input) { ${code} })(input);`);

    try {
      const ctx = vm.createContext(sandbox);
      script.runInContext(ctx, { timeout: 2000 });
      return sandbox.result;
    } catch (err) {
      const error = err as Error;
      // Détail complet (stack, chemins, infos internes du sandbox) uniquement dans les logs serveur.
      this.logger.error(`Erreur dans l'étape Code JS : ${error.stack ?? error.message}`);
      // Message renvoyé au client : type + message d'erreur JS, sans chemins ni références internes au sandbox.
      const safeMessage = (error.message || 'erreur inconnue')
        .replace(/evalmachine\.<anonymous>:\d+(:\d+)?/gi, 'le code')
        .replace(/\/[^\s:]+/g, '[chemin masqué]');
      throw new Error(`Erreur dans le code JS : ${safeMessage}`);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Vérifie si la donnée est un tableau de groupes (any[][]) */
  private isGroups(data: any): data is any[][] {
    return Array.isArray(data) && data.length > 0 && Array.isArray(data[0]);
  }
}
