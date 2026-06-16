// Ported from @cisstech/nge/ui/list
import { NgModule } from '@angular/core'
import { ListItemArticleComponent } from './list-item-article.component'
import { ListItemArticleActionComponent } from './list-item-article-action.component'
import { ListComponent } from './list.component'
import { ListTemplateComponent } from './list-template.component'

export { ListComponent } from './list.component'
export { ListTemplateComponent } from './list-template.component'
export type { ListContext, ListTemplateSlots } from './list-template.component'

export interface ListItemTag<T = unknown> {
  text: string
  color?: string
  data?: T
}

export interface ListAction<T = unknown> {
  color?: string
  side?: 'start' | 'end'
  icon?: string
  text?: string
  when?: (item: T) => boolean
  action: (item: T) => void | Promise<void>
}

@NgModule({
  imports: [ListItemArticleComponent, ListItemArticleActionComponent, ListComponent, ListTemplateComponent],
  exports: [ListItemArticleComponent, ListItemArticleActionComponent, ListComponent, ListTemplateComponent],
})
export class NgeUiListModule {}
