/** Texte de référence complet du format d'import YAML/JSON, affiché dans le panneau d'aide du
 wizard (bouton "Voir la référence complète"). Pure fonction de `mode`, aucune dépendance à
 l'état du formulaire.
*/
export function buildImportDocsText(mode: 'yaml' | 'json'): string {
  return `╔══════════════════════════════════════════════════════════════════╗
║   RÉFÉRENCE COMPLÈTE - Format ${mode.toUpperCase().padEnd(4)} - Indicateur complet        
╚══════════════════════════════════════════════════════════════════╝

${mode === 'yaml' ? `STRUCTURE DE BASE
─
name: "..."                  # obligatoire - nom de l'indicateur
description: "..."           # optionnel
interpretationHint: "..."    # optionnel  - aide à l'analyse
requiredEvents: [...]        # optionnel  - noms d'événements déclencheurs
contextType: learner         # optionnel  - learner | teacher | admin | course | activity | group
thresholds:                  # optionnel  - { good, warning, critical }
  good: 80
visualizations:               # optionnel  - liste de { label, type, icon, color, unit }
  - label: "Vue principale"
    type: card
pipeline:                    # obligatoire - liste d'étapes
  - type: <type>      # obligatoire - nom technique de l'étape (voir liste ci-dessous)
    label: "..."      # optionnel  - nom affiché dans le builder (généré auto si absent)
    params:           # obligatoire - paramètres propres à chaque type
      ...

Seul un champ absent de l'import conserve la valeur déjà saisie dans le formulaire ; "name" et
"pipeline" doivent toujours être présents.` : `{
  "name": "...",                  // obligatoire - nom de l'indicateur
  "description": "...",           // optionnel
  "interpretationHint": "...",    // optionnel  - aide à l'analyse
  "requiredEvents": [...],        // optionnel  - noms d'événements déclencheurs
  "contextType": "learner",       // optionnel  - learner | teacher | admin | course | activity | group
  "thresholds": { "good": 80 },   // optionnel  - { good, warning, critical }
  "visualizations": [             // optionnel  - liste de { label, type, icon, color, unit }
    { "label": "Vue principale", "type": "card" }
  ],
  "pipeline": [                   // obligatoire - liste d'étapes
    {
      "type": "<type>",    // obligatoire - nom technique (voir liste ci-dessous)
      "label": "...",      // optionnel  - affiché dans le builder (généré auto si absent)
      "params": { ... }    // obligatoire - paramètres propres à chaque type
    }
  ]
}

Seul un champ absent de l'import conserve la valeur déjà saisie dans le formulaire ; "name" et
"pipeline" doivent toujours être présents.`}

══════════════════════════════════════════════════════════════════
  TYPES D'ÉTAPES DISPONIBLES
══════════════════════════════════════════════════════════════════

┌─ fetch
│  Charge des lignes depuis une table PLaTon.
│  C'est toujours la 1ère étape d'un pipeline.
${mode === 'yaml' ? `│
│  params:
│    table: SessionData          # NOM EXACT de la table (liste ci-bas)
│    contextFields:              # colonnes filtrées automatiquement selon le contexte
│      - user_id                 #   → filtre sur l'apprenant courant
│      - activity_id             #   → filtre sur l'activité sélectionnée
│      - group_id                #   → filtre sur les membres du groupe de TP` : `│
│  "params": {
│    "table": "SessionData",
│    "contextFields": ["user_id", "activity_id"]
│  }`}
│
│  Tables disponibles :
│    SessionData       → sessions d'exercices (grade, attempts, created_at,
│                         user_id, activity_id, resource_id)
│    Activities        → activités (id, source, course_id, open_at, close_at)
│    Courses           → cours (id, name, owner_id)
│    CourseGroups      → groupes de TP (id, name, course_id)
│    CourseGroupsMember→ membres des groupes (group_id, user_id)
│    CourseMembers     → membres d'un cours (course_id, user_id, role)
│    Resources         → ressources (id, name, type)
│    Users             → utilisateurs (id, first_name, last_name)

┌─ join ─
│  Fusionne les données courantes avec une 2ème table.
│  joinType (optionnel, défaut "left") :
│    left  → garde toutes les lignes courantes
│    inner → garde uniquement les correspondances
│    right → garde toutes les lignes de la table jointe
│    full  → garde toutes les lignes des deux côtés
${mode === 'yaml' ? `│
│  params:
│    table: Activities           # table à joindre
│    contextFields: []           # filtres contexte sur cette table (optionnel)
│    leftKey: activity_id        # colonne dans les données courantes
│    rightKey: id                # colonne correspondante dans la 2ème table
│    joinType: left              # left | inner | right | full (optionnel)` : `│
│  "params": {
│    "table": "Activities",
│    "contextFields": [],
│    "leftKey": "activity_id",
│    "rightKey": "id",
│    "joinType": "left"
│  }`}

┌─ filter ─
│  Garde uniquement les lignes qui respectent une condition.
${mode === 'yaml' ? `│
│  params:
│    field: grade                # colonne à tester
│    operator: ">="              # opérateurs : ==  !=  >  <  >=  <=
│    value: 100                  # valeur de comparaison (nombre ou texte)` : `│
│  "params": {
│    "field": "grade",
│    "operator": ">=",
│    "value": 100
│  }`}

┌─ groupBy
│  Regroupe les lignes par valeur d'une colonne.
│  → produit un tableau de groupes, à utiliser avant findFirst.
${mode === 'yaml' ? `│
│  params:
│    groupField: resource_id     # colonne de regroupement` : `│
│  "params": { "groupField": "resource_id" }`}

┌─ findFirst
│  Dans chaque groupe, prend la 1ère ligne (après tri optionnel).
${mode === 'yaml' ? `│
│  params:
│    whereField: grade           # (optionnel) colonne de filtrage dans le groupe
│    whereValue: 100             # valeur attendue pour whereField
│    sortField: created_at       # (optionnel) trie avant de prendre le 1er` : `│
│  "params": {
│    "whereField": "grade",
│    "whereValue": 100,
│    "sortField": "created_at"
│  }`}

┌─ extract
│  Extrait la valeur d'une colonne de chaque ligne.
│  → produit un tableau de valeurs (nombres), prêt pour aggregate.
${mode === 'yaml' ? `│
│  params:
│    extractField: attempts      # colonne à extraire` : `│
│  "params": { "extractField": "attempts" }`}

┌─ aggregate
│  Calcule une valeur unique à partir du tableau.
${mode === 'yaml' ? `│
│  params:
│    aggregateFn: avg            # avg=moyenne  sum=somme  count=nombre
│                                # min=minimum  max=maximum` : `│
│  "params": { "aggregateFn": "avg" }
│  // aggregateFn: avg | sum | count | min | max`}

┌─ round
│  Arrondit le résultat numérique final.
${mode === 'yaml' ? `│
│  params:
│    decimals: 2                 # 0=entier  1=1 décimale  2=2 décimales` : `│  "params": { "decimals": 2 }`}

┌─ divide ─
│  Divise le résultat par une constante.
${mode === 'yaml' ? `│
│  params:
│    divideBy: 60                # ex: 60=secondes→minutes, 100=proportion→%` : `│  "params": { "divideBy": 60 }`}

┌─ js ─
│  Calcul personnalisé en JavaScript.
│  La variable "input" contient la sortie de l'étape précédente.
│  Utiliser "return", pas "result =".
${mode === 'yaml' ? `│
│  params:
│    code: |
│      // input = tableau ou valeur de l'étape précédente
│      return Array.isArray(input) ? input.length : 0;` : `│
│  "params": {
│    "code": "return Array.isArray(input) ? input.length : 0;"
│  }`}

══════════════════════════════════════════════════════════════════
  EXEMPLE COMPLET - Note moyenne d'un apprenant
══════════════════════════════════════════════════════════════════
${mode === 'yaml' ? `name: "Note moyenne"
pipeline:
  - type: fetch
    params:
      table: SessionData
      contextFields: [user_id, activity_id]
  - type: extract
    params:
      extractField: grade
  - type: aggregate
    params:
      aggregateFn: avg
  - type: round
    params:
      decimals: 1` : `{
  "name": "Note moyenne",
  "pipeline": [
    { "type": "fetch",     "params": { "table": "SessionData", "contextFields": ["user_id","activity_id"] } },
    { "type": "extract",   "params": { "extractField": "grade" } },
    { "type": "aggregate", "params": { "aggregateFn": "avg" } },
    { "type": "round",     "params": { "decimals": 1 } }
  ]
}`}`;
}
