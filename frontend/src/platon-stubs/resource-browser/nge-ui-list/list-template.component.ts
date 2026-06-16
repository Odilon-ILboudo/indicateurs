// Ported from @cisstech/nge/ui/list
import { Component, ContentChild, Input, TemplateRef } from '@angular/core'

export type ListTemplateSlots = 'row' | 'empty' | 'header' | 'noresult' | 'selection'

export interface ListContext<T> {
  readonly item: T
  readonly items: T[]
  readonly index: number
  readonly first: boolean
  readonly last: boolean
  readonly even: boolean
  readonly odd: boolean
}

@Component({
  standalone: true,
  selector: 'ui-list-template',
  template: '',
})
export class ListTemplateComponent<T = unknown> {
  @ContentChild(TemplateRef) template?: TemplateRef<ListContext<T> | unknown>
  @Input() slot?: ListTemplateSlots
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Input() when?: (context: any) => boolean
}
