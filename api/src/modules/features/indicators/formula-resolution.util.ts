// src/modules/features/indicators/formula-resolution.util.ts
import { FormulaDefinition, IndicatorDefinition } from './entities/indicator-definition.entity';

/**
 * Retourne la formule DSL de l'indicateur.
 * 1 indicateur = 1 formule, partagée par toutes ses visualisations.
 */
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

/**
 * Un indicateur `learner`/`teacher`/`admin` est "activity-aware" si sa formule filtre
 * explicitement par `activity_id` (fetch ou join). Dans ce cas, sa valeur dépend de
 * l'activité consultée et ne doit être affichée que sur la page de cette activité
 * précise, jamais comme valeur "globale" dans le tableau de bord général.
 */
export function isActivityAware(formula: FormulaDefinition | null): boolean {
  return usesContextField(formula, 'activity_id');
}

/**
 * Un indicateur `group` est "course-aware" si sa formule filtre par `course_id`
 * plutôt que par `activity_id` : sa valeur agrège alors toutes les activités du
 * cours pour ce groupe, au lieu d'une seule activité précise. Mutuellement exclusif
 * avec isActivityAware() en pratique (voir executeFetch, branche wantsGroup).
 */
export function isCourseAware(formula: FormulaDefinition | null): boolean {
  return usesContextField(formula, 'course_id');
}
