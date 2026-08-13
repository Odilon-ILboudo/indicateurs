// frontend/src/app/features/admin/reuse-indicator-modal.component.ts
// Le composant modal a été retiré : la prévisualisation de réutilisation est désormais une vue
// interne de NewIndicatorChoiceModalComponent (règle du projet : jamais de modale ouverte
// par-dessus une autre modale, sauf sur le wizard lui-même). Seule cette interface de résultat
// reste partagée entre les deux fichiers.
export interface ReuseIndicatorResult {
  useGroupContext: boolean;
  contextFields: string[];
}
