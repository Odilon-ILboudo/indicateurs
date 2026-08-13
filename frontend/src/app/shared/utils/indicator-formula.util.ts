import { IndicatorFormula } from '../../core/models/indicator.model';

function usesContextField(formula: IndicatorFormula | null | undefined, field: string): boolean {
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
export function isActivityAware(formula: IndicatorFormula | null | undefined): boolean {
  return usesContextField(formula, 'activity_id');
}

/**
 * Un indicateur `learner`/`teacher`/`admin`/`group` est "course-aware" si sa formule filtre
 * par `course_id` plutôt que par `activity_id` : sa valeur agrège alors tout le cours
 * (toutes ses activités), au lieu d'une seule activité précise.
 */
export function isCourseAware(formula: IndicatorFormula | null | undefined): boolean {
  return usesContextField(formula, 'course_id');
}
