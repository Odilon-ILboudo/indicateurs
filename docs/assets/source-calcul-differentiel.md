# Source unique pour l'animation — ne pas chercher ailleurs

N'effectuez **aucune recherche web** sur le calcul incrémental, le batch computation,
ou tout concept général. Tout ce qui est nécessaire pour concevoir et générer
l'animation se trouve intégralement ci-dessous. C'est un mécanisme réel, implémenté
dans un projet précis (un microservice d'indicateurs pédagogiques pour une plateforme
d'apprentissage en ligne appelée PLaTon), pas un concept générique de manuel.

## Contexte du projet

Le microservice "Indicateurs" calcule des statistiques pédagogiques à partir des
tentatives d'exercices des étudiants (exemple utilisé ici : "nombre moyen de
tentatives avant réussite"). Chaque fois qu'un étudiant répond à un exercice, un
événement arrive et la valeur affichée doit se mettre à jour. Le projet implémente
deux façons de recalculer cette valeur, et l'animation doit rendre visible la
différence entre les deux.

## Le mécanisme exact à représenter

**Recalcul complet** : à chaque événement, le système retélécharge et relit
**toutes** les tentatives concernées depuis la base de données, puis refait le
calcul de la moyenne depuis zéro. Coût : proportionnel au nombre total de tentatives
existantes, à chaque fois, même si une seule a changé.

**Calcul différentiel (incrémental)** : le système garde, **en base de données**
(pas en mémoire du process - une vraie ligne SQL, colonne `metadata` de la table
`indicator_values`, base `indicators`), la valeur individuelle de **chaque
tentative déjà connue**, sous forme d'un petit dictionnaire
`identifiant de tentative → valeur`. Quand un nouvel événement arrive, il relit
cette ligne, n'y **ajoute qu'une entrée** (ou en retire une, si la tentative ne
compte plus), recalcule la moyenne sur ce dictionnaire, puis réécrit la ligne.
Coût : une lecture et une écriture ciblées sur une seule ligne, proportionnelles
à 1 tentative traitée, jamais au total des tentatives existantes.

**Le point essentiel que l'animation doit faire ressentir** : les deux méthodes
arrivent exactement au même résultat final, mais l'une retouche tout à chaque fois,
l'autre ne retouche que ce qui vient de changer.

## Point important : SessionData ne contient pas des moyennes toutes prêtes

`SessionData` stocke **une ligne par tentative d'exercice**, jamais une moyenne
déjà calculée par étudiant. Un étudiant qui a retenté plusieurs fois a donc
**plusieurs lignes**. Pour obtenir "sa" valeur, il faut : lire toutes ses lignes,
calculer sa moyenne personnelle, puis ranger ce résultat dans sa case. L'animation
doit rendre ce détail visible (pas juste faire apparaître un chiffre déjà prêt dans
la case de l'étudiant) - sinon elle laisse croire que la base fait déjà le travail
de calcul, ce qui est faux.

Important en revanche : le **résultat final de l'indicateur** n'est pas une
seconde moyenne des moyennes personnelles affichées. Il est recalculé sur
l'ensemble des tentatives individuelles de tous les étudiants réunies (c'est
exactement ce que fait le code). Les moyennes personnelles affichées dans les
cases servent à la lisibilité humaine, pas au calcul du résultat global.

## Exemple numérique exact à utiliser (ne pas en inventer un autre)

10 étudiants. Les 9 premiers ont chacun 2 tentatives (certains ont retenté), le
10ᵉ (le nouvel étudiant, l'événement qui vient d'arriver) en a 1 seule :

```
Étudiant 1 : 2, 5 → moyenne personnelle 3.5
Étudiant 2 : 8, 3 → moyenne personnelle 5.5
Étudiant 3 : 6, 1 → moyenne personnelle 3.5
...  (9 étudiants au total, 18 tentatives individuelles)
Étudiant 10 (nouveau) : 9 → moyenne personnelle 9.0 (première tentative)
```

- Les 18 tentatives des 9 premiers étudiants sont déjà connues. Leur somme =
  75, leur moyenne globale = 75 / 18 = **4.17**.
- La tentative du 10ᵉ étudiant (valeur `9`) vient d'arriver.
- Nouvelle somme = 75 + 9 = 84. Nouvelle moyenne globale = 84 / 19 = **4.42**.
- Le nombre d'étudiants (10, pas 3) reste suffisant pour rendre visible
  l'argument de passage à l'échelle : 19 lectures contre 1 seule, peu importe que
  ce soit 9 ou 9000 tentatives derrière - mais assez petit pour que chaque
  trajet individuel (lecture, fusion, dépôt dans la case) reste bien visible et
  lent, sans que l'animation ne se précipite.

## Scénario d'animation en deux parties (séquentiel, avec transition)

Chaque carte part **vide** (un simple point d'interrogation) et n'affiche sa valeur
qu'au moment où elle est effectivement lue - c'est ce qui distingue les deux parties,
pas seulement la vitesse.

### Partie 1 — Recalcul complet (doit paraître long et coûteux)

- Une source visible "base de données PLaTon (SessionData)" est affichée à côté de
  la rangée de 10 cartes vides (une carte = un étudiant), avec une petite
  **aire de calcul** (un emplacement en pointillés) entre la source et les cartes.
- Le détail de la lecture doit être **montré, pas raconté en phrase** : pour
  chaque étudiant, un ou deux petits jetons ronds (un par tentative brute)
  **voyagent visuellement** depuis la source jusqu'à l'aire de calcul, s'y posent,
  puis se **fondent en un seul jeton** représentant la moyenne personnelle de
  l'étudiant - ce jeton fusionné voyage ensuite jusqu'à la carte, qui affiche
  alors cette valeur. Un court libellé ("Étudiant 7 / 10") suffit à situer
  l'étudiant en cours ; les valeurs elles-mêmes n'ont pas besoin d'être répétées
  en texte puisqu'elles sont visibles sur les jetons qui voyagent.
- Chaque trajet (source → aire de calcul, puis aire de calcul → carte) doit être
  **lent et net**, pas juste une transition rapide : avec seulement 10 étudiants,
  il y a largement le temps de laisser chaque jeton voyager, se poser, puis
  laisser la fusion se voir avant qu'elle ne reparte vers la carte.
- Un compteur visible affiche "lignes lues" et **monte du nombre de tentatives
  lues à chaque étudiant** (1 ou 2 selon le cas), jusqu'à atteindre **19** (18
  tentatives des 9 étudiants déjà connus + 1 pour le nouveau).
- Un second compteur affiche la **durée écoulée** de la démonstration (montre le
  temps qui tourne pendant que les cartes se remplissent).
- Une fois les 10 cartes remplies, un indicateur de résultat affiche **4.42**
  (recalculé sur les 19 tentatives individuelles, pas sur une moyenne des 10
  moyennes personnelles affichées).
- Sensation recherchée : effort, répétition, tout est relu et recalculé depuis la
  base sans exception - et la durée qui s'allonge visiblement le confirme.

### Transition (fondu ou balayage)

### Partie 2 — Calcul différentiel (doit paraître instantané et léger)

- Deux sources distinctes sont visibles : "métadonnées (base indicators)" et
  "SessionData (PLaTon) · 1 ligne". Le nom de la base est explicite à chaque
  fois - **indicators** pour les métadonnées déjà calculées (la base propre au
  microservice - important : ceci n'est **pas un cache en mémoire**, c'est une
  vraie ligne SQL, colonne `metadata` de la table `indicator_values`, relue par
  une requête `SELECT` à chaque appel), **PLaTon** pour SessionData (la base
  d'où vient la donnée pédagogique) - pour qu'on ne confonde jamais les deux.
  (Le déclenchement par événement/message existe bien dans le vrai système,
  mais n'a pas besoin d'être représenté ici : c'est le sujet d'un autre schéma,
  le pipeline d'ingestion - cette animation-ci se concentre sur la source des
  données, pas sur le transport du message.)
- Les 9 premières cartes se remplissent **toutes en même temps**, en un seul
  mouvement bref, en provenance de la source "métadonnées (base indicators)" -
  jamais de la base de PLaTon. Ce qui y est stocké, ce sont déjà les
  **moyennes personnelles** de chaque étudiant (pas les lignes brutes), calculées
  lors d'un appel précédent : un court libellé précise "9 moyennes personnelles
  déjà stockées en base (indicators) - aucune lecture". Un indicateur de résultat
  affiche directement **4.17** (le calcul précédent, déjà stocké, sur 18
  tentatives).
- Une 10ᵉ carte, vide, arrive ensuite de l'extérieur du cadre (par exemple glisse
  depuis le haut) et vient s'insérer à la fin de la rangée. Un seul jeton,
  portant la valeur `9`, **voyage visuellement, mais lentement et nettement**,
  depuis "SessionData (PLaTon) · 1 ligne" directement jusqu'à cette carte : une
  lecture réelle a bien lieu, mais **une seule ligne, ciblée sur cette session
  précise** (jamais un balayage de toute la table). Une seule valeur = pas de
  fusion nécessaire, elle est déjà sa propre moyenne personnelle (première
  tentative).
- **Seule cette nouvelle carte** se remplit et reçoit un éclat lumineux net,
  unique. Aucune des 9 premières ne se rallume.
- Le compteur "lignes lues" repart de 0 et **monte une seule fois, à 1** (contre
  19 dans la partie 1).
- La durée écoulée de cette partie reste très courte, en contraste net avec la
  partie 1, même si le trajet du jeton lui-même reste bien visible (pas un
  simple flash).
- L'indicateur de résultat passe directement de 4.17 à **4.42** (recalculé sur le
  total des 19 tentatives individuelles, 18 déjà en base + 1 nouvelle - jamais une
  moyenne des 10 moyennes personnelles affichées).
- Sensation recherchée : légèreté, immédiateté, contraste net avec la partie 1
  (1 lecture contre 19, durée très courte contre longue).

## Direction artistique

- Style : animation 2D minimaliste, infographie explicative, pas de personnages
  humains, pas de scène réaliste.
- Palette : fond clair (blanc ou gris très pâle), accent violet `#722ed1` pour les
  éléments actifs/mis en lumière, gris neutre pour les éléments inactifs.
- Cartes : petits rectangles arrondis, valeur numérique lisible dessus.
- Indicateur de résultat : affichage numérique clair (pas une jauge compliquée à
  lire), avec la valeur qui change visiblement au bon moment.
- Rythme : régulier et posé en partie 1, net et rapide en partie 2 - le contraste de
  rythme entre les deux parties est aussi important que le contraste visuel.
- Durée totale visée : 15 à 20 secondes.

## Référence de rendu déjà validée

Une version interactive de cette animation (HTML/CSS/JS) a déjà été construite et
validée pour ce projet, avec exactement ce scénario et ces valeurs numériques :
`docs/assets/calcul-differentiel-anim.html` dans le dépôt du projet. Elle peut
servir de référence de mise en scène si l'outil de génération vidéo a besoin d'un
exemple concret du résultat attendu.
