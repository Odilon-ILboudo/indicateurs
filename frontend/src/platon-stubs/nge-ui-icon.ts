// Stub: @cisstech/nge/ui/icon
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, NgModule, Pipe, PipeTransform } from '@angular/core'
import { NzIconModule } from 'ng-zorro-antd/icon'

export interface FileIconOptions {
  alt?: string
  isRoot?: boolean
  expanded?: boolean
  isDirectory?: boolean
}

export interface Icon {
  readonly type: string
  readonly options?: FileIconOptions
}

export class ImgIcon implements Icon {
  readonly type = 'img'
  constructor(public readonly src: string, public readonly options?: FileIconOptions) {}
}

@Pipe({ name: 'iconFile', standalone: true })
export class IconFilePipe implements PipeTransform {
  transform(fileName: string, options?: FileIconOptions): Icon {
    return new ImgIcon(fileName, options)
  }
}

@Component({
  standalone: true,
  selector: 'ui-icon',
  template: `<span nz-icon [nzType]="nzType" nzTheme="twotone"></span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzIconModule],
})
export class IconComponent {
  @Input() icon?: Icon

  protected get nzType(): string {
    const options = this.icon?.options
    if (options?.isDirectory) {
      return options.expanded ? 'folder-open' : 'folder'
    }
    return 'file'
  }
}

@NgModule({
  imports: [IconComponent, IconFilePipe],
  exports: [IconComponent, IconFilePipe, NzIconModule],
})
export class NgeUiIconModule {}
