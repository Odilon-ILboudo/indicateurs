# Décisions à prendre

Les points ci-dessous demandent un choix ou une information qui ne dépend pas
du code. Pour chacun : l'état actuel, les options, une recommandation et la
personne qui peut trancher. La liste complète des limites, avec leurs
conséquences, est dans [limites-connues.md](./limites-connues.md).

Les décisions 1 à 5 concernent le code d'Indicateurs. Les décisions 6 à 13
demandent l'équipe PLaTon ou l'université.

## 1. Qui peut lire les résultats et le CSV d'une activité ?

**État actuel** : les routes `results`, `results/date` et `csv` de
`/api/v1/courses/:courseId/activities/:activityId/` exigent un token valide,
rien de plus. `:courseId` est ignoré, seul `:activityId` compte. Tout
utilisateur connecté peut donc lire les notes, les tentatives et les e-mails
des étudiants de n'importe quelle activité.

**Options**
- **A. Équipe pédagogique seulement** : admin, propriétaire du cours, membre
  `teacher` du cours. Même règle que `update` d'une activité.
- **B. A, plus les étudiants du cours pour leurs propres lignes** : demande de
  filtrer la réponse par utilisateur.

**Recommandation** : A. C'est la règle que PLaTon applique aux modifications,
et c'est la plus simple à vérifier. À confirmer : un étudiant doit-il voir ces
résultats dans l'interface d'Indicateurs ?

**Qui décide** : l'équipe PLaTon (règle d'accès aux résultats), puis
Indicateurs applique.

## 2. Comment sécuriser le WebSocket ?

**État actuel** : chaque mise à jour est envoyée à **tous** les navigateurs
connectés (`server.emit`). Aucun jeton n'est demandé à la connexion, et les
origines autorisées sont `*`. Un client reçoit donc des valeurs (identifiant de
contexte et valeur) qui ne le concernent pas.

**Options**
- **A. Jeton et origines** : exiger le jeton à la connexion, et reprendre la
  liste d'origines de `main.ts` à la place de `*`. Les mises à jour restent
  envoyées à tous les clients authentifiés.
- **B. A, plus des salles** : une salle par utilisateur pour les indicateurs
  personnels, une salle par cours ou activité pour les autres. Il faut décider
  qui a le droit de rejoindre la salle d'un cours (membre du cours ? enseignant
  seulement ?), et vérifier l'appartenance à la connexion.

**Recommandation** : A tout de suite, B ensuite. A ferme l'accès anonyme à peu
de frais. B n'a de sens qu'une fois la décision 1 prise, puisque c'est la même
règle d'appartenance au cours.

**Qui décide** : Indicateurs, avec la règle d'appartenance de la décision 1.

## 3. Le rôle `demo` existe-t-il vraiment dans PLaTon ?

**État actuel** : la table `INDICATOR_VISIBILITY` de l'API
(`indicator-visibility.util.ts`) ouvre les contextes `course` et `activity` au
rôle `demo`. Celle du frontend (`RoleService`) ne le connaît pas : un compte
`demo` est vu comme `student` par l'interface. Les deux tables sont maintenues
à la main.

**Options**
- **A. `demo` est un rôle réel de PLaTon** : l'ajouter au frontend.
- **B. `demo` n'existe pas** : le retirer de l'API.

**Recommandation** : vérifier d'abord les valeurs possibles de `Users.role`
dans PLaTon. À terme, une source unique (l'API expose sa table, le frontend la
lit) évite que les deux dérivent.

**Qui décide** : l'équipe PLaTon (liste des rôles).

## 4. Faut-il suivre les suppressions de sessions ?

**État actuel** : les déclencheurs ne surveillent que `INSERT` et `UPDATE`. Une
session supprimée dans PLaTon reste dans le cache du calcul différentiel
jusqu'au prochain calcul complet.

**Options**
- **A. Ne rien faire** : acceptable si PLaTon ne supprime pas de sessions en
  usage normal.
- **B. Ajouter `DELETE`** comme opération possible d'une règle, et retirer la
  ligne du cache différentiel quand l'événement arrive. C'est un chantier : il
  touche le SQL généré, le classement des événements et le calcul différentiel,
  et les déclencheurs déjà installés devraient être réinstallés.

**Recommandation** : demander d'abord à l'équipe PLaTon si des sessions sont
supprimées en pratique (par exemple à la suppression d'un cours ou d'un
étudiant). Si non, A suffit.

**Qui décide** : l'équipe PLaTon (usage réel), puis Indicateurs.

## 5. Que faire des messages RabbitMQ qui échouent toujours ?

**État actuel** : un message dont le traitement lève une erreur est remis dans
la file et retraité sans fin. Il n'y a ni file d'erreurs (DLX) ni limite de
tentatives. La plupart des erreurs de calcul sont interceptées et seulement
écrites dans les logs, donc le cas est rare.

**Options**
- **A. Ne rien faire** : le risque est limité.
- **B. DLX et nombre de tentatives borné** : un message qui échoue trop de fois
  va dans une file d'erreurs, consultable. RabbitMQ refuse de redéclarer une
  file existante avec d'autres paramètres : il faut supprimer les deux files ou
  en changer le nom au déploiement, puis tester avec de vrais messages.

**Recommandation** : B avant une vraie mise en production, avec un test de
bout en bout. Pas urgent en développement.

**Qui décide** : Indicateurs.

## 6. Comment vérifier le jeton hors production ?

**État actuel** : hors `NODE_ENV=production`, l'API décode le jeton et vérifie
seulement son expiration, car le secret du PLaTon universitaire est inconnu.
Un appel direct avec un `sub` inventé et un `exp` futur passe.

**Options**
- **A. Obtenir le secret** de signature (`SECRET_KEY`) : vérification complète
  partout. Pas souhaitable de dupliquer un secret de production.
- **B. Valider chaque jeton auprès de l'API PLaTon** (`GET /api/v1/users/:username`
  avec le même Bearer), avec un cache court.
- **C. Ne rien changer en développement**, et vérifier que la production est
  toujours en mode strict.

**Recommandation** : C pour le développement. En production, le mode strict
suffit si `JWT_SECRET` est identique au `SECRET_KEY` du PLaTon déployé à côté.

**Qui décide** : l'équipe PLaTon et l'université (secret, politique de sécurité).

## 7. Qui fournit le compte Postgres pour installer les déclencheurs ?

**État actuel** : créer un déclencheur demande d'être propriétaire de la table.
Sans compte adapté, l'écran d'installation affiche le SQL à faire exécuter.

**Options**
- **A. Compte administrateur** (`PLATON_DB_ADMIN_USERNAME`/`PASSWORD`) confié à
  Indicateurs.
- **B. Changer le propriétaire** des tables concernées (`ALTER TABLE … OWNER TO`).
- **C. Un administrateur de la base exécute le SQL** généré par l'écran, à
  chaque installation.

**Recommandation** : C sur le PLaTon universitaire (aucun secret supplémentaire,
et les installations sont rares). A en local.

**Qui décide** : l'administrateur de la base de PLaTon.

## 8. Comment RabbitMQ est-il joint en production ?

**État actuel** : en local, PLaTon et Indicateurs partagent un réseau Docker. En
production, ils peuvent être sur des serveurs différents.

**Options**
- **A. Réseau privé commun** entre les deux serveurs.
- **B. RabbitMQ exposé** avec un compte dédié au relais, en lecture de
  l'outbox et en publication seulement.

**Recommandation** : A si l'infrastructure le permet, sinon B avec TLS.

**Qui décide** : l'université (réseau) et l'équipe PLaTon.

## 9. Quel est le domaine de production du widget ?

**État actuel** : `frontend/src/environments/environment.embed.prod.ts` contient
encore `<domaine-indicateurs-a-remplacer>`.

**Ce qu'il faut** : l'adresse publique du serveur d'Indicateurs. À renseigner
avant tout déploiement réel.

**Qui décide** : l'université (nom de domaine).

## 10. Comment prévenir PLaTon d'une nouvelle version du widget ?

**État actuel** : le script est servi sans numéro de version
(`outputHashing: "none"`), sous un nom stable. `location /embed/` envoie
`Cache-Control: no-cache` : le navigateur le revérifie à chaque chargement.
Rien n'indique à PLaTon qu'une nouvelle version existe.

**Options**
- **A. Nom stable, comme aujourd'hui** : PLaTon reçoit toujours la dernière
  version. Une modification incompatible casse la page sans prévenir.
- **B. Chemin versionné** (`/embed/v1/main.js`) : PLaTon choisit quand passer à
  la version suivante, au prix d'une modification côté PLaTon à chaque version.

**Recommandation** : A tant que le contrat des attributs de `<indicateurs-app>`
est stable et que les deux équipes se parlent. B dès que le widget est utilisé
en production par un autre LMS.

**Qui décide** : les deux équipes.

## 11. Les styles du widget peuvent-ils gêner PLaTon ?

**État actuel** : `styles.css` est une feuille globale (remise à zéro, thèmes
ng-zorro et Material), chargée dans la page de PLaTon. Elle peut modifier
l'apparence du reste de PLaTon.

**Options**
- **A. Valider dans une vraie page de PLaTon** que rien ne bouge.
- **B. Isoler les styles** du widget (par exemple l'encapsulation Shadow DOM
  d'Angular), à évaluer : ng-zorro et Material ne s'y comportent pas forcément
  sans adaptation.

**Recommandation** : A d'abord. B seulement si A révèle un problème.

**Qui décide** : l'équipe PLaTon (validation visuelle).

## 12. Faut-il des liens directs vers une vue du widget ?

**État actuel** : le routeur interne garde son historique en mémoire pour ne
jamais toucher à l'URL de PLaTon. Il n'y a pas d'adresse partageable vers une
page du widget, ni de bouton « précédent » du navigateur à l'intérieur.

**Si le besoin apparaît** : négocier avec PLaTon un préfixe d'URL réservé au
widget (par exemple un paramètre de requête), que le widget lirait et mettrait
à jour.

**Qui décide** : les deux équipes, selon le besoin réel.

## 13. Où mènent « Retour au cours » et « Retour à l'activité » ?

**État actuel** : ces liens naviguent **en interne** (`/context`), faute de
contrat pour pointer vers les vraies pages PLaTon.

**Options**
- **A. Garder la navigation interne** : le widget reste sur la même page.
- **B. Un événement DOM** (comme pour le jeton expiré) que la page hôte écoute
  pour naviguer elle-même.
- **C. Un attribut de la balise** donnant l'adresse de retour.

**Recommandation** : B, cohérent avec ce qui existe déjà pour le jeton expiré,
et sans que le widget connaisse les URL de PLaTon.

**Qui décide** : les deux équipes.

## Corrections prêtes, sans décision

Ces trois corrections sont connues et peuvent être faites quand on le décide :

- **Historique des valeurs** : garder les 100 dernières entrées de
  `metadata.history`, au lieu d'une liste sans limite.
- **Indicateurs figés** : filtrer côté frontend les indicateurs figés selon
  `visibilityRoles` avant de les afficher.
- **Colonnes sensibles dans l'outbox** : le déclencheur générique copie la ligne
  entière (`to_jsonb(NEW)`). Refuser les règles sur des tables sensibles, ou
  retirer les colonnes sensibles de la copie. Les déclencheurs déjà installés
  devraient être réinstallés.
