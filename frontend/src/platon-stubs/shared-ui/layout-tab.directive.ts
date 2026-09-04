import { ContentChild, Directive, Input, TemplateRef } from '@angular/core'

@Directive({ standalone: true, selector: 'ui-layout-tab' })
export class UiLayoutTabDirective {
  @Input() link!: string | string[]
  @Input() linkParams?: Record<string, unknown>

  @ContentChild(TemplateRef, { static: true })
  templateRef!: TemplateRef<void>
}
