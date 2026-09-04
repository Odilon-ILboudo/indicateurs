import { IndicatorDefinition } from '../../core/models/indicator.model';

export type IndicatorDisplayRow =
  | { kind: 'standalone'; indicator: IndicatorDefinition }
  | { kind: 'family'; familyName: string; members: IndicatorDefinition[]; expanded: boolean }
  | { kind: 'member'; indicator: IndicatorDefinition; familyName: string };

/**
Construit une liste d'affichage groupée par famille à partir d'une liste d'indicateurs déjà
filtrée/triée : les membres d'une même famille sont regroupés sous une ligne d'en-tête
repliable (positionnée à la 1ère occurrence du nom de famille), et n'apparaissent que si
cette famille figure dans `expandedFamilies`. Les indicateurs sans famille restent à leur
place, mêlés aux familles.
*/
export function buildIndicatorDisplayRows(
  indicators: IndicatorDefinition[],
  expandedFamilies: ReadonlySet<string>,
): IndicatorDisplayRow[] {
  const rows: IndicatorDisplayRow[] = [];
  const familyIndex = new Map<string, number>();

  for (const ind of indicators) {
    if (ind.familyName) {
      let idx = familyIndex.get(ind.familyName);
      if (idx === undefined) {
        idx = rows.length;
        familyIndex.set(ind.familyName, idx);
        rows.push({ kind: 'family', familyName: ind.familyName, members: [], expanded: expandedFamilies.has(ind.familyName) });
      }
      /*
      Une ligne "placeholder" fait exister la famille (via familyIndex ci-dessus) mais ne
      représente aucun indicateur réel - elle ne doit jamais apparaître comme membre.
      */
      if (!ind.isFamilyPlaceholder) {
        (rows[idx] as { kind: 'family'; members: IndicatorDefinition[] }).members.push(ind);
      }
    } else if (!ind.isFamilyPlaceholder) {
      rows.push({ kind: 'standalone', indicator: ind });
    }
  }

  const result: IndicatorDisplayRow[] = [];
  for (const row of rows) {
    result.push(row);
    if (row.kind === 'family' && row.expanded) {
      for (const m of row.members) result.push({ kind: 'member', indicator: m, familyName: row.familyName });
    }
  }
  return result;
}
