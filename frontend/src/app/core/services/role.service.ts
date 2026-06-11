// web/src/app/core/services/role.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { IndicatorScope } from '../models/indicator.model';

export type UserRole = 'student' | 'teacher' | 'admin' | 'demo';

/** Qui peut voir les indicateurs de chaque contexte (le rôle 'demo' suit la règle la plus
 *  restrictive - celle de 'student' - par défaut, faute de spécification dédiée). */
const INDICATOR_VISIBILITY: Record<IndicatorScope, UserRole[]> = {
  learner:  ['student'],
  teacher:  ['teacher'],
  admin:    ['admin'],
  course:   ['student', 'teacher', 'admin', 'demo'],
  activity: ['student', 'teacher', 'admin', 'demo'],
  group:    ['teacher', 'admin'],
};

@Injectable({ providedIn: 'root' })
export class RoleService {
  private currentRole = signal<UserRole>('student');

  // Computed values for UI
  isAdmin = computed(() => this.currentRole() === 'admin');
  isTeacher = computed(() => this.currentRole() === 'teacher');
  isStudent = computed(() => this.currentRole() === 'student');
  canManageIndicators = computed(() => this.isAdmin() || this.isTeacher());
  canCreateIndicators = computed(() => this.isAdmin());

  /** Le rôle courant peut-il voir les indicateurs de ce contexte (`learner`/`group`/...) ? */
  canSeeIndicatorContext(contextType: IndicatorScope): boolean {
    return INDICATOR_VISIBILITY[contextType]?.includes(this.currentRole()) ?? true;
  }

  setRole(role: UserRole): void {
    this.currentRole.set(role);
    localStorage.setItem('userRole', role);
  }
  
  getRole(): UserRole {
    return this.currentRole();
  }
  
  loadRoleFromStorage(): void {
    const savedRole = localStorage.getItem('userRole') as UserRole;
    if (savedRole && ['student', 'teacher', 'admin', 'demo'].includes(savedRole)) {
      this.currentRole.set(savedRole);
    }
  }
}