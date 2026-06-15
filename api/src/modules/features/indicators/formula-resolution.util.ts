// src/modules/features/indicators/formula-resolution.util.ts
import { FormulaDefinition, IndicatorDefinition } from './entities/indicator-definition.entity';

/**
 * Résout la formule DSL à utiliser pour un indicateur : la formule propre à la
 * visualisation ciblée (ou, sans vizId, la première visualisation ayant une formule),
 * sinon la formule legacy `indicator.formula`.
 */
export function resolveFormula(indicator: IndicatorDefinition, vizId?: string): FormulaDefinition | null {
  const vizList = indicator.visualizations ?? [];
  const viz = vizId
    ? vizList.find(v => v.id === vizId) ?? vizList[0]
    : vizList.find(v => v.formula?.pipeline?.length);
  return viz?.formula?.pipeline?.length ? viz.formula : indicator.formula;
}
