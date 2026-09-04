import { Pipe, PipeTransform } from '@angular/core'
import { CourseMember, CourseMemberRoles } from '../course-common'

export interface ChangeRoleEvent {
  member: CourseMember
  newRole: CourseMemberRoles
  previousRole: CourseMemberRoles
}

@Pipe({ standalone: true, name: 'displayCourseMemberRole' })
export class DisplayCourseMemberRolePipe implements PipeTransform {
  transform(role: string): string {
    const map: Record<string, string> = {
      teacher: 'Enseignant',
      student: 'Élève',
    }
    return map[role] ?? role
  }
}
