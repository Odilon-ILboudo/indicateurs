/*
Utilisé uniquement par le build indicateurs-embed en production (voir angular.json,
fileReplacements du projet indicateurs-embed). Contrairement à l'app standalone, le widget
tourne dans une page PLaTon (origine différente) : un chemin relatif '/api' irait vers le
domaine de PLaTon, pas celui d'Indicateurs. Adresse complète donc nécessaire ici.

À REMPLACER avant tout déploiement réel par le vrai domaine de production d'Indicateurs.
*/
export const environment = {
  production: true,
  apiUrl: 'https://<domaine-indicateurs-a-remplacer>/api',
  indicatorsApiUrl: 'https://<domaine-indicateurs-a-remplacer>/api',
  platonBaseUrl: 'https://platon.univ-eiffel.fr',
  platonLocalApiUrl: '',
};
