# AGENTS.md — ÉLIMU V2 (Desktop)

> Fichier de mémoire pour l'assistant IA travaillant sur l'application desktop ÉLIMU V2.
> À lire en intégralité avant toute modification.

---

## 1. IDENTITÉ DU PROJET

| Champ | Valeur |
|-------|--------|
| **Nom** | ÉLIMU V2 |
| **Type** | Application de gestion scolaire desktop |
| **Stack** | Electron 31 + JavaScript (Vanilla) + better-sqlite3 |
| **Base de données locale** | SQLite via better-sqlite3 |
| **Base de données cloud** | PostgreSQL (Neon) — synchronisation |
| **Portail parents** | Web (Render) — lecture seule |
| **Sécurité** | bcryptjs, HWID, HMAC-SHA256, JWT, audit trail |
| **Cible** | Écoles primaires africaines (système MINEDUB Cameroun) |
| **Contact** | karisdev369@gmail.com |
| **Licence** | Propriétaire (CLUF) |

### Références documentaires

| Fichier | Contenu |
|---------|---------|
| `../ELIMU_V2_VISION.md` | Vision stratégique, roadmap, écosystème Desktop/PWA/Portail |
| `../ELIMU_V2_ARCHITECTURE.md` | Architecture détaillée, templates, barèmes, flux de données |
| `../ELIMU_V2_DESIGN_TRANSITION.md` | Design de transition V1→V2, profil élève adaptatif |
| `../ELIMU_CURRICULUM_N1_N2.md` | Curriculum officiel MINEDUB Niveau 1 (SIL/CP) et Niveau 2 (CE1/CE2) |
| `../ELIMU_CURRICULUM_N3.md` | Curriculum officiel MINEDUB Niveau 3 (CM1/CM2) |
| `gemini/GEMINI.md` | Règles de codage pour l'IA (sécurité, perf, i18n, etc.) |
| `gemini/V2_IMPLEMENTATION_STATE.md` | État d'avancement phase 1 (migration schéma, curriculum, UI) |
| `docs/CALCUL_NOTES_N1_N2.md` | Documentation détaillée des formules de calcul N1/N2 |
| `gemini/Rapport_Reverse_Sync_Juin_2026.md` | Rapport de synchronisation et reverse engineering |

---

## 2. ARCHITECTURE GLOBALE (Écosystème segmenté V2)

```
┌──────────────────────────────────────────────────────┐
│              PostgreSQL Cloud (Neon)                  │
└──────────┬───────────────────────────┬───────────────┘
           │                           │
           ▼                           ▼
┌──────────────────┐       ┌──────────────────────┐
│  ÉLIMU Bureau    │       │   PWA Enseignants     │
│  (Electron)      │       │   (Mobile)            │
│  → Directeur     │       │   → Saisie des notes  │
│  → Admin         │       │   → Hors-ligne        │
│  → Finance       │       │   → Export Excel      │
│  → Bulletins PDF │       └──────────────────────┘
└──────────────────┘
         │
         ▼
┌──────────────────┐
│  Portail Parents  │
│  (Web)            │
│  → Notes          │
│  → Absences       │
│  → Paiements      │
└──────────────────┘
```

### Règles fondamentales
- **Le Directeur ne saisit JAMAIS de notes.** L'onglet "Notes" global est supprimé du Desktop. Les notes arrivent via : (1) synchronisation Cloud PWA, (2) import Excel signé.
- **Le Desktop est un outil de pilotage** : gestion des comptes, finances, ingestion, impression, validation.
- **Tous les templates de compétences sont hardcodés** (pas de configuration UI) pour garantir la conformité MINEDUB.

---

## 3. STRUCTURE DU PROJET

```
ELIMU_V2/
├── src/
│   ├── main/                    # Processus principal Electron (Backend)
│   │   ├── handlers/            # Logique métier IPC
│   │   │   ├── eleves.js        # Notes, stats, profil élève
│   │   │   ├── classes.js       # CRUD classes
│   │   │   ├── importExcel.js   # Moteur d'import Excel
│   │   │   ├── finance.js
│   │   │   ├── parametres.js
│   │   │   └── backup.js
│   │   ├── utils/               # Utilitaires Node.js
│   │   ├── main.js              # Point d'entrée Electron
│   │   └── preload.js           # Pont sécurisé IPC (contextBridge)
│   ├── renderer/                # Interface utilisateur
│   │   ├── assets/              # CSS, images, polices
│   │   ├── locales/             # i18n (fr.js, en.js)
│   │   ├── sections/            # Modules UI
│   │   │   ├── dashboard/
│   │   │   ├── classes/
│   │   │   ├── eleves/          # Profil élève, notes N1/N2/N3
│   │   │   ├── parametres/
│   │   │   └── ...
│   │   └── renderer.js          # Point d'entrée UI
│   └── shared/                  # Code partagé (main + renderer)
│       ├── constants/
│       │   └── curriculum.js    # *** CŒUR : templates N1/N2/N3 + fonctions de calcul ***
│       ├── database/
│       │   ├── schema.sql       # Schéma SQLite
│       │   └── db.js            # Wrapper SQL + migrations
│       ├── security/
│       └── utils/               # Helpers
├── database/                    # Base SQLite locale
├── exports/                     # PDFs, exports
├── logs/
├── scripts/                     # seed_test_data.js
├── docs/
│   └── CALCUL_NOTES_N1_N2.md
└── package.json
```

---

## 4. SYSTÈME DE NOTATION — CURRICULUM MINEDUB

### 4.1 Niveaux et systèmes

| Niveau | Classes | Système | Total | Source |
|--------|---------|---------|-------|--------|
| **N1** | SIL, CP | Compétences + UA (qualitatif 4 niveaux) | 320 pts | `ELIMU_CURRICULUM_N1_N2.md` |
| **N2** | CE1, CE2 | Compétences + UA (qualitatif 4 niveaux) | 320 pts | `ELIMU_CURRICULUM_N1_N2.md` |
| **N3** | CM1, CM2 | Classique /20 (quantitatif, trimestres) | — | `ELIMU_CURRICULUM_N3.md` |

### 4.2 Cotation qualitative (N1/N2)

| Code | Signification | Plage /20 | Mapping numérique |
|------|--------------|-----------|-------------------|
| `NA` | Non Acquis | 0–10 | 5 |
| `ECA` | En Cours d'Acquisition | 11–14 | 12 |
| `A` | Acquis | 15–17 | 16 |
| `A+` | Expert | 18–20 | 19 |

### 4.3 Structure temporelle (N1/N2)

```
Année = 3 Trimestres = 8 UA
Trimestre 1 : UA1, UA2, UA3
Trimestre 2 : UA4, UA5, UA6
Trimestre 3 : UA7, UA8
```

### 4.4 Barèmes (src/shared/constants/curriculum.js — `CURRICULUM_TEMPLATES`)

**N1 (SIL/CP)** — 320 pts : C1=100, C2=60, C3=40, C4=20, C5=40, C6=60
**N2 (CE1/CE2)** — 320 pts : C1=80, C2=80, C3=40, C4=20, C5=40, C6=60

Chaque sous-compétence a 4 poids : `orale, ecrite, pratique, savoirEtre`. Les poids MINEDUB sont hardcodés. Exemple 1A (N1) : `{orale:20, ecrite:15, pratique:0, savoirEtre:5}`.

---

## 5. FORMULES DE CALCUL — POINT CRITIQUE

### 5.1 Stockage en base de données

Les sous-notes N1/N2 sont stockées **sur leur échelle réelle** (orale/20, ecrite/15, pratique/0–10, savoir-être/2–5 selon sous-compétence), PAS sur une base /20. La contrainte SQL est : `CHECK(note >= 0)` sans upper bound, car certaines sous-compétences N2 ont `ecrite=28` (ex: 2A, N2).

### 5.2 Affichage d'une sous-note dans le profil élève

```
noteAffichee = note_stockee  (valeur réelle, pas de conversion)
```

Exemple : note orale stockée 14/20 → affiché 14.0 (directement la valeur réelle)

### 5.3 Agrégat sous-compétence → note /20

La formule correcte est la **somme directe** :

```
total = Σ(val)         // somme des notes sur leur échelle réelle
agregat = (total / Σ(poids)) × 20
```

Où `poids` est le max curriculum de chaque sous-type.

Cette formule est implémentée dans :
- `src/shared/constants/curriculum.js` → `calcAggregateFromSubNotes()`
- `src/renderer/sections/eleves/eleves.js` → calcul inline
- `seed_test_data.js` → `calcAggregate()`

### 5.4 Code qualitatif

Le code qualitatif (`getNoteToCode()`) s'applique sur l'équivalent /20 de l'agrégat, pas sur la somme brute.

### 5.5 Conversion note → code qualitatif

```javascript
getNoteToCode(note)  // note sur /20
→ note 0-10  → 'NA'
→ note 11-14 → 'ECA'
→ note 15-17 → 'A'
→ note 18-20 → 'A+'
```

### 5.6 🔴 Erreurs passées (corrigées)

| Erreur | Fichier | Correctif |
|--------|---------|-----------|
| Agrégat = moyenne pondérée au lieu de somme directe | `curriculum.js` `calcAggregateFromSubNotes`, `eleves.js`, `seed_test_data.js` | Passer à `total += val` puis `(total/totalPoids)*20` |
| Notes stockées sur /20 avec CHECK ≤ 20 | `schema.sql`, `db.js` | Supprimer upper bound, stocker sur échelle réelle |
| Affichage `(note/20)*poids` au lieu de `note` directe | `eleves.js` | Afficher `noteReelle = s.note` |
| Sous-notes générées sur échelle /20 | `seed_test_data.js` | Générer sur `1..weights[type]` |
| `sous_competence_code` stocké `C1_1A` au lieu de `1A` | `seed_test_data.js`, handlers | Stocker uniquement le code (`1A`, `2B`, etc.) |
| N3 non géré par la PWA | `PWA/` | Ajouter `teacher_notes_n3`, endpoint API, frontend dédié |

---

## 6. FICHIERS CLÉS ET LEURS RESPONSABILITÉS

### 6.1 `src/shared/constants/curriculum.js`
- **Rôle** : Source de vérité unique pour les templates et calculs
- **Exporte** : `NOTE_MAPPING`, `getNoteToCode()`, `CURRICULUM_TEMPLATES`, `UA_TRIMESTRE_MAP`, `getWeightsForSousCompetence()`, `calcAggregateFromSubNotes()`, `SOUS_TYPES`
- **Utilisé par** : handlers eleves, importExcel, renderer eleves, seed

### 6.2 `src/renderer/sections/eleves/eleves.js`
- **Rôle** : Profil élève avec affichage des notes N1/N2/N3
- **Lignes importantes** :
  - `~473-497` : Calcul de la moyenne générale N1/N2 (inline) — **déjà corrigé**
  - `~722-733` : Affichage des sous-notes avec conversion /20 → note réelle
  - `~880-890` : Appel à `getNoteToCode()` pour affichage qualitatif
- **Dépend de** : `curriculum.js` (importé via le handler IPC)

### 6.3 `src/main/handlers/eleves.js`
- **Rôle** : Handlers IPC pour les opérations CRUD élèves et notes
- **Fonctions** : `saveNotes`, `getNotes`, `getStats`, `getEleveDetails`, `getBulletinData`
- **Important** : utilise `CURRICULUM_TEMPLATES` et `getWeightsForSousCompetence` pour les calculs côté backend

### 6.4 `src/shared/utils/importExcel.js`
- **Rôle** : Import des fichiers Excel signés (nomenclature stricte)
- **Utilise** : `calcAggregateFromSubNotes`, `CURRICULUM_TEMPLATES`

### 6.5 `src/renderer/sections/classes/templates.js`
- **Rôle** : `CLASS_TEMPLATES` et fonctions `getCompetencesN1()`, `getCompetencesN2()`
- **Contient** les listes de compétences/sous-compétences pour l'UI

### 6.6 `seed_test_data.js`
- **Rôle** : Génération de données de test
- **Important** : `calcAggregate()` doit utiliser `sum(val×poids)/sum(poids)` — corrigé

---

## 7. BASE DE DONNÉES — TABLE `notes`

```sql
CREATE TABLE notes (
    note_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    eleve_id             INTEGER NOT NULL REFERENCES eleves(eleve_id) ON DELETE CASCADE,
    matiere_id           INTEGER,           -- N3 only
    sous_competence_code TEXT,               -- N1/N2 only (ex: '1A', '2B', '4')
    type_eval            TEXT,               -- N1/N2 only ('orale','ecrite','pratique','savoirEtre')
    ua                   TEXT,               -- N1/N2 only ('UA1'..'UA8')
    note                 REAL NOT NULL CHECK(note >= 0),
    trimestre            INTEGER,            -- N3 only (1,2,3)
    sequence             INTEGER,            -- N3 only (1,2)
    coefficient          REAL DEFAULT 1,
    date_saisie          TEXT DEFAULT CURRENT_TIMESTAMP,
    enseignant_id        INTEGER,
    source               TEXT DEFAULT 'DESKTOP',
    verrouillee          INTEGER DEFAULT 0,
    UNIQUE(eleve_id, sous_competence_code, type_eval, ua)
);
```

### Contraintes importantes
- **N1/N2** : `matiere_id IS NULL`, `sous_competence_code` + `type_eval` + `ua` sont requis. Notes stockées sur échelle réelle (max variable selon sous-type).
- **N3** : `sous_competence_code IS NULL`, `matiere_id` + `trimestre` + `sequence` sont requis
- **Note** : `CHECK(note >= 0)` — plus d'upper bound fixe. Validation faite dans le code applicatif.

---

## 8. SÉCURITÉ ET CONVENTIONS DE CODE

(D'après `gemini/GEMINI.md`)

1. **Toute requête SQL** doit utiliser des paramètres (`?`, `$variable`). Interdiction de concaténer.
2. **Échapper tout innerHTML** avec `esc()`.
3. **Vérifier les rôles** avant modification via IPC.
4. **i18n** : `t('clé')` ou `data-i18n`, jamais de texte en dur.
5. **Performance** : DocumentFragment + requestAnimationFrame pour listes > 20 éléments.
6. **Migrations idempotentes** : `IF NOT EXISTS`.
7. **Ne jamais modifier schema.sql sans script de migration séparé.**
8. **Ne jamais supprimer/renommer des fichiers sans confirmation.**
9. **Commiter après chaque modification :** `git add -A && git commit -m "description" && git push`. Toujours faire un commit après chaque changement significatif (correction, fonctionnalité, refactor).

---

## 9. ÉTAT D'AVANCEMENT PHASE 1 (✅ Complété)

| Pilier | Statut | Détail |
|--------|--------|--------|
| Migration schéma notes | ✅ | Table hybride N1/N2/N3, champ `niveau_v2` dans classes |
| Moteur curriculum | ✅ | `curriculum.js` avec templates N1/N2/N3, fonctions de calcul |
| Nettoyage UI Desktop | ✅ | Onglet Notes supprimé, presets classes, bannière rôles |

### 🔴 Erreurs fondamentales corrigées (session Juillet 2026)

Le calcul des notes N1/N2 contenait une **erreur fondamentale** dans toute la stack (PWA + Desktop) :
- La formule `Σ(val × poids) / Σ(poids)` (moyenne pondérée) était utilisée, mais le curriculum MINEDUB exige une **somme directe** `Σ(val)` convertie en /20 par `(total / Σ(poids)) × 20`.
- Les sous-notes étaient stockées sur `/20` en DB, mais le curriculum MINEDUB spécifie un max différent par sous-type (orale=20, ecrite=15, pratique=0–10, savoir-être=2–5). Certaines sous-compétences N2 ont même `ecrite=28` (ex: 2A, N2), ce qui dépasse 20. Le CHECK `<= 20` a donc été supprimé.
- L'affichage appliquait `(note_stockee / 20) × poids` pour retrouver la note réelle, mais cela inversait la formule : la note réelle est saisie directement, pas stockée sur /20.

**Correctifs appliqués :**
- `calcAggregateFromSubNotes` → `total += val` (somme directe), retourne `(total/totalPoids)*20`
- `schema.sql` / `db.js` → CHECK passe de `>=0 AND <=20` à `>=0`
- Affichage `eleves.js` → `noteReelle = s.note` (valeur directe), code qualitatif sur `(note/maxPts)*20`
- `seed_test_data.js` → génération sur `1..weights[t]` (échelle réelle), agrégat somme directe
- PWA → ajout `teacher_notes_n3` + endpoint + frontend dédié

### Transformation section Professeurs → Comptes Enseignants PWA (Juillet 2026)

| Changement | Fichier |
|-----------|---------|
| Colonnes `utilisateur_id` + `derniere_connexion` ajoutees à `professeurs` | `schema.sql`, `db.js` |
| Backend reecrit : 6 nouveaux handlers (createTeacherAccount, suspend, reactivate, resetPassword, getTeacherLoginHistory, printTeacherAccessCard), JOIN utilisateurs, refactor requêtes existantes | `handlers/professeurs.js` |
| 6 nouvelles APIs exposées dans preload | `preload.js` |
| Frontend HTML reecrit : liste cartes centree comptes, modale creation avec affichage MDP unique, modale detail avec onglets Compte/Journal, statut actif/suspendu | `professeurs.html` |
| Frontend JS reecrit : state management V2, suspendre/reactiver/reinitialiser MDP/imprimer fiche acces, historique connexions | `professeurs.js` |
| Locales mises à jour (fr + en) pour toutes les nouvelles cles | `locales/fr.js`, `locales/en.js` |
| Import Excel auto-genere comptes (utilisateur + professeur) avec mot de passe securise | `utils/importExcel.js` |

**Notes** : La modale edition ne permet PAS de modifier le mot de passe (seulement via Reinitialiser). Le MDP genéré à la creation est affiché UNE SEULE fois avec bloc jaune d'avertissement. Les champs RH (civilite, sexe, specialite, diplome, adresse, ville, date_embauche) sont supprimes de l'UI et des imports.

---

## 10. N3 (CM1/CM2) — VÉRIFICATION

Le niveau 3 conserve le système classique de la V1 :
- Matières fixes (22 matières, codifiées dans `CURRICULUM_TEMPLATES.N3.matieresFixes`)
- Notes /20 par matière
- 3 Trimestres × 2 Séquences
- Coefficients par matière
- Trigger SQL `trg_calc_stats_eleves` pour les moyennes pré-calculées

**Desktop** : l'infrastructure V1 gère déjà nativement le N3 (table `notes` avec `matiere_id`, triggers SQL, moyennes pré-calculées).

**PWA** : le N3 est désormais géré via la table `teacher_notes_n3` et un flux dédié (sélection séquence → grille élèves × matières). Le backend PWA expose `POST /api/teacher/notes-n3`.

---

## 11. VÉRIFICATIONS AVANT CHAQUE MODIFICATION

1. Le curriculum MINEDUB est-il respecté ? (vérifier `ELIMU_CURRICULUM_N1_N2.md` ou `ELIMU_CURRICULUM_N3.md`)
2. La formule utilise-t-elle la **somme directe** `Σ(val)` convertie en `/20` et non la moyenne pondérée ?
3. Les sous-notes N1/N2 sont-elles stockées sur leur échelle réelle (pas /20) ?
4. L'affichage affiche-t-il la note réelle directement (pas de conversion /20 → poids) ?
5. Le `sous_competence_code` est-il le code seul (ex: `1A`) sans préfixe ?
6. La conversion qualitative `getNoteToCode()` est-elle appliquée sur l'équivalent /20 ?

---

## 12. TESTS

```bash
# Lancer l'application
npx electron .

# Seed des données de test (après suppression DB)
node scripts/seed_test_data.js clean
```

Pas de framework de tests unitaires automatisés. La vérification se fait :
- Visuellement dans le profil élève (sections N1/N2/N3)
- En inspectant la DB avec `SELECT * FROM notes`
- En vérifiant les calculs d'agrégat manuellement

---

## 13. DÉCISIONS ARCHITECTURALES CLÉS

| Décision | Justification |
|----------|--------------|
| **Hardcoder les templates** | Conformité MINEDUB garantie, pas de dérive par configuration UI |
| **Stockage /20 en DB** | Simplifie les calculs et le mapping qualitatif |
| **Poids = max curriculum** | `orale:20` signifie « note sur 20 au max » pour l'affichage, ET sert de poids pour la moyenne |
| **Desktop = pilotage uniquement** | Évite toute confusion de rôle, aligné avec la vision V2 |
| **Triggers SQL pour moyennes N3** | Performance O(1) vs recalcul à chaque affichage |
| **N1/N2 calcul côté JS** | Car dépend du curriculum (poids variables par sous-compétence) |

---

## 14. MULTI-ÉCOLE — ISOLATION PAR `ecole_id`

### 14.1 Principe
Chaque installation d'ÉLIMU Desktop génère un UUID stable à son démarrage (`parametres.ecole_id`).
Cet UUID est utilisé pour isoler toutes les données de l'école dans la Base B partagée.

### 14.2 Règles strictes
1. **Chaque table de données** a une colonne `ecole_id TEXT NOT NULL DEFAULT ''`
2. **Chaque requête SQL** (SELECT, INSERT, UPDATE, DELETE) DOIT inclure `WHERE ecole_id = ?`
3. **`ecole_id` provient de `deps.getCurrentEcoleId()`** dans les handlers, jamais d'un paramètre client
4. **Les INSERTS** incluent `ecole_id` comme colonne
5. **Les contraintes UNIQUE** incluent `ecole_id` (ex: `UNIQUE(ecole_id, nom_utilisateur)`)

### 14.3 UUID stable
- Généré par `crypto.randomUUID()` au premier démarrage
- Stocké dans `parametres.cle = 'ecole_id'`
- Préservé entre les redémarrages, même si le nom de l'école change
- Transmis dans les syncs Desktop→PWA au lieu de l'ancien dérivé du nom

### 14.6 Où le directeur trouve le code école (depuis le 27 Juillet 2026)
Le `ecole_id` (UUID) est désormais affiché à 3 endroits dans le Desktop :
1. **Paramètres > Général** — bloc "Code établissement" avec bouton Copier
2. **Création d'un compte enseignant** — encadré bleu sous le mot de passe généré
3. **Détail du compte enseignant** — dans la section "Compte PWA"
4. **Fiche d'accès PDF imprimée** — ligne "Code ecole" sous l'identifiant

Le directeur copie le code et le communique aux enseignants (oral, SMS, fiche imprimée).
L'enseignant le saisit une seule fois lors de la première connexion PWA.

### 14.4 Tables isolées
`utilisateurs`, `professeurs`, `classes`, `eleves`, `notes`, `absences`, `parents`,
`sanctions`, `imports`, `audit_log`, `heures_absence`, `frais_types`, `tranches`, `paiements`

### 14.5 Tests d'isolation (à faire)
- Créer 2 écoles fictives → vérifier qu'aucune donnée ne fuit
- Confirmer que le `ecole_id` du JWT/du Desktop est toujours utilisé, jamais celui du client

## 15. HISTORIQUE DES MODIFICATIONS

| Date | Changement | Fichiers |
|------|-----------|----------|
| 27 Juillet 2026 | **Affichage code école dans l'UI Desktop** — `ecole_id` UUID désormais visible dans Paramètres > Général, modale création enseignant, détail compte, et fiche d'accès PDF | `parametres/modules/general.js`, `parametres/parametres.html`, `professeurs/professeurs.html`, `professeurs/professeurs.js`, `handlers/professeurs.js` |

---

*Document généré le 20 Juillet 2026 — mis à jour le 27 Juillet 2026*
