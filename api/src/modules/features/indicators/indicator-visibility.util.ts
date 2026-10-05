import { ContextType } from './entities/indicator-definition.entity';

/* Miroir de INDICATOR_VISIBILITY (frontend RoleService) - les deux doivent rester synchronisés à la main. */
export const INDICATOR_VISIBILITY: Record<ContextType, string[]> = {
  learner: ['student'],
  teacher: ['teacher'],
  admin: ['admin'],
  course: ['student', 'teacher', 'admin', 'demo'],
  activity: ['student', 'teacher', 'admin', 'demo'],
  group: ['teacher', 'admin'],
};

/* Même règle que `RoleService#canSeeIndicatorContext` côté front : `visibilityRoles` prend le dessus sur la règle par défaut. */
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
