# Limites connues et points à trancher

Ce qui suit est vrai dans le code actuel.
Les choix qui restent à faire pour en corriger certaines sont dans
[decisions-a-prendre.md](./decisions-a-prendre.md).

| Sujet | État actuel | Conséquence |
|---|---|---|
| **WebSocket** | `this.server.emit(...)` envoie chaque mise à jour à **tous** les navigateurs connectés, sans salle par contexte ni contrôle du jeton à la connexion, avec `cors: { origin: '*' }`. | Un client peut recevoir des valeurs (identifiant de contexte + valeur) qui ne le concernent pas. À corriger avant une vraie mise en production : authentifier la connexion socket et diffuser par salle (`userId`, `courseId`…). |
| **Messages en échec** | Pas de file d'erreurs (DLX) ni de nombre de tentatives borné sur les files RabbitMQ. | Un message qui échoue toujours n'est ni mis de côté ni signalé proprement. |
| **Délai du relais** | Le relais lit l'outbox toutes les 2 s, par lots de 200. | Mise à jour quasi temps réel, pas instantanée. Suffisant pour des indicateurs pédagogiques. |
| **Règles de visibilité en double** | `INDICATOR_VISIBILITY` existe côté API et côté frontend (`RoleService`), à synchroniser à la main ; elles diffèrent déjà (rôle `demo` côté API seulement). | Risque de divergence à chaque modification. L'API reste l'autorité (le guard refuse), le frontend ne fait que masquer. |
| **Indicateurs figés et visibilité** | La page cours ou activité affiche un indicateur figé sans vérifier `visibilityRoles`. | Un étudiant peut voir la carte d'un indicateur qui lui est interdit ; l'API refuse ensuite sa valeur (403), donc la carte reste en erreur. |
| **Co-enseignant jamais notifié** | Pour un indicateur `teacher`, l'événement recalcule la valeur du seul propriétaire du cours (`getTeacherByCourse` lit `Courses.owner_id`), jamais celle des autres membres `teacher` de `CourseMembers`. | La valeur d'un co-enseignant n'est pas rafraîchie par les événements : elle reste celle du dernier calcul (à l'activation de l'indicateur, ou par le bouton « Recalculer » de l'admin). |
| **Sessions supprimées** | Les déclencheurs ne surveillent pas `DELETE`. | Une session supprimée reste dans le cache du calcul différentiel jusqu'au prochain calcul complet. |
| **Historique des valeurs** | `metadata.history` reçoit une entrée à chaque calcul, sans limite. | La ligne grossit sans fin pour un indicateur souvent recalculé. |
| **Lignes copiées par le déclencheur** | Le déclencheur générique copie la ligne entière (`to_jsonb(NEW)`), sans le filtre des colonnes sensibles. | Une règle posée sur une table comme `Users` ferait passer ses colonnes sensibles dans l'outbox et dans RabbitMQ. Il n'y a pas de liste blanche de tables pour les règles. |
| **Domaine de production** | `frontend/src/environments/environment.embed.prod.ts` contient encore `<domaine-indicateurs-a-remplacer>`. | À remplacer avant tout déploiement réel du widget. |
| **Versionnage du widget** | Le script est servi sans numéro de version (`outputHashing: "none"`). `location /embed/` envoie `Cache-Control: no-cache` : le navigateur revérifie le script à chaque chargement. | Pas de numéro de version, et rien ne prévient PLaTon d'une nouvelle version : à décider avec l'équipe PLaTon. |
| **Collision de styles** | `styles.css` est une feuille globale (remise à zéro, thèmes ng-zorro et Material), chargée dans la page de PLaTon. | Peut modifier l'apparence du reste de PLaTon. À valider par l'équipe PLaTon dans une vraie page. |
| **Pas de lien direct vers une vue du widget** | Le routeur interne garde son historique en mémoire (`MemoryLocationStrategy`). | Pas d'adresse partageable vers une page du widget, pas de bouton « précédent » du navigateur à l'intérieur. Si le besoin apparaît : un préfixe d'URL à négocier avec PLaTon. |
| **Retour vers les pages PLaTon** | « Retour au cours » et « Retour à l'activité » naviguent en interne (`/context`), faute de contrat pour pointer vers les vraies pages PLaTon. | À trancher avec l'équipe PLaTon si ce lien est nécessaire (voir `ROUTE_BASE_PATH` dans `docs/platon-integration/integration-indicateurs.md`). |
| **Accès réseau à RabbitMQ en prod** | En local, réseau Docker partagé. En prod, PLaTon et Indicateurs peuvent être sur des serveurs différents. | Réseau privé commun ou RabbitMQ exposé avec un compte dédié au relais : à décider. |
| **Droits pour installer les déclencheurs** | Nécessite un compte Postgres propriétaire des tables PLaTon. | Sur le vrai PLaTon universitaire, il faudra obtenir ce compte, ou faire exécuter le SQL généré par un administrateur de la base. |
