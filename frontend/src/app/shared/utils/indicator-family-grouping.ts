import { IndicatorDefinition } from '../../core/models/indicator.model';

export type IndicatorDisplayRow =
  | { kind: 'standalone'; indicator: IndicatorDefinition }
  | { kind: 'circle'; circleName: string; members: IndicatorDefinition[]; expanded: boolean }
  | { kind: 'member'; indicator: IndicatorDefinition; circleName: string };

/**
 * Construit une liste d'affichage groupée par cercle à partir d'une liste d'indicateurs déjà
 * filtrée/triée : les membres d'un même cercle sont regroupés sous une ligne d'en-tête
 * repliable (positionnée à la 1ère occurrence du nom de cercle), et n'apparaissent que si
 * ce cercle figure dans `expandedCircles`. Les indicateurs sans cercle restent à leur
 * place, mêlés aux cercles.
 */
export function buildIndicatorDisplayRows(
  indicators: IndicatorDefinition[],
  expandedCircles: ReadonlySet<string>,
): IndicatorDisplayRow[] {
  const rows: IndicatorDisplayRow[] = [];
  const circleIndex = new Map<string, number>();

  for (const ind of indicators) {
    if (ind.circleName) {
      let idx = circleIndex.get(ind.circleName);
      if (idx === undefined) {
        idx = rows.length;
        circleIndex.set(ind.circleName, idx);
        rows.push({ kind: 'circle', circleName: ind.circleName, members: [], expanded: expandedCircles.has(ind.circleName) });
      }
      (rows[idx] as { kind: 'circle'; members: IndicatorDefinition[] }).members.push(ind);
    } else {
      rows.push({ kind: 'standalone', indicator: ind });
    }
  }

  const result: IndicatorDisplayRow[] = [];
  for (const row of rows) {
    result.push(row);
    if (row.kind === 'circle' && row.expanded) {
      for (const m of row.members) result.push({ kind: 'member', indicator: m, circleName: row.circleName });
    }
  }
  return result;
}
