import { IndicatorFormula } from '../../core/models/indicator.model';

function usesContextField(formula: IndicatorFormula | null | undefined, field: string): boolean {
  const pipeline = formula?.pipeline ?? [];
  return pipeline.some(step =>
    (step.type === 'fetch' || step.type === 'join') &&
    ((step.params?.['contextFields'] as string[] | undefined) ?? []).includes(field),
  );
}

/** "activity-aware" : la formule filtre par activity_id, sa valeur ne doit s'afficher que sur
 la page de cette activité précise, jamais comme valeur globale.
*/
export function isActivityAware(formula: IndicatorFormula | null | undefined): boolean {
  return usesContextField(formula, 'activity_id');
}

// "course-aware" : la formule filtre par course_id, sa valeur agrège tout le cours.
export function isCourseAware(formula: IndicatorFormula | null | undefined): boolean {
  return usesContextField(formula, 'course_id');
}
