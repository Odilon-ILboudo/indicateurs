import { ContextType } from './entities/indicator-definition.entity';

/**
 * Miroir exact de INDICATOR_VISIBILITY (frontend/src/app/core/services/role.service.ts) - les
 * deux DOIVENT rester synchronisés à la main, il n'y a pas de source unique partagée entre le
 * front (Angular) et l'API (NestJS), deux projets/builds séparés.
 *
 * Trouvé en auditant la visibilité des indicateurs (2026-08-28) : cette règle n'était appliquée
 * QUE côté client jusqu'ici - un utilisateur authentifié pouvait activer et calculer n'importe
 * quel indicateur via un appel direct à l'API (hors interface Angular), y compris ceux réservés
 * teacher/admin/group, ou marqués "donnée nominative" dans leur `interpretationHint` sans que
 * `visibilityRoles` ne soit réellement configuré pour l'appliquer. Voir `IndicatorVisibilityGuard`.
 */
export const INDICATOR_VISIBILITY: Record<ContextType, string[]> = {
  learner: ['student'],
  teacher: ['teacher'],
  admin: ['admin'],
  course: ['student', 'teacher', 'admin', 'demo'],
  activity: ['student', 'teacher', 'admin', 'demo'],
  group: ['teacher', 'admin'],
};

/** Même règle que `RoleService#canSeeIndicatorContext` côté front : `visibilityRoles`, quand
 *  renseigné sur l'indicateur, prend le dessus sur la règle par défaut du contextType. */
export function canRoleSeeIndicator(
  role: string | undefined | null,
  contextType: ContextType,
  visibilityRoles?: string[] | null,
): boolean {
  if (!role) return false;
  if (visibilityRoles && visibilityRoles.length > 0) {
    return visibilityRoles.includes(role);
  }
  return INDICATOR_VISIBILITY[contextType]?.includes(role) ?? true;
}
