import { Component, EventEmitter, Input, Output } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  standalone: true,
  selector: 'ui-modal-iframe',
  template: `
    <div *ngIf="visible" class="iframe-modal" [style.width]="width" [style.height]="height">
      <button *ngIf="closable" class="close-btn" (click)="close()">×</button>
      <iframe *ngIf="url" [src]="url" class="iframe-content"></iframe>
    </div>
  `,
  styles: [`
    .iframe-modal { position: fixed; top: 0; left: 0; z-index: 1000; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
    .close-btn { position: absolute; top: 1rem; right: 1rem; background: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; }
    .iframe-content { width: 90vw; height: 90vh; border: none; }
  `],
  imports: [CommonModule],
})
export class UiModalIFrameComponent {
  @Input() width = '100vw'
  @Input() height = '100vh'
  @Input() closable = true

  @Output() closed = new EventEmitter<void>()

  protected visible = false
  protected url?: string

  open(url: string): void {
    this.url = url
    this.visible = true
  }

  close(): void {
    this.visible = false
    this.url = undefined
    this.closed.emit()
  }
}
