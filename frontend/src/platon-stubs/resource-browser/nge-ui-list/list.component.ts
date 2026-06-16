// Ported from @cisstech/nge/ui/list
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import {
  AfterContentInit,
  Component,
  ContentChildren,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  QueryList,
  TemplateRef,
} from '@angular/core'

import { ListContext, ListTemplateComponent, ListTemplateSlots } from './list-template.component'

@Component({
  standalone: true,
  selector: 'ui-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  imports: [CommonModule, FormsModule],
})
export class ListComponent<T = unknown> implements OnChanges, AfterContentInit {
  @ContentChildren(ListTemplateComponent) protected templates!: QueryList<ListTemplateComponent<T>>

  @Input() idField!: string
  @Input() items: T[] = []
  @Input() trackBy?: string
  @Input() selectable = false
  @Input() filter?: string
  @Input() filterBy: string[] = []
  @Input() selections: T[] = []
  @Input() containerClass?: string

  @Output() selectionsChange = new EventEmitter<T[]>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _selectionStates: Record<string, boolean> = {}
  protected _noResultTemplate: TemplateRef<unknown> | null = null
  protected _emptyStateTemplate: TemplateRef<unknown> | null = null

  protected _empty = false

  protected get hasSelection(): boolean {
    return !!this.selections.length
  }

  protected get classes(): Record<string, boolean> {
    if (!this.containerClass) {
      return {}
    }
    return { [this.containerClass]: true }
  }

  ngOnChanges(): void {
    this._empty = !this.items?.length
    setTimeout(() => {
      this.checkSelections()
    }, 300)
  }

  ngAfterContentInit(): void {
    this._noResultTemplate = this.templates.find((e) => e.slot === 'noresult')?.template ?? null
    this._emptyStateTemplate = this.templates.find((e) => e.slot === 'empty')?.template ?? null
  }

  protected unselect(item: T): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = (item as any)[this.idField]
    this.selections = this.selections.filter((e) => e !== item)
    this._selectionStates[id] = false
    this.selectionsChange.emit(this.selections)
  }

  protected _trackBy = (index: number, item: T): unknown => {
    if (this.trackBy) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (item as any)[this.trackBy] ?? index
    }
    return index
  }

  protected _template(context: T | ListContext<T>, slot: ListTemplateSlots): TemplateRef<unknown> | null {
    return (
      this.templates.find((e) => {
        if (e.slot === slot && e.when) {
          return e.when(context)
        }
        return false
      })?.template ??
      this.templates.find((e) => e.slot === slot && !e.when)?.template ??
      null
    )
  }

  protected _isSelected(item: T): boolean {
    return !!this.selections.find((e) => e === item)
  }

  protected _toggleSelection(item: T): void {
    for (let i = 0; i < this.selections.length; i++) {
      if (this.equals(this.selections[i], item)) {
        this.selections.splice(i, 1)
        this.selectionsChange.emit(this.selections)
        return
      }
    }
    this.selections.push(item)
    this.selectionsChange.emit(this.selections)
  }

  protected _filtered(): T[] {
    if (!this.filter?.trim()) {
      return this.items
    }
    const term = this.filter.trim().toLowerCase()
    const fields = this.filterBy
    return this.items.filter((item) => {
      if (!fields.length) {
        return JSON.stringify(item).toLowerCase().includes(term)
      }
      return fields.some((field) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value = (item as any)[field]
        return value != null && String(value).toLowerCase().includes(term)
      })
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private equals(a: any, b: any): boolean {
    return a[this.idField] === b[this.idField]
  }

  private checkSelections(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.selections = this.selections.filter((selection: any) => {
      if (this.items.find((item) => this.equals(item, selection))) {
        return true
      }
      delete this._selectionStates[selection[this.idField]]
      return false
    })
    this.selectionsChange.emit(this.selections)
  }
}
