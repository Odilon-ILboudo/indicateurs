// frontend/src/app/shared/utils/indicator-chart-options.util.ts
// Construction des options ECharts pour gauge/bar-chart/histogram - partagée entre la page détail
// d'un indicateur (indicator-detail.component.ts) et la modale de comparaison par groupe
// (group-snapshots-panel.component.ts), pour un rendu strictement identique aux deux endroits.
// Le type line-chart n'est PAS couvert ici : il dépend d'un historique temporel
// (result.metadata.history) qui n'existe que sur la page détail (computeView), pas sur des
// snapshots de comparaison ponctuels - il garde son propre traitement dans indicator-detail.
import type { EChartsOption } from 'echarts';
import { IndicatorVisualization } from '../../core/models/indicator.model';

export interface ChartResult {
  value: number;
  structuredValue?: unknown;
}

export interface ChartThresholds {
  good?: number | null;
  warning?: number | null;
  critical?: number | null;
}

export function buildIndicatorChartOptions(
  viz: IndicatorVisualization,
  result: ChartResult,
  thresholds: ChartThresholds | null | undefined,
): EChartsOption | null {
  const color = viz.color ?? '#5470c6';
  const unit = viz.unit ?? '';

  if (viz.type === 'gauge') {
    // Échelle proportionnelle aux seuils réellement configurés, pas de marge arbitraire : la
    // zone "critique" (au-delà de warning) reçoit la même largeur que la zone "moyen"
    // (good -> warning). Sans warning, on retombe sur l'ancien comportement (max = good).
    const max = thresholds?.warning != null
      ? thresholds.warning + (thresholds.warning - (thresholds?.good ?? 0))
      : (thresholds?.good ?? 100);

    // Arc principal (valeur) : couleur configurée par l'admin, uniforme sur tout l'arc - ne
    // représente plus les seuils (voir l'anneau extérieur ci-dessous pour ça).
    const series: any[] = [{
      type: 'gauge', radius: '70%', min: 0, max,
      // "progress" (rempli jusqu'à la valeur courante) porte la couleur configurée ; "axisLine"
      // est la piste de fond (toujours pleine à 100%) - doit rester neutre, sinon les deux se
      // superposent et donnent l'illusion d'un arc toujours plein.
      progress: { show: true, width: 18, itemStyle: { color } },
      axisLine: { lineStyle: { width: 18, color: [[1, '#e9e9e9']] } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      pointer: { show: true, length: '55%', width: 5, itemStyle: { color: '#595959' } },
      // "title" est un sous-composant DISTINCT de "detail" sur une jauge ECharts : affiche par
      // défaut le `name` du point de données (viz.label ci-dessous), superposé à la valeur -
      // explicitement désactivé, le libellé est déjà affiché ailleurs (titre d'onglet, titre de
      // section) donc inutile en double ici.
      title: { show: false },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '60%'],
        formatter: (v: number) => unit ? `{value|${v.toFixed(1)}}\n{unit|${unit}}` : `{value|${v.toFixed(1)}}`,
        rich: {
          value: { fontSize: 22, fontWeight: 700, color: '#333', lineHeight: 26 },
          unit: { fontSize: 12, color: '#888', lineHeight: 16 },
        },
      },
      data: [{ value: result.value, name: viz.label }],
    }];

    // Anneau extérieur fin délimitant les seuils (bon/moyen/critique) - seulement si des seuils
    // sont configurés, sinon aucun anneau supplémentaire (même logique que la bordure de statut
    // de la carte du tableau de bord). Mêmes bornes que getThresholdColor() côté carte :
    // val <= good -> vert, val <= warning -> orange, sinon rouge.
    if (thresholds?.good != null || thresholds?.warning != null) {
      const goodFrac = Math.min(1, (thresholds?.good ?? max) / max);
      const warningFrac = Math.min(1, (thresholds?.warning ?? max) / max);
      series.push({
        type: 'gauge', radius: '78%', min: 0, max,
        axisLine: { lineStyle: { width: 6, color: [[goodFrac, '#52c41a'], [warningFrac, '#faad14'], [1, '#ff4d4f']] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        pointer: { show: false }, progress: { show: false },
        detail: { show: false },
        data: [{ value: 0 }],
      });
    }

    return { series } as EChartsOption;
  }

  if (viz.type === 'bar-chart') {
    const raw = result.structuredValue ?? {};
    const entries: { key: string; val: number }[] = Array.isArray(raw)
      ? raw.map((e: any) => ({ key: e.key ?? e.label ?? String(e), val: e.value ?? 0 }))
      : Object.entries(raw).map(([k, v]) => ({ key: k, val: v as number }));
    return {
      tooltip: { trigger: 'axis', formatter: (p: any) => { const x = Array.isArray(p) ? p[0] : p; return `${x.name}<br/>${x.value} ${unit}`; } },
      xAxis: { type: 'value', name: unit, nameLocation: 'end' },
      yAxis: { type: 'category', data: entries.map(e => e.key),
        axisLabel: { width: 180, overflow: 'truncate', formatter: (v: string) => v.length > 25 ? v.slice(0, 25) + '…' : v } },
      series: [{ data: entries.map(e => e.val), type: 'bar', itemStyle: { color },
        label: { show: true, position: 'right', formatter: (p: any) => `${p.value} ${unit}` } }],
      grid: { containLabel: true, right: '15%' },
    } as EChartsOption;
  }

  if (viz.type === 'histogram') {
    const buckets: { bucket: number; count: number; users?: string[] }[] = (result.structuredValue as any) ?? [];
    return {
      tooltip: { trigger: 'axis', enterable: true,
        formatter: (p: any) => {
          const x = Array.isArray(p) ? p[0] : p;
          const item = x.data as { value: number; users?: string[] };
          const names = item?.users ?? [];
          return `<strong>${x.name} ${unit}</strong><br/>${item.value} étudiant(s)${names.length ? '<br/>' + names.map((n: string) => `&nbsp;• ${n}`).join('<br/>') : ''}`;
        },
      },
      xAxis: { type: 'category', data: buckets.map(b => String(b.bucket)), name: unit, nameLocation: 'end' },
      yAxis: { type: 'value', name: 'Effectif' },
      series: [{ data: buckets.map(b => ({ value: b.count, users: b.users ?? [] })),
        type: 'bar', itemStyle: { color }, label: { show: true, position: 'top' } }],
      grid: { containLabel: true },
    } as EChartsOption;
  }

  return null;
}
