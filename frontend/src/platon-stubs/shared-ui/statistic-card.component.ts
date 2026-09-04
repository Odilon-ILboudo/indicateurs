import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, TemplateRef, booleanAttribute } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { MatIconModule } from '@angular/material/icon'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzToolTipModule } from 'ng-zorro-antd/tooltip'
import { NzInputNumberModule } from 'ng-zorro-antd/input-number'

export const positiveGreenColor = (value: number) => {
  if (value >= 80) return '#52C41A'
  if (value > 40 && value < 90) return 'var(--brand-text-primary, #090A39D9)'
  if (value == 0) return '#FF1414'
  return '#FAAD14'
}

export const positiveRedColor = (value: number) => {
  if (value >= 80) return '#FAAD14'
  if (value > 40 && value < 90) return 'var(--brand-text-primary, #090A39D9)'
  return '#52C41A'
}

@Component({
  standalone: true,
  selector: 'ui-statistic-card',
  template: `
    <div class="statistic-card" (click)="onCardClick()" [ngClass]="{ editable: edit }">
      <div [style.background-color]="ribbonColor" class="ribbon" *ngIf="icon || matIcon || nzIcon">
        <span>
          <ng-container *ngIf="icon">
            <ng-container *ngTemplateOutlet="icon"></ng-container>
          </ng-container>
          <mat-icon class="ribbon-icon" *ngIf="matIcon">{{ matIcon }}</mat-icon>
          <span class="ribbon-icon" *ngIf="nzIcon" nz-icon [nzType]="nzIcon" nzTheme="outline"></span>
        </span>
      </div>
      <div class="value" [style.color]="valueColor">
        <ng-container *ngIf="!isEditing">{{ value }} {{ valueSuffix }}</ng-container>
        <ng-container *ngIf="isEditing">
          <nz-input-number
            (keydown)="onKeydown($event)"
            nzId="input-edit-value"
            [(ngModel)]="value"
            nzMin="0"
            nzMax="100"
            (focusout)="onFocusOut()"
          />
        </ng-container>
      </div>
      <div class="description">
        {{ description }} <mat-icon *ngIf="tooltip" [nz-tooltip]="tooltip">info_circle</mat-icon>
      </div>
      <div>
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .statistic-card {
      position: relative;
      width: 100%;
      padding: 20px;
      background-color: var(--brand-background-components, #fff);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
    }
    .value {
      font-size: 1.8em;
      font-weight: bold;
      color: var(--brand-text-primary, #000);
    }
    .description {
      display: flex;
      gap: 4px;
      align-items: center;
      margin-top: 10px;
      font-size: 16px;
      color: var(--brand-text-secondary, #666);
    }
    .ribbon {
      position: absolute;
      top: 0;
      right: 0;
      width: 32px;
      height: 32px;
      background-color: #3498db;
      clip-path: polygon(100% 0, 100% 70%, 50% 100%, 0 70%, 0 0);
      border-top-right-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .ribbon .ribbon-icon {
      margin: 0;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .editable {
      cursor: pointer;
      user-select: none;
    }
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, NzIconModule, NzToolTipModule, NzInputNumberModule],
})
export class UiStatisticCardComponent implements OnChanges {
  protected isEditing = false

  @Input() icon?: TemplateRef<unknown>
  @Input() nzIcon?: string
  @Input() matIcon?: string
  @Input() value!: number | string
  @Input() valueSuffix = ''
  @Input() valueColor = 'var(--brand-text-primary, #000)'
  @Input() tooltip?: string
  @Input() description!: string
  @Input() ribbonColor = '#3498db'
  @Input({ transform: booleanAttribute }) shouldBePositive?: boolean
  @Input({ transform: booleanAttribute }) shouldBeZero?: boolean
  @Input() edit = false

  @Output() valueChanged = new EventEmitter<number>()

  ngOnChanges() {
    if (this.shouldBePositive) {
      this.valueColor = positiveGreenColor(Number(this.value))
    }
    if (this.shouldBeZero) {
      this.valueColor = positiveRedColor(Number(this.value))
    }
  }

  onCardClick() {
    if (this.edit) {
      this.isEditing = true
      setTimeout(() => {
        const input = document.getElementById('input-edit-value')
        if (input) input.focus()
      }, 0)
    }
  }

  onFocusOut() {
    this.isEditing = false
    this.valueChanged.emit(Number(this.value))
  }

  onKeydown(event: KeyboardEvent) {
    event.stopPropagation()
    event.stopImmediatePropagation()
    if (event.key === 'Enter') {
      this.isEditing = false
      this.valueChanged.emit(Number(this.value))
    } else if (event.key === 'Escape') {
      this.isEditing = false
    }
    this.ngOnChanges()
  }
}
