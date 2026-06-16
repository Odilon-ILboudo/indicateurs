// Ported from platon/libs/feature/resource/browser/src/lib/components/resource-list
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core'

import { NzEmptyModule } from 'ng-zorro-antd/empty'

import { NgeUiListModule } from '../nge-ui-list/list'
import { Resource } from '../../resource-common'
import { ResourceItemComponent } from '../resource-item/resource-item.component'

@Component({
  standalone: true,
  selector: 'resource-list',
  templateUrl: './resource-list.component.html',
  styleUrls: ['./resource-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzEmptyModule, NgeUiListModule, ResourceItemComponent],
})
export class ResourceListComponent {
  @Input() items: Resource[] = []
  @Input() simple = false

  @Output() levelClicked = new EventEmitter<string>()
  @Output() topicClicked = new EventEmitter<string>()
}
