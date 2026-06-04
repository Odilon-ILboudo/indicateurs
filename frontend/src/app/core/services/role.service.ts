// web/src/app/core/services/role.service.ts
import { Injectable, signal, computed } from '@angular/core';

export type UserRole = 'student' | 'teacher' | 'admin' | 'demo';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private currentRole = signal<UserRole>('student');
  
  // Computed values for UI
  isAdmin = computed(() => this.currentRole() === 'admin');
  isTeacher = computed(() => this.currentRole() === 'teacher');
  isStudent = computed(() => this.currentRole() === 'student');
  canManageIndicators = computed(() => this.isAdmin() || this.isTeacher());
  canCreateIndicators = computed(() => this.isAdmin());
  
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