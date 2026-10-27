# Choix techniques : pourquoi le projet est construit ainsi

Pour chaque choix, la raison. Le fonctionnement détaillé est dans le document
indiqué à la fin de chaque partie. Les limites qui en découlent sont dans
[limites-connues.md](./limites-connues.md).

## 1. Un indicateur est une donnée, pas du code

Un indicateur est une ligne de la table `indicator_definitions`. Sa formule est
un objet JSON (un pipeline d'étapes), pas une fonction compilée.

**Pourquoi** : ajouter un indicateur ne demande ni développeur ni
redéploiement. C'est le principe directeur du projet. Il explique plusieurs
choix qui suivent : un bac à sable pour le code JavaScript, un accès protégé à
la base PLaTon, un calcul qui suit les événements.

Détail : [modele-indicateur.md](../fonctionnement/modele-indicateur.md) et
[moteur-formules.md](../fonctionnement/moteur-formules.md).

## 2. Lire la base de PLaTon directement

Indicateurs n'a pas son propre serveur Postgres. Il utilise celui de PLaTon,
avec deux bases : `platon_db` (SQL brut) et `indicators` (TypeORM).

**Pourquoi** : pas de copie des utilisateurs, des cours et des sessions.
Indicateurs lit toujours la donnée à jour. Sa propre base ne contient que ce
qui lui appartient (définitions, valeurs calculées, règles d'événements, pins).

Le schéma de `indicators` n'évolue que par migrations TypeORM, jamais par
génération automatique (`synchronize: false`, y compris en développement) :
la base se reconstruit à l'identique sur n'importe quelle machine.

Détail : [donnees.md](./donnees.md).

## 3. Un accès protégé aux tables PLaTon

Les étapes `fetch` et `join` lisent des tables choisies par l'administrateur.
Des noms de tables et de colonnes saisis par un humain finissent donc dans du
SQL.

**Pourquoi trois protections** : les noms sont vérifiés par une expression
régulière puis contre `information_schema` ; les valeurs sont toujours
paramétrées ; il n'y a jamais de `SELECT *`, et les colonnes au nom sensible
(mot de passe, e-mail, jeton, téléphone…) sont filtrées. Une formule ne peut
donc jamais lire un mot de passe ou un e-mail, même si l'administrateur le
demande.

Détail : [moteur-formules.md](../fonctionnement/moteur-formules.md).

## 4. Le code JavaScript dans un isolate V8

Quand les étapes prédéfinies ne suffisent pas, l'administrateur peut écrire du
JavaScript. Ce code n'est pas écrit par l'équipe de développement : il ne doit
jamais pouvoir toucher au serveur.

**Pourquoi un isolate (`isolated-vm`)** : un isolate est un moteur V8 à part,
sans `process`, sans `require`, sans système de fichiers ni réseau, avec une
mémoire (32 Mo) et un temps (2 s) bornés. L'analyse du texte avant exécution
n'est qu'un filet : c'est une recherche de mots, facile à contourner
(`globalThis["pro"+"cess"]` ne contient jamais le mot `process`). Le
contournement échoue quand même dans l'isolate.

**Coût** : `isolated-vm` est un module natif, écrit en C++. Il demande un
binaire adapté à la machine et à la version de Node (voir
[platon-local-setup.md](../deploiement/platon-local-setup.md), étape 0).

## 5. Un calcul différentiel

Recalculer une moyenne sur toutes les sessions à chaque événement coûte une
requête complète à chaque fois.

**Pourquoi** : pour les formules simples, Indicateurs garde la valeur extraite
de chaque session et met à jour le résultat à partir de la seule ligne qui a
changé. Une formule qui ne suit pas la forme reconnue est recalculée en
entier : plus lent, mais toujours juste.

Détail : [calcul-differentiel.md](../fonctionnement/calcul-differentiel.md).

## 6. Des déclencheurs Postgres générés depuis l'admin

**Pourquoi un déclencheur plutôt qu'une modification du code de PLaTon** : on
ne modifie pas le code de PLaTon, et on capte les changements quelle que soit
la partie de PLaTon qui écrit dans la table.

**Pourquoi un déclencheur générique** : il recopie la ligne entière sans rien
décider. La logique métier reste dans Indicateurs, qui peut la changer sans
toucher à PLaTon. Il n'y en a qu'un par table, quel que soit le nombre de
règles.

## 7. Une table outbox et un relais côté PLaTon

Le déclencheur écrit dans `platon_outbox_events`, dans la même transaction que
la modification d'origine.

**Pourquoi** (motif « outbox ») : l'événement est enregistré si et seulement si
la modification l'est. Un relais lit cette table toutes les 2 secondes et
publie vers RabbitMQ. Il est côté PLaTon parce qu'il ne fait que transporter :
il n'a besoin de rien savoir des indicateurs, et un autre LMS pourrait fournir
son propre relais de la même façon.

## 8. RabbitMQ et deux files

**Pourquoi RabbitMQ plutôt qu'un appel direct** : PLaTon n'attend jamais
Indicateurs. Si Indicateurs est arrêté ou lent, les messages s'accumulent dans
les files (durables) et sont traités au redémarrage.

**Pourquoi deux files** (`indicators.learner` et `indicators.aggregate`) : un
calcul lourd sur un cours entier ne doit pas retarder la mise à jour du score
d'un étudiant.

## 9. Classer les événements côté Indicateurs

Le message reçu est brut (`raw:SessionData`, ligne complète). Indicateurs le
transforme en 0, 1 ou plusieurs événements métier selon les règles actives.

**Pourquoi ici et pas dans le déclencheur** : les règles vivent dans la base
`indicators`. Les changer ne demande pas de réinstaller un déclencheur côté
PLaTon.

**Pourquoi refuser un indicateur actif sans déclencheur installé** : il
paraîtrait fonctionnel mais ne se mettrait jamais à jour.

Détail des parties 6 à 9 : [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md).

## 10. Une authentification déléguée à PLaTon

Indicateurs ne gère pas de comptes. L'utilisateur se connecte sur PLaTon, qui
lui donne un jeton JWT ; Indicateurs le contrôle.

**Pourquoi deux modes** : en production, la signature est vérifiée avec
`JWT_SECRET`, identique au `SECRET_KEY` du PLaTon déployé à côté. En
développement, on se connecte sur le vrai PLaTon universitaire, dont le secret
est inconnu : on décode le jeton et on vérifie seulement son expiration.

**Pourquoi relire le rôle dans la table `Users`** : le rôle n'est jamais pris
dans le jeton ni envoyé par le client, pour que la restriction tienne aussi
face à un appel direct à l'API. Les permissions sur un cours suivent les règles
de PLaTon (propriétaire, admin, ou membre `teacher` du cours), et jamais le
seul rôle global d'enseignant.

Détail : [securite.md](./securite.md).

## 11. Un Web Component dans PLaTon

Le même projet Angular produit deux applications : l'application autonome et
un élément HTML, `<indicateurs-app>`, que PLaTon insère dans ses pages.

**Pourquoi un Web Component** : PLaTon charge un script, pose une balise, et
c'est tout. Il n'a pas besoin de connaître Angular côté Indicateurs, ni de
partager la même version d'Angular. Les deux applications coexistent sur la
même page.

**Pourquoi un routeur en mémoire** : le routeur Angular écrit normalement dans
l'URL du navigateur et écraserait celle de PLaTon. Le widget garde son
historique en mémoire. Contrepartie : pas de lien direct vers une vue du
widget, et pas de bouton « précédent » du navigateur à l'intérieur.

**Pourquoi servir le script depuis Indicateurs** (sous `/embed/`) :
Indicateurs n'est pas lié à un seul LMS. Un hébergement unique évite de
reconfigurer chaque LMS hôte.

Détail : [integration-indicateurs.md](../platon-integration/integration-indicateurs.md).

## 12. Docker et une seule commande d'installation

Indicateurs rejoint le réseau Docker `platon-network` créé par PLaTon, pour
joindre `platon_postgres` par son nom, sans modifier les fichiers de PLaTon.
Des services d'initialisation (`init-db`, `migrate`, `rabbitmq-init`) tournent
avant l'API. Sur une nouvelle machine, `./bin/setup.sh` enchaîne tout.

**Pourquoi** : une installation reproductible, sans étape faite à la main
qu'on oublierait.

Détail : [docker.md](../deploiement/docker.md).
