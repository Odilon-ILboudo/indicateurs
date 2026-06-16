// Ported from platon/libs/feature/resource/browser/src/lib/components/resource-version
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { MatCardModule } from '@angular/material/card'
import { FileVersion } from '../../resource-common'

@Component({
  standalone: true,
  selector: 'resource-version',
  templateUrl: './resource-version.component.html',
  styleUrls: ['./resource-version.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule],
})
export class ResourceVersionComponent {
  @Input() version!: FileVersion
}
