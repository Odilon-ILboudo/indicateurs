import { Injectable, signal, computed } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { IndicatorScope } from '../models/indicator.model';

export type UserRole = 'student' | 'teacher' | 'admin';

// Qui peut voir les indicateurs de chaque contexte.
const INDICATOR_VISIBILITY: Record<IndicatorScope, UserRole[]> = {
  learner:  ['student'],
  teacher:  ['teacher'],
  admin:    ['admin'],
  course:   ['student', 'teacher', 'admin'],
  activity: ['student', 'teacher', 'admin'],
  group:    ['teacher', 'admin'],
};

@Injectable({ providedIn: 'root' })
export class RoleService {
  private currentRole = signal<UserRole>('student');

  // Observable du rôle courant - émet à chaque changement (utile pour combineLatest).
  readonly role$: Observable<UserRole> = toObservable(this.currentRole);

  // Computed values for UI
  isAdmin = computed(() => this.currentRole() === 'admin');
  isTeacher = computed(() => this.currentRole() === 'teacher');
  isStudent = computed(() => this.currentRole() === 'student');
  canManageIndicators = computed(() => this.isAdmin() || this.isTeacher());
  canCreateIndicators = computed(() => this.isAdmin());

  /* Le rôle courant peut-il voir les indicateurs de ce contexte (`learner`/`group`/...) ?
   Si `visibilityRoles` est renseigné sur l'indicateur, il prend le dessus sur la règle par
   défaut du contextType (ex. restreindre un indicateur `course` nominatif à teacher/admin).
  */
  canSeeIndicatorContext(contextType: IndicatorScope, visibilityRoles?: string[] | null): boolean {
    if (visibilityRoles && visibilityRoles.length > 0) {
      return visibilityRoles.includes(this.currentRole());
    }
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
    if (savedRole && ['student', 'teacher', 'admin'].includes(savedRole)) {
      this.currentRole.set(savedRole);
    }
  }
}