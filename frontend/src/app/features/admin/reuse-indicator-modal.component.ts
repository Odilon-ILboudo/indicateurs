// Interface de résultat partagée entre la modale de réutilisation et le wizard, pour pré-remplir directement le formulaire.
export interface ReuseIndicatorResult {
  useGroupContext: boolean;
  contextFields: string[];
}
