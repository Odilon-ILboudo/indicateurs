// Ported from platon/libs/feature/resource/browser/src/lib/components/circle-tree
import { CommonModule } from '@angular/common'
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
  booleanAttribute,
} from '@angular/core'
import { RouterModule } from '@angular/router'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzTreeViewComponent, NzTreeViewModule } from 'ng-zorro-antd/tree-view'

import { CircleTree } from '../../resource-common'

@Component({
  standalone: true,
  selector: 'resource-circle-tree',
  templateUrl: './circle-tree.component.html',
  styleUrls: ['./circle-tree.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, NzIconModule, NzTreeViewModule],
})
export class CircleTreeComponent implements OnInit, AfterViewInit {
  @ViewChild(NzTreeViewComponent) protected treeView?: NzTreeViewComponent<FlatNode>

  @Input() tree!: CircleTree

  /**
   * The ids of the selected nodes.
   * @remarks
   * - during initialization, the selection is updated to remove non existing ids.
   */
  @Input() selection: string[] = []

  /**
   * If true, multiple nodes can be selected.
   */
  @Input({ transform: booleanAttribute }) multiple = false

  /**
   * If provided, only nodes with ids in this list will be displayed.
   */
  @Input() visibleNodeIds?: string[]

  /**
   * Disable nodes that are not readable or writable by the current user.
   * @remarks
   * - In non selection mode, non writable nodes are not disabled.
   */
  @Input({ transform: booleanAttribute }) disableFromPermissions = true

  /**
   * Emits the ids of the selected nodes.
   */
  @Output() selectionChange = new EventEmitter<string[]>()

  protected dataNodes: FlatNode[] = []
  protected checklistSelection = new Set<string>()
  protected disabled = false

  protected get selectable(): boolean {
    return this.selectionChange.observed
  }

  protected nzLevelAccessor = (node: FlatNode): number => node.level

  ngOnInit(): void {
    this.dataNodes = this.flatten(this.tree, 0)
  }

  ngAfterViewInit(): void {
    if (!this.treeView) {
      return
    }

    const expansionModel = this.treeView._getExpansionModel()
    if (this.selectable) {
      this.dataNodes.forEach((node) => expansionModel.select(node))
    } else {
      const firstNode = this.dataNodes[0]
      if (firstNode) {
        expansionModel.select(firstNode)
      }
    }

    this.checklistSelection = new Set(
      this.dataNodes.filter((node) => this.selection.includes(node.id) && !node.disabled).map((node) => node.id)
    )
    this.selectionChange.emit([...this.checklistSelection])
  }

  protected hasChild = (_: number, node: FlatNode): boolean => node.expandable

  protected trackBy = (_: number, node: FlatNode): string => `${node.id}-${node.name}`

  protected isSelected(node: FlatNode): boolean {
    return this.checklistSelection.has(node.id)
  }

  protected selectionToggle(node: FlatNode): void {
    if (this.checklistSelection.has(node.id)) {
      this.checklistSelection.delete(node.id)
    } else {
      if (!this.multiple) {
        this.checklistSelection.clear()
      }
      this.checklistSelection.add(node.id)
    }
    this.selectionChange.emit([...this.checklistSelection])
  }

  private flatten(node: CircleTree, level: number): FlatNode[] {
    const children = this.visibleNodeIds
      ? node.children?.filter((child) => this.visibleNodeIds?.includes(child.id))
      : node.children

    const flatNode: FlatNode = {
      id: node.id,
      name: node.name,
      level,
      expandable: !!children && children.length > 0,
      disabled:
        this.disableFromPermissions && (!node.permissions?.read || (this.selectable && !node.permissions?.write)),
    }

    const result: FlatNode[] = [flatNode]
    children?.forEach((child) => result.push(...this.flatten(child, level + 1)))
    return result
  }
}

interface FlatNode {
  id: string
  name: string
  level: number
  disabled: boolean
  expandable: boolean
}
