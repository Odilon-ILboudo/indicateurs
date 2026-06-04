// src/modules/features/indicators/interpreter/formula-interpreter.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as vm from 'vm';
import { PlatonService } from '../../../core/platon/platon.service';
import { IndicatorExecutionLog } from '../entities/indicator-execution-log.entity';

export interface FormulaStep {
  id: string;
  type: 'fetch' | 'filter' | 'groupBy' | 'findFirst' | 'extract' | 'aggregate' | 'round' | 'divide' | 'js';
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

  private async executeStep(step: FormulaStep, input: any, context: FormulaContext): Promise<any> {
    switch (step.type) {
      case 'fetch':     return this.executeFetch(step.params, context);
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

  private async executeFetch(params: Record<string, any>, context: FormulaContext): Promise<any[]> {
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

    return this.platonService.queryTable(table, filters);
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
        default:   return true;
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
      throw new Error(`Sandbox JS : ${(err as Error).message}`);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Vérifie si la donnée est un tableau de groupes (any[][]) */
  private isGroups(data: any): data is any[][] {
    return Array.isArray(data) && data.length > 0 && Array.isArray(data[0]);
  }
}
