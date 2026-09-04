// nterface de résultat reste partagée entre la modale de réutilisation et le wizard d'import, pour que le wizard puisse
//  recevoir directement le résultat de la modale et l'utiliser pour pré-remplir les champs du formulaire.
export interface ReuseIndicatorResult {
  useGroupContext: boolean;
  contextFields: string[];
}
