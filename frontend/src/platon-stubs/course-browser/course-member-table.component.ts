import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NzTableModule } from 'ng-zorro-antd/table'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm'
import { CourseMember, CourseMemberFilters } from '../course-common'
import { ChangeRoleEvent } from './course-member-role.pipe'

@Component({
  standalone: true,
  selector: 'course-member-table',
  template: `
    <nz-table
      #tbl
      nzSize="small"
      [nzData]="members"
      [nzLoading]="loading"
      [nzTotal]="total || members.length"
      [nzShowPagination]="(total || members.length) > 10"
      [nzFrontPagination]="true"
    >
      <thead>
        <tr>
          <th>Utilisateur/Groupe</th>
          <th>Date d'ajout</th>
          <th>Rôle</th>
          <th *ngIf="editable" nzAlign="center">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let m of tbl.data">
          <td>
            <span class="member-name">
              <span class="member-avatar" [style.background]="avatarColor(m)">
                {{ avatarInitial(m) }}
              </span>
              {{ displayName(m) }}
            </span>
          </td>
          <td>{{ m.createdAt | date:'dd/MM/yyyy' }}</td>
          <td>{{ roleLabel(m.role) }}</td>
          <td nzAlign="center" *ngIf="editable">
            <button
              *ngIf="!nonDeletables.includes(m.user?.id || '')"
              nz-button nzDanger nzType="primary" nzShape="circle" nzSize="small"
              nz-popconfirm
              nzOkText="Retirer"
              nzOkType="danger"
              [nzPopconfirmTitle]="'Voulez-vous vraiment retirer &quot;' + displayName(m) + '&quot; du ' + type + ' ?'"
              (nzOnConfirm)="deleted.emit(m)"
            >
              <i nz-icon nzType="delete"></i>
            </button>
          </td>
        </tr>
      </tbody>
    </nz-table>
  `,
  styles: [`
    .member-name { display: flex; align-items: center; gap: 8px; }
    .member-avatar {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      color: #fff; font-size: 13px; font-weight: 600; flex-shrink: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzTableModule, NzButtonModule, NzIconModule, NzPopconfirmModule],
})
export class CourseMemberTableComponent {
  @Input() members: CourseMember[] = []
  @Input() total = 0
  @Input() loading = false
  @Input() editable = false
  @Input() nonDeletables: string[] = []
  @Input() type = 'membre'

  @Input() filters: CourseMemberFilters = {}
  @Output() filtersChange = new EventEmitter<CourseMemberFilters>()
  @Output() deleted = new EventEmitter<CourseMember>()
  @Output() changeRole = new EventEmitter<ChangeRoleEvent>()

  protected displayName(m: CourseMember): string {
    if (m.user) {
      const u = m.user as { displayName?: string; username?: string; firstName?: string; lastName?: string }
      return u.displayName || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username || ''
    }
    return m.group?.name ?? (m.userId as string) ?? ''
  }

  protected avatarInitial(m: CourseMember): string {
    return this.displayName(m).charAt(0).toUpperCase()
  }

  protected avatarColor(m: CourseMember): string {
    const colors = ['#1677ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2']
    const key = m.user?.id ?? m.group?.id ?? ''
    let hash = 0
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff
    return colors[Math.abs(hash) % colors.length]
  }

  protected roleLabel(role?: string): string {
    return role === 'teacher' ? 'Enseignant' : role === 'student' ? 'Étudiant' : role ?? '-'
  }
}
