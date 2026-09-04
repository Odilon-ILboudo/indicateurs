import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { Subscription } from 'rxjs'
import { NzDrawerModule } from 'ng-zorro-antd/drawer'
import { NzSelectModule } from 'ng-zorro-antd/select'
import { MatButtonModule } from '@angular/material/button'
import { MatRadioModule } from '@angular/material/radio'
import { MatDividerModule } from '@angular/material/divider'
import { CourseFilters, CourseOrderings } from '../course-common'
import { OrderingDirections } from '../core-common'

@Component({
  standalone: true,
  selector: 'course-filters',
  template: `
    <nz-drawer
      [nzClosable]="false"
      [nzVisible]="visible"
      nzPlacement="right"
      nzTitle="Recherche avancée"
      [nzFooter]="footer"
      (nzOnClose)="close()"
    >
      <ng-container *nzDrawerContent>
        <form [formGroup]="form">
          <section style="margin-bottom:1rem">
            <label style="display:block;font-weight:500;margin-bottom:0.5rem">Comment voulez-vous trier les résultats ?</label>
            <nz-select style="width:100%" nzPlaceHolder="Sélectionnez un mode de tri" formControlName="order">
              <nz-option nzLabel="Nom de A à Z"              nzValue="NAME-ASC" />
              <nz-option nzLabel="Nom de Z à A"              nzValue="NAME-DESC" />
              <nz-option nzLabel="Création : Récent-Ancient" nzValue="CREATED_AT-DESC" />
              <nz-option nzLabel="Création : Ancient-Récent" nzValue="CREATED_AT-ASC" />
              <nz-option nzLabel="MàJ : Récente-Ancienne"   nzValue="UPDATED_AT-DESC" />
              <nz-option nzLabel="MàJ : Ancienne-Récente"   nzValue="UPDATED_AT-ASC" />
            </nz-select>
          </section>
          <mat-divider />
          <section style="margin-top:1rem">
            <label style="display:block;font-weight:500;margin-bottom:0.5rem">Souhaitez-vous limiter les résultats à une certaine période de mise à jour ?</label>
            <mat-radio-group formControlName="period" style="display:flex;flex-direction:column;gap:0.5rem">
              <mat-radio-button [value]="0">Tout</mat-radio-button>
              <mat-radio-button [value]="1">1 jour</mat-radio-button>
              <mat-radio-button [value]="7">1 semaine</mat-radio-button>
              <mat-radio-button [value]="31">1 mois</mat-radio-button>
              <mat-radio-button [value]="180">6 mois</mat-radio-button>
              <mat-radio-button [value]="365">1 an</mat-radio-button>
            </mat-radio-group>
          </section>
        </form>
      </ng-container>
      <ng-template #footer>
        <button mat-stroked-button (click)="close()">Annuler</button>&nbsp;
        <button mat-raised-button color="primary" (click)="apply()">Appliquer</button>
      </ng-template>
    </nz-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    NzDrawerModule, NzSelectModule,
    MatButtonModule, MatRadioModule, MatDividerModule,
  ],
})
export class CourseFiltersComponent implements OnDestroy {
  private subs: Subscription[] = []
  protected visible = false
  protected form = this.createForm()

  @Input() filters: CourseFilters = {}
  @Output() triggered = new EventEmitter<CourseFilters>()

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()) }

  open(): void {
    this.form = this.createForm()
    this.form.patchValue({
      period: this.filters.period ?? 0,
      order: `${this.filters.order ?? CourseOrderings.UPDATED_AT}-${this.filters.direction ?? OrderingDirections.DESC}`,
    })
    this.visible = true
    this.cdr.markForCheck()
    this.subs.push(this.form.valueChanges.subscribe((value) => {
      const parts = (value.order ?? '').split('-') as [CourseOrderings, OrderingDirections]
      this.filters = { ...this.filters, order: parts[0], direction: parts[1], period: value.period as number }
    }))
  }

  protected close(): void {
    this.subs.forEach(s => s.unsubscribe())
    this.subs = []
    this.visible = false
    this.cdr.markForCheck()
  }

  protected apply(): void { this.triggered.emit(this.filters); this.close() }

  private createForm() {
    return new FormGroup({
      order: new FormControl(`${CourseOrderings.UPDATED_AT}-${OrderingDirections.DESC}`),
      period: new FormControl(0),
    })
  }
}
