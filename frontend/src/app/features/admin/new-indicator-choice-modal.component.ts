// frontend/src/app/features/admin/new-indicator-choice-modal.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition } from '../../core/models/indicator.model';
import { IndicatorReuseCardComponent } from '../../shared/ui/indicator-reuse-card/indicator-reuse-card.component';
import { ReuseIndicatorResult } from './reuse-indicator-modal.component';
import {
  PipelineStep, ImportedIndicatorMeta, PlatonTableSchema, ImportErrorDisplay,
  parseIndicatorImport, toImportErrorDisplay, replaceValueInText,
} from './pipeline-import.util';

export type NewIndicatorChoiceResult =
  | { mode: 'blank' }
  | { mode: 'reuse'; source: IndicatorDefinition; override: ReuseIndicatorResult }
  | { mode: 'import'; pipeline: PipelineStep[]; meta: ImportedIndicatorMeta };

type ChoiceView = 'menu' | 'reuse' | 'reuse-preview' | 'import';

/** Première étape avant d'ouvrir le wizard de création : demande explicitement de partir de
 *  zéro, de réutiliser un indicateur existant, ou d'importer un YAML/JSON complet - au lieu de
 *  laisser ces options enfouies dans les étapes du wizard lui-même. Le wizard s'ouvre ensuite
 *  déjà pré-rempli selon le choix fait ici.
 *
 *  Règle stricte du projet : jamais de modale ouverte par-dessus une autre modale (seul le
 *  wizard peut recevoir une modale par-dessus lui). Toutes les étapes intermédiaires (galerie de
 *  réutilisation, prévisualisation avant application, import) sont donc des VUES internes de
 *  cette même modale (`view`), jamais des modales imbriquées. */
@Component({
  selector: 'ui-new-indicator-choice-modal',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, NzButtonModule, NzInputModule, NzRadioModule,
    NzSwitchModule, NzSelectModule, NzTagModule, NzDividerModule, NzTooltipModule,
    IndicatorReuseCardComponent,
  ],
  template: `
    <div class="choice-modal">

      <!-- ── Menu principal ─────────────────────────────────────────────── -->
      <div class="choice-menu" *ngIf="view === 'menu'">
        <button class="choice-card" (click)="chooseBlank()">
          <mat-icon>add_circle_outline</mat-icon>
          <div>
            <strong>Créer à partir de zéro</strong>
            <span>Wizard vierge, en 3 étapes.</span>
          </div>
        </button>
        <button class="choice-card" (click)="setView('reuse')">
          <mat-icon>content_copy</mat-icon>
          <div>
            <strong>Réutiliser un indicateur existant</strong>
            <span>Copier le pipeline d'un indicateur déjà créé comme point de départ.</span>
          </div>
        </button>
        <button class="choice-card" (click)="setView('import')">
          <mat-icon>upload_file</mat-icon>
          <div>
            <strong>Importer un YAML/JSON</strong>
            <span>Coller ou charger un indicateur complet déjà écrit.</span>
          </div>
        </button>
      </div>

      <!-- ── Réutiliser : galerie ───────────────────────────────────────── -->
      <div class="choice-panel" *ngIf="view === 'reuse'">
        <div class="choice-panel-header">
          <button nz-button nzType="text" nzSize="small" (click)="setView('menu')">
            <span nz-icon nzType="left"></span>
          </button>
          <h3>Réutiliser un indicateur existant</h3>
          <input nz-input nzSize="large" [(ngModel)]="searchText" placeholder="Rechercher par nom..."
            class="choice-search">
        </div>
        <div class="choice-gallery" *ngIf="filteredIndicators().length; else noResult">
          <ui-indicator-reuse-card *ngFor="let ind of filteredIndicators()"
            [indicator]="ind" (selected)="onSelectReuseSource(ind)">
          </ui-indicator-reuse-card>
        </div>
        <ng-template #noResult>
          <p class="choice-hint choice-empty">Aucun indicateur trouvé.</p>
        </ng-template>
      </div>

      <!-- ── Réutiliser : prévisualisation avant application ────────────── -->
      <div class="choice-panel" *ngIf="view === 'reuse-preview' && reuseSource as source">
        <div class="choice-panel-header">
          <button nz-button nzType="text" nzSize="small" (click)="setView('reuse')">
            <span nz-icon nzType="left"></span>
          </button>
          <h3>Réutiliser « {{ source.name }} »</h3>
        </div>
        <p class="choice-hint">
          Copie {{ source.name }} comme point de départ (nom, description, contexte, événements
          déclencheurs, seuils, visualisations et pipeline) - tout reste modifiable ensuite, y
          compris le nom.
        </p>
        <div class="reuse-preview">
          <span class="reuse-preview-label">Pipeline source ({{ source.formula?.pipeline?.length ?? 0 }} étapes)</span>
          <div class="reuse-preview-chips">
            <nz-tag *ngFor="let s of source.formula?.pipeline">{{ s.label || s.type }}</nz-tag>
          </div>
        </div>
        <nz-divider nzDashed nzText="Redéfinir la récupération des données (optionnel)"></nz-divider>
        <div class="reuse-preview-row">
          <label>Requête groupe de TP <mat-icon class="info-icon" nz-tooltip="Activez pour filtrer automatiquement les lignes dont user_id appartient au groupe de TP sélectionné dans le contexte." nzTooltipPlacement="right">info_outline</mat-icon></label>
          <nz-switch [(ngModel)]="reuseUseGroupContext" nzCheckedChildren="Groupe" nzUnCheckedChildren="Non"></nz-switch>
        </div>
        <div class="reuse-preview-row">
          <label>Filtrer par contexte <mat-icon class="info-icon" nz-tooltip="Colonnes filtrées automatiquement selon le contexte courant. Seules user_id, activity_id et course_id sont supportées." nzTooltipPlacement="right">info_outline</mat-icon></label>
          <nz-select [(ngModel)]="reuseContextFields" nzMode="multiple" style="width:300px">
            <nz-option *ngFor="let f of reuseContextFilterCols" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
          </nz-select>
        </div>
        <div class="choice-import-actions">
          <button nz-button (click)="setView('reuse')">Annuler</button>
          <button nz-button nzType="primary" (click)="confirmReuse()">
            <span nz-icon nzType="copy"></span>
            Utiliser ce pipeline comme point de départ
          </button>
        </div>
      </div>

      <!-- ── Import YAML/JSON ───────────────────────────────────────────── -->
      <div class="choice-panel" *ngIf="view === 'import'">
        <div class="choice-panel-header">
          <h3>Importer un indicateur (YAML/JSON)</h3>
        </div>
        <div class="choice-import-wrap">
          <div class="choice-import-toolbar">
            <nz-radio-group [(ngModel)]="importMode" nzButtonStyle="solid">
              <label nz-radio-button nzValue="yaml">YAML</label>
              <label nz-radio-button nzValue="json">JSON</label>
            </nz-radio-group>
            <label class="choice-file-btn">
              <span nz-icon nzType="upload"></span> Charger un fichier
              <input type="file" style="display:none" accept=".yaml,.yml,.json" (change)="onFileUpload($event)">
            </label>
          </div>
          <textarea class="choice-import-editor" [(ngModel)]="importText" rows="28" spellcheck="false"
            [placeholder]="importMode === 'yaml' ? 'name: \\'...\\'\\npipeline:\\n  - type: fetch\\n    ...' : '{ \\'name\\': \\'...\\', \\'pipeline\\': [...] }'">
          </textarea>
          <div *ngIf="importError" class="choice-parse-error">
            <div class="choice-parse-error-header">
              <mat-icon class="choice-parse-error-icon">error_outline</mat-icon>
              <span class="choice-parse-error-main">{{ importError.main }}</span>
            </div>
            <div *ngIf="importError.available?.length" class="choice-parse-error-available">
              <span class="choice-parse-error-label">
                {{ importError.availableLabel ?? 'Valeurs disponibles' }}
                <span *ngIf="importError.wrongValue" class="choice-parse-error-clickable-hint">(cliquer pour corriger)</span>
                :
              </span>
              <div class="choice-parse-error-tags">
                <button *ngFor="let v of importError.available; let i = index"
                  class="choice-parse-error-tag"
                  [class.choice-parse-error-tag--clickable]="!!importError.wrongValue"
                  [disabled]="!importError.wrongValue"
                  (click)="applySuggestion(v)">{{ (importError.availableDisplay?.[i]) ?? v }}</button>
              </div>
            </div>
          </div>
          <p class="choice-hint" *ngIf="!importError">
            <mat-icon class="choice-hint-icon">info_outline</mat-icon>
            "name" et "pipeline" sont obligatoires - les autres champs (description, événements,
            seuils, visualisations) sont optionnels.
          </p>
          <div class="choice-import-actions">
            <button nz-button nzType="primary" nzSize="large" [disabled]="!importText.trim()" (click)="chooseImport()">
              Continuer <span nz-icon nzType="right"></span>
            </button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .choice-modal { display: flex; flex-direction: column; min-height: 320px; }

    .choice-menu { display: flex; flex-direction: column; gap: 12px; max-width: 480px; margin: 8px auto; }
    .choice-card {
      display: flex; align-items: center; gap: 16px; text-align: left;
      border: 1px solid #f0f0f0; border-radius: 10px; padding: 18px 20px;
      background: white; cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .1s;
    }
    .choice-card:hover { border-color: #722ed1; box-shadow: 0 4px 12px rgba(114,46,209,.12); transform: translateY(-1px); }
    .choice-card mat-icon { font-size: 30px; width: 30px; height: 30px; color: #722ed1; flex-shrink: 0; }
    .choice-card strong { display: block; font-size: 15px; }
    .choice-card span { font-size: 12px; color: #888; }

    .choice-panel { display: flex; flex-direction: column; }
    .choice-panel-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .choice-panel-header h3 { margin: 0; font-size: 15px; font-weight: 600; }

    /* Grille de cartes calquée sur .compare-cards-grid (modale "Comparaison par groupe") */
    .choice-search { margin-left: auto; width: 320px; }
    .choice-gallery {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .choice-empty { text-align: center; padding: 40px 0; }

    /* Prévisualisation de réutilisation */
    .reuse-preview { margin: 4px 0; }
    .reuse-preview-label { font-size: 13px; font-weight: 500; color: #444; }
    .reuse-preview-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .reuse-preview-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
    .reuse-preview-row label { display: flex; align-items: center; gap: 4px; }
    .info-icon {
      font-size: 14px !important; height: 14px; width: 14px; line-height: 1 !important;
      color: #8c8c8c; cursor: help; vertical-align: middle;
    }
    .info-icon:hover { color: #1890ff; }

    .choice-hint { color: #888; font-size: 12px; margin: 10px 0; display: flex; align-items: flex-start; gap: 6px; }
    .choice-hint-icon { font-size: 15px; width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px; color: #bbb; }
    .choice-import-wrap { width: 100%; }
    .choice-import-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .choice-file-btn { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: 13px; color: #722ed1; font-weight: 500; }
    .choice-import-editor {
      width: 100%; box-sizing: border-box; font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12.5px; line-height: 1.6; background: #fafafa; border: 1px solid #e8e8e8;
      border-radius: 6px; padding: 12px 14px; resize: vertical; min-height: 60vh;
    }
    .choice-import-editor:focus { border-color: #722ed1; outline: none; background: white; }
    .choice-import-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

    /* Erreur de validation - même style que .parse-error du wizard (étape Formules) */
    .choice-parse-error { margin-top: 10px; padding: 10px 12px; background: #fff2f0; border: 1px solid #ffccc7; border-radius: 6px; }
    .choice-parse-error-header { display: flex; align-items: flex-start; gap: 6px; }
    .choice-parse-error-icon { font-size: 16px; width: 16px; height: 16px; line-height: 1; color: #ff4d4f; flex-shrink: 0; margin-top: 1px; }
    .choice-parse-error-main { font-size: 12px; color: #a8071a; line-height: 1.5; }
    .choice-parse-error-available { margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffccc7; }
    .choice-parse-error-label { font-size: 11px; font-weight: 600; color: #8c8c8c; text-transform: uppercase; letter-spacing: 0.4px; display: block; margin-bottom: 6px; }
    .choice-parse-error-clickable-hint { font-weight: 400; font-size: 10px; color: #aaa; text-transform: none; letter-spacing: 0; margin-left: 4px; }
    .choice-parse-error-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .choice-parse-error-tag {
      font-size: 11px; font-family: 'SFMono-Regular', Consolas, monospace; background: #fff;
      border: 1px solid #ffa39e; border-radius: 3px; padding: 2px 7px; color: #cf1322;
      white-space: nowrap; cursor: default; line-height: 1.4;
    }
    .choice-parse-error-tag--clickable { cursor: pointer; transition: background 0.15s, border-color 0.15s, color 0.15s; }
    .choice-parse-error-tag--clickable:hover { background: #cf1322; border-color: #cf1322; color: #fff; }
  `],
})
export class NewIndicatorChoiceModalComponent implements OnInit {
  private readonly modalRef = inject(NzModalRef);
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly modalData = inject(NZ_MODAL_DATA) as { indicators: IndicatorDefinition[] };

  view: ChoiceView = 'menu';
  searchText = '';
  importMode: 'yaml' | 'json' = 'yaml';
  importText = '';
  importError: ImportErrorDisplay | null = null;

  // Réutilisation : indicateur choisi + paramètres de contexte redéfinissables avant application
  reuseSource: IndicatorDefinition | null = null;
  reuseUseGroupContext = false;
  reuseContextFields: string[] = [];
  readonly reuseContextFilterCols = [
    { value: 'user_id',     label: 'user_id - apprenant courant' },
    { value: 'activity_id', label: 'activity_id - activité sélectionnée' },
    { value: 'course_id',   label: 'course_id - cours sélectionné' },
  ];

  private platonSchema: PlatonTableSchema[] = [];

  ngOnInit(): void {
    // Nécessaire pour valider les noms de tables/colonnes d'un import avant de fermer cette
    // modale - sans quoi une erreur de ce type ne serait détectée qu'à l'ouverture du wizard.
    this.indicatorSvc.getPlatonSchema().subscribe({
      next: s => { this.platonSchema = s; },
      error: () => { this.platonSchema = []; },
    });
  }

  /** Le menu de choix initial reste réduit au minimum ; la modale ne s'agrandit que pour les
   *  vues qui en ont vraiment besoin (galerie de réutilisation, éditeur d'import). */
  setView(v: ChoiceView): void {
    this.view = v;
    this.modalRef.updateConfig(
      v === 'menu'
        ? { nzWidth: 480, nzBodyStyle: {} }
        : { nzWidth: '95vw', nzBodyStyle: { padding: '16px 20px', 'max-height': 'calc(90vh - 55px)', 'overflow-y': 'auto' } },
    );
  }

  filteredIndicators(): IndicatorDefinition[] {
    const q = this.searchText.trim().toLowerCase();
    const all = this.modalData.indicators ?? [];
    return q ? all.filter(i => i.name.toLowerCase().includes(q)) : all;
  }

  chooseBlank(): void {
    this.modalRef.close({ mode: 'blank' } as NewIndicatorChoiceResult);
  }

  /** Pas de modale imbriquée : la prévisualisation devient une vue de cette même modale. */
  onSelectReuseSource(source: IndicatorDefinition): void {
    this.reuseSource = source;
    const fetchStep: any = source.formula?.pipeline?.find((s: any) => s.type === 'fetch');
    const fields: string[] = fetchStep?.params?.contextFields ?? [];
    this.reuseUseGroupContext = fields.includes('group_id');
    this.reuseContextFields = fields.filter((f: string) => f !== 'group_id');
    this.setView('reuse-preview');
  }

  confirmReuse(): void {
    if (!this.reuseSource) return;
    const override: ReuseIndicatorResult = { useGroupContext: this.reuseUseGroupContext, contextFields: this.reuseContextFields };
    this.modalRef.close({ mode: 'reuse', source: this.reuseSource, override } as NewIndicatorChoiceResult);
  }

  onFileUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importMode = file.name.endsWith('.json') ? 'json' : 'yaml';
    const reader = new FileReader();
    reader.onload = e => { this.importText = (e.target?.result as string) ?? ''; this.importError = null; };
    reader.readAsText(file);
  }

  /** Valide entièrement le texte (clés obligatoires, types, tables/colonnes réelles...) avant
   *  de fermer la modale - en cas d'erreur, elle reste affichée ici, le wizard ne s'ouvre pas. */
  chooseImport(): void {
    if (!this.importText.trim()) return;
    this.importError = null;
    try {
      const { pipeline, meta } = parseIndicatorImport(this.importText, this.importMode, this.platonSchema);
      this.modalRef.close({ mode: 'import', pipeline, meta } as NewIndicatorChoiceResult);
    } catch (e: any) {
      this.importError = toImportErrorDisplay(e);
    }
  }

  applySuggestion(suggestion: string): void {
    const wrong = this.importError?.wrongValue;
    if (!wrong) return;
    this.importText = replaceValueInText(this.importText, wrong, suggestion);
    try {
      parseIndicatorImport(this.importText, this.importMode, this.platonSchema);
      this.importError = null;
    } catch (e: any) {
      this.importError = toImportErrorDisplay(e);
    }
  }
}
