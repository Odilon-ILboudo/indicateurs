# Sécurité du moteur DSL - étape `js` et injections SQL

Ce document explique les mesures de sécurité mises en place dans le moteur DSL
(`formula-interpreter.service.ts` + `platon.service.ts`) pour deux surfaces
d'attaque distinctes : l'exécution de code JavaScript arbitraire (étape `js`) et
les injections SQL (étapes `fetch`, `join`, `filter`).

---

## 1. Étape `js` - exécution de code arbitraire

### Le problème

L'étape `js` permet à un administrateur d'écrire du JavaScript libre dans une
formule DSL. Ce code est exécuté côté serveur à chaque calcul d'indicateur. Sans
protection, un code malveillant peut :

- **Arrêter le serveur** :
  ```javascript
  this.constructor.constructor('return process')().exit(1);
  ```
- **Exfiltrer les secrets** (mots de passe BDD, JWT…) :
  ```javascript
  const { execSync } = this.constructor.constructor('return require')()('child_process');
  execSync('cat /proc/self/environ > /tmp/leak.txt');
  ```
- **Ouvrir un accès réseau persistant** via `net`, `http`, etc.

Le module `vm` natif de Node.js ne protège pas contre cela : il crée une portée
de variables séparée mais s'exécute dans le **même processus** que le backend.
L'échappement classique `this.constructor.constructor('return process')()` y
fonctionne.

---

### La solution : deux couches de défense

#### Couche 1 - Analyse statique (`validateJsCode`)

Avant toute compilation ou exécution, le code est analysé contre une liste de
13 patterns interdits (expressions régulières) :

| Pattern détecté | Risque bloqué |
|---|---|
| `process` | Accès au processus Node.js (env, exit, kill…) |
| `require()` | Chargement de modules Node.js |
| `import()` | Import dynamique de modules |
| `__dirname` / `__filename` | Chemins du système de fichiers |
| `global` | Objet global Node.js |
| `Buffer` | Accès mémoire brute |
| `eval()` | Exécution de code dynamique |
| `Function()` | Constructeur dynamique (alternative à eval) |
| `.constructor()` | Vecteur d'échappement classique du sandbox `vm` |
| `setTimeout` / `setInterval` | Minuteries (DoS, exécution différée) |
| `fetch()` / `XMLHttpRequest` | Requêtes réseau sortantes |
| `child_process` / `exec()` | Exécution de commandes système |
| `fs.*()` | Accès au système de fichiers |

Si un pattern est détecté → erreur immédiate, le code n'est **jamais exécuté**.
Le message d'erreur indique précisément ce qui est interdit, ex :
`"Code JS refusé : utilisation de '.constructor()' (évasion de sandbox interdite)"`.

**Limite** : l'analyse statique opère sur le texte du code. Un attaquant
suffisamment inventif pourrait obfusquer son code pour contourner les regex.
C'est pourquoi une deuxième couche est nécessaire.

#### Couche 2 - Isolate V8 réel (`isolated-vm`)

Le code validé par l'analyse statique est ensuite exécuté dans un **vrai isolate
V8** via le package `isolated-vm` (un addon natif C++ utilisant l'API V8 Isolate,
le même mécanisme qu'un onglet Chrome).

```typescript
const isolate = new ivm.Isolate({ memoryLimit: 32 }); // 32 Mo max
const context = await isolate.createContext();
await context.global.set('input', new ivm.ExternalCopy(input).copyInto());
const script = await isolate.compileScript(`(function(input) { ${code} })(input)`);
const result = await script.run(context, { timeout: 2000, copy: true });
isolate.dispose();
```

Ce que cela garantit :
- **Aucun accès à Node.js par défaut** : `process`, `require`, `Buffer`, `fs`
  n'existent pas dans l'isolate - ce sont des concepts du runtime Node.js, pas
  du moteur V8.
- **Mémoire limitée à 32 Mo** : empêche les attaques par épuisement mémoire.
- **Timeout de 2 secondes** : empêche les boucles infinies de bloquer le serveur.
- **Isolation totale** : même si l'analyse statique était contournée, l'isolate
  ne donne accès à rien en dehors de la variable `input` explicitement injectée.
- **`isolate.dispose()`** dans le bloc `finally` : l'isolate est détruit après
  chaque exécution, sans fuite mémoire.

Les données (`input` et le résultat) traversent la frontière isolate/Node.js via
`ivm.ExternalCopy`, qui sérialise et désérialise les valeurs - aucune référence
directe à des objets Node.js ne peut entrer ou sortir de l'isolate.

---

### Résumé du flux sécurisé

```
Code JS reçu
    │
    ▼
validateJsCode()          ← Couche 1 : analyse statique (13 patterns interdits)
    │ refus immédiat si pattern détecté
    ▼
ivm.Isolate (V8 isolé)    ← Couche 2 : sandbox réel, sans accès Node.js
    │ memoryLimit: 32 Mo
    │ timeout: 2000 ms
    │ seule variable accessible : input
    ▼
Résultat sérialisé retourné au pipeline DSL
```

---

## 2. Étapes `fetch` / `join` - injections SQL

### Le problème

Les étapes `fetch` et `join` construisent dynamiquement des requêtes SQL à
partir de paramètres fournis par l'utilisateur : nom de table, noms de colonnes,
valeurs de filtres. Sans protection, un utilisateur pourrait injecter du SQL
dans ces paramètres.

Exemple d'attaque sans protection :
```
table = "SessionData; DROP TABLE Users; --"
→ SELECT ... FROM "SessionData; DROP TABLE Users; --"  ← exécuté tel quel
```

### La solution : trois niveaux de validation dans `platon.service.ts`

#### Niveau 1 - Validation des noms de tables

```typescript
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
  throw new Error(`Nom de table invalide : '${table}'`);
}
```

La regex n'autorise que lettres, chiffres et `_`. Tout caractère SQL
(`;`, `'`, `"`, espace, `-`…) déclenche une erreur immédiate. Le nom valide
est ensuite encadré de guillemets doubles : `"${table}"`, ce qui l'isole comme
identifiant PostgreSQL et empêche toute interprétation comme mot-clé SQL.

#### Niveau 2 - Validation des noms de colonnes

```typescript
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
  throw new Error(`Nom de colonne invalide dans les filtres : '${col}'`);
}
conditions.push(`"${col}" = $${idx++}`);
```

Même regex que pour les tables. Toute colonne invalide **lève une erreur
explicite**, plutôt que d'être ignorée silencieusement (ce qui produirait des
résultats incorrects sans erreur visible). Le nom valide est également
encadré de guillemets doubles.

#### Niveau 3 - Requêtes paramétrées pour les valeurs

```typescript
params.push(val);
// → WHERE "course_id" = $1   (val passé séparément à PostgreSQL)
```

Les **valeurs** des filtres (UUID de cours, d'utilisateur…) ne sont jamais
concaténées dans la chaîne SQL. Elles sont passées dans un tableau séparé et
référencées par `$1`, `$2`… PostgreSQL reçoit la requête et les données
**séparément** - il n'y a aucune concaténation possible. Même si `val` contenait
`'; DROP TABLE "Users"; --`, PostgreSQL le traiterait comme une chaîne de
caractères ordinaire.

#### Niveau 4 - Colonnes sensibles filtrées (protection des données)

En complément des protections SQL, certaines colonnes ne sont **jamais
exposées** au DSL, quelle que soit la table :

```typescript
private static readonly SENSITIVE_COLUMN_PATTERN =
  /password|passwd|secret|token|api[_-]?key|hash|salt|credential|email|phone|discord|ip_address/i;
```

Ce filtre est appliqué à deux endroits :
- **`getAvailableTables()`** : les colonnes sensibles sont retirées de la liste
  retournée au builder - elles n'apparaissent pas dans les listes déroulantes
  de l'interface, donc ne peuvent pas être sélectionnées.
- **`buildSafeSelect()`** : remplace `SELECT *` par une liste explicite de
  colonnes sûres. Même un accès direct à l'API ne peut pas ramener ces colonnes.

---

### Résumé des protections SQL

| Vecteur | Protection |
|---|---|
| Nom de table malveillant | Regex + guillemets doubles + erreur explicite |
| Nom de colonne malveillant | Regex + guillemets doubles + erreur explicite |
| Valeur de filtre malveillante | Requête paramétrée (`$1`, `$2`…) |
| Accès aux colonnes sensibles | Filtre `SENSITIVE_COLUMN_PATTERN` + `SELECT` explicite |

---

## 3. Ce qui reste à faire

- **Authentification incomplète sur certaines routes** : `POST /indicators` et
  `PATCH /indicators/:id` sont protégées (`AuthGuard`+`AdminGuard`), mais
  plusieurs routes qui exécutent une formule (donc du code `js`) restent
  accessibles sans authentification : `POST /indicators/preview`,
  `POST /indicators/preview-steps`, `POST /indicators/:id/compute-view`,
  `POST /indicators/:id/snapshots`, `PATCH /indicators/:id/snapshots/:snapshotId`,
  `DELETE /indicators/:id/snapshots/:snapshotId`,
  `POST /indicators/:id/feedback`. Un guard réel doit être branché sur ces
  routes avant tout déploiement exposé - c'est la priorité principale.
  `preview`/`preview-steps` sont les plus sensibles : elles acceptent une
  formule arbitraire dans le corps de la requête, donc n'importe qui peut
  déclencher l'exécution d'une étape `js` sans même avoir créé d'indicateur.
