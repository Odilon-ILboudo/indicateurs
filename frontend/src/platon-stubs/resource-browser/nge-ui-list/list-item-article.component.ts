// Ported from @cisstech/nge/ui/list (list-item-article.component)
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, TemplateRef } from '@angular/core'
import { RouterModule } from '@angular/router'
import { IsStringPipe, IsTemplatePipe } from '../../nge-pipes'
import { ListItemTag } from './list'

@Component({
  standalone: true,
  selector: 'ui-list-item-article',
  templateUrl: './list-item-article.component.html',
  styleUrls: ['./list-item-article.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, IsTemplatePipe, IsStringPipe],
})
export class ListItemArticleComponent implements OnInit {
  @Input() articleTitle?: string | TemplateRef<unknown>
  @Input() articleUrl?: string | unknown[]
  @Input() articleBannerUrl?: string
  @Input() articleBannerAlt?: string
  @Input() articleIconUrl?: string
  @Input() articleIconAlt?: string
  @Input() articleDescription?: string | TemplateRef<unknown>
  @Input() articleTags: (string | ListItemTag)[] = []

  @Input() articleIconTemplate?: TemplateRef<unknown>
  @Input() articleTagIconTemplate?: TemplateRef<{ text: string; data?: unknown }>

  @Output() didClickTag = new EventEmitter<string>()
  @Output() didClickTagItem = new EventEmitter<ListItemTag>()
  @Output() didClickTitle = new EventEmitter<void>()

  protected isTagsCliclable = false

  ngOnInit(): void {
    this.isTagsCliclable = this.didClickTag.observed || this.didClickTagItem.observed
  }
}
