import { FormulaDefinition, IndicatorDefinition } from './entities/indicator-definition.entity';

/** 1 indicateur = 1 formule, partagée par toutes ses visualisations. */
export function resolveFormula(indicator: IndicatorDefinition): FormulaDefinition | null {
  return indicator.formula ?? null;
}

function usesContextField(formula: FormulaDefinition | null, field: string): boolean {
  const pipeline = formula?.pipeline ?? [];
  return pipeline.some(step =>
    (step.type === 'fetch' || step.type === 'join') &&
    ((step.params?.['contextFields'] as string[] | undefined) ?? []).includes(field),
  );
}

/** "activity-aware" : la formule filtre par activity_id, sa valeur ne doit s'afficher que sur
 *  la page de cette activité précise, jamais comme valeur globale. */
export function isActivityAware(formula: FormulaDefinition | null): boolean {
  return usesContextField(formula, 'activity_id');
}

/** "course-aware" : la formule filtre par course_id, sa valeur agrège tout le cours. */
export function isCourseAware(formula: FormulaDefinition | null): boolean {
  return usesContextField(formula, 'course_id');
}
