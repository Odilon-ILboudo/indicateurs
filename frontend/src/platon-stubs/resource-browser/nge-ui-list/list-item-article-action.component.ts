// Ported from @cisstech/nge/ui/list (list-item-article-action.component)
import { CommonModule } from '@angular/common'
import { Component, HostBinding, Input, TemplateRef } from '@angular/core'
import { IsTemplatePipe } from '../../nge-pipes'

@Component({
  standalone: true,
  selector: 'ui-list-item-article-action',
  templateUrl: './list-item-article-action.component.html',
  styleUrls: ['./list-item-article-action.component.scss'],
  imports: [CommonModule, IsTemplatePipe],
})
export class ListItemArticleActionComponent {
  @Input() actionTitle?: string | number | boolean | TemplateRef<unknown> | null

  @Input()
  @HostBinding('class.clickable')
  clickable = false
}
