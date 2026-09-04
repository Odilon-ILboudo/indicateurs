import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { Activity } from '../course-common'
import { API } from './course-api.util'

@Component({
  standalone: true,
  selector: 'course-csv-download-button',
  template: `
    <button nz-button nzSize="small" [disabled]="!activities.length" (click)="download()">
      Télécharger les notes au format CSV
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzButtonModule, NzIconModule],
})
export class CsvDownloadButtonComponent {
  @Input() activities: Activity[] = []
  @Input() name = ''
  @Input() type = 'course'
  @Input() courseId?: string

  constructor(private readonly http: HttpClient) {}

  download(): void {
    const activityId = this.activities[0]?.id
    const cId = this.courseId ?? activityId ?? '_'
    if (!activityId) return
    this.http
      .get(`${API}/courses/${cId}/activities/${activityId}/csv`, { responseType: 'blob' })
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${this.name || activityId}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
  }
}
