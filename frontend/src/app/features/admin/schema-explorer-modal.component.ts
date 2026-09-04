import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzInputModule } from 'ng-zorro-antd/input';
import { IndicatorService } from '../../core/services/indicator.service';

/*
Modale "Schéma PLaTon" - autonome : charge elle-même son schéma complet (avec relations,
distinct de `platonSchema` chargé par IndicatorBuilderComponent pour les pickers de table du
pipeline), ouverte via NzModalService.create({ nzContent: SchemaExplorerModalComponent }).
*/
@Component({
  selector: 'ui-schema-explorer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTabsModule, NzBadgeModule, NzTagModule, NzToolTipModule, NzIconModule, NzSpinModule, NzInputModule],
  templateUrl: './schema-explorer-modal.component.html',
  styleUrls: ['./schema-explorer-modal.component.scss'],
})
export class SchemaExplorerModalComponent implements OnInit {
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly cdr = inject(ChangeDetectorRef);

  private schemaFull: {
    tables: { name: string; columns: { name: string; type: string; nullable: boolean }[] }[];
    relations: { sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string }[];
  } | null = null;

  schemaLoading = false;
  schemaSearch = '';
  schemaSelected: { name: string; columns: { name: string; type: string; nullable: boolean }[] } | null = null;
  schemaViewTab = 0;
  hoveredDiagNode: string | null = null;

  ngOnInit(): void {
    this.schemaLoading = true;
    this.indicatorSvc.getFullSchema().subscribe({
      next: data => { this.schemaFull = data; this.schemaLoading = false; this.cdr.detectChanges(); },
      error: () => { this.schemaLoading = false; },
    });
  }

  get filteredSchemaTables() {
    const q = this.schemaSearch.toLowerCase();
    return (this.schemaFull?.tables ?? []).filter(t => t.name.toLowerCase().includes(q));
  }

  selectSchemaTable(name: string): void {
    this.schemaSelected = this.schemaFull?.tables.find(t => t.name === name) ?? null;
  }

  schemaRelationsFor(tableName: string) {
    if (!this.schemaFull) return [];
    return this.schemaFull.relations.filter(
      r => r.sourceTable === tableName || r.targetTable === tableName,
    );
  }

  schemaFkOut(tableName: string) {
    return this.schemaFull?.relations.filter(r => r.sourceTable === tableName) ?? [];
  }

  schemaFkIn(tableName: string) {
    return this.schemaFull?.relations.filter(r => r.targetTable === tableName) ?? [];
  }

  schemaFkForCol(tableName: string, colName: string) {
    return this.schemaFull?.relations.filter(
      r => r.sourceTable === tableName && r.sourceColumn === colName,
    ) ?? [];
  }

  isSchemaFkCol(tableName: string, colName: string): boolean {
    return this.schemaFkForCol(tableName, colName).length > 0;
  }

  get schemaDiagram() {
    if (!this.schemaSelected || !this.schemaFull) return null;

    const NODE_W   = 210;
    const ROW_H    = 22;
    const HEADER_H = 32;
    const GAP_X    = 130;
    const GAP_Y    = 16;
    const PAD      = 24;
    const MAX_COLS = 12;

    type DiagCol  = { name: string; isFK: boolean; isPK: boolean; shortType: string };
    type DiagNode = { name: string; x: number; y: number; width: number; height: number; columns: DiagCol[]; isCenter: boolean; isIncoming: boolean };
    type DiagEdge = { path: string; isIncoming: boolean };

    const fkOut = this.schemaFkOut(this.schemaSelected.name);
    const fkIn  = this.schemaFkIn(this.schemaSelected.name);

    const center = this.schemaSelected.name;
    const outTables = [...new Set(fkOut.map(r => r.targetTable))].filter(t => t !== center);
    const inTables  = [...new Set(fkIn.map(r => r.sourceTable))].filter(t => t !== center);
    const selfRels  = fkOut.filter(r => r.targetTable === center);

    const shortType = (t: string) => {
      if (t.includes('character') || t === 'text') return 'varchar';
      if (t.includes('timestamp')) return 'ts';
      if (t === 'double precision') return 'float';
      if (t === 'boolean') return 'bool';
      return t.slice(0, 7);
    };

    const getTableCols = (name: string): DiagCol[] => {
      const raw = this.schemaFull!.tables.find(t => t.name === name)?.columns ?? [];
      return raw.slice(0, MAX_COLS).map(c => ({
        name: c.name,
        isFK: this.isSchemaFkCol(name, c.name),
        isPK: c.name === 'id',
        shortType: shortType(c.type),
      }));
    };

    const nodeH = (cols: DiagCol[]) => HEADER_H + cols.length * ROW_H + 6;

    const centerCols = getTableCols(this.schemaSelected.name);
    const centerH    = nodeH(centerCols);

    const outColSets = outTables.map(t => getTableCols(t));
    const inColSets  = inTables.map(t => getTableCols(t));
    const outHeights = outColSets.map(c => nodeH(c));
    const inHeights  = inColSets.map(c => nodeH(c));

    const totalOutH = outHeights.reduce((s, h) => s + h + GAP_Y, -GAP_Y);
    const totalInH  = inHeights.reduce((s, h) => s + h + GAP_Y, -GAP_Y);
    const totalH    = Math.max(centerH, totalOutH, totalInH, 50);

    const hasLeft = inTables.length > 0;
    const hasRight = outTables.length > 0;

    const centerX = PAD + (hasLeft ? NODE_W + GAP_X : 0);
    const centerY = PAD + Math.max(0, (totalH - centerH) / 2);

    const nodes: DiagNode[] = [];
    const edges: DiagEdge[] = [];

    // Centre
    nodes.push({ name: this.schemaSelected.name, x: centerX, y: centerY, width: NODE_W, height: centerH, columns: centerCols, isCenter: true, isIncoming: false });

    // Boucles auto-référentielles (ex: Sessions.parent_id → Sessions.id)
    const LOOP = 60;
    selfRels.forEach(rel => {
      const si = centerCols.findIndex(c => c.name === rel.sourceColumn);
      const ti = centerCols.findIndex(c => c.name === rel.targetColumn);
      if (si < 0 || ti < 0) return;
      const sx = centerX + NODE_W, sy = centerY + HEADER_H + si * ROW_H + ROW_H / 2;
      const tx = centerX + NODE_W, ty = centerY + HEADER_H + ti * ROW_H + ROW_H / 2;
      edges.push({
        path: `M ${sx} ${sy} C ${sx + LOOP} ${sy}, ${sx + LOOP} ${ty}, ${tx} ${ty}`,
        isIncoming: false,
      });
    });

    // Tables à droite (FK sortantes)
    const rightX = centerX + NODE_W + GAP_X;
    let ry = PAD + Math.max(0, (totalH - totalOutH) / 2);
    outTables.forEach((tname, i) => {
      const cols = outColSets[i];
      const h    = outHeights[i];
      nodes.push({ name: tname, x: rightX, y: ry, width: NODE_W, height: h, columns: cols, isCenter: false, isIncoming: false });

      fkOut.filter(r => r.targetTable === tname).forEach(rel => {
        const si = centerCols.findIndex(c => c.name === rel.sourceColumn);
        const ti = cols.findIndex(c => c.name === rel.targetColumn);
        if (si < 0 || ti < 0) return;
        const sx = centerX + NODE_W, sy = centerY + HEADER_H + si * ROW_H + ROW_H / 2;
        const tx = rightX,           ty = ry    + HEADER_H + ti * ROW_H + ROW_H / 2;
        const cx = sx + GAP_X * 0.45, dx = tx - GAP_X * 0.45;
        edges.push({ path: `M ${sx} ${sy} C ${cx} ${sy}, ${dx} ${ty}, ${tx} ${ty}`, isIncoming: false });
      });
      ry += h + GAP_Y;
    });

    // Tables à gauche (FK entrantes)
    const leftX = PAD;
    let ly = PAD + Math.max(0, (totalH - totalInH) / 2);
    inTables.forEach((tname, i) => {
      const cols = inColSets[i];
      const h    = inHeights[i];
      nodes.push({ name: tname, x: leftX, y: ly, width: NODE_W, height: h, columns: cols, isCenter: false, isIncoming: true });

      fkIn.filter(r => r.sourceTable === tname).forEach(rel => {
        const si = cols.findIndex(c => c.name === rel.sourceColumn);
        const ti = centerCols.findIndex(c => c.name === rel.targetColumn);
        if (si < 0 || ti < 0) return;
        const sx = leftX + NODE_W, sy = ly      + HEADER_H + si * ROW_H + ROW_H / 2;
        const tx = centerX,        ty = centerY + HEADER_H + ti * ROW_H + ROW_H / 2;
        const cx = sx + GAP_X * 0.45, dx = tx - GAP_X * 0.45;
        edges.push({ path: `M ${sx} ${sy} C ${cx} ${sy}, ${dx} ${ty}, ${tx} ${ty}`, isIncoming: true });
      });
      ly += h + GAP_Y;
    });

    const totalW = PAD + (hasLeft ? NODE_W + GAP_X : 0) + NODE_W + (hasRight ? GAP_X + NODE_W : 0) + PAD;
    const svgH   = totalH + PAD * 2;

    return { nodes, edges, width: totalW, height: svgH, viewBox: `0 0 ${totalW} ${svgH}` };
  }
}
