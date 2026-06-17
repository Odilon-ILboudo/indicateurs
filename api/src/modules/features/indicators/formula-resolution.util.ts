// src/modules/features/indicators/formula-resolution.util.ts
import { FormulaDefinition, IndicatorDefinition } from './entities/indicator-definition.entity';

/**
 * Retourne la formule DSL de l'indicateur.
 * 1 indicateur = 1 formule, partagée par toutes ses visualisations.
 */
export function resolveFormula(indicator: IndicatorDefinition): FormulaDefinition | null {
  return indicator.formula ?? null;
}
