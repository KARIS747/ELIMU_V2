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

Les sous-notes sont **toujours stockées sur /20** en DB. La contrainte SQL est : `CHECK(note >= 0 AND note <= 20)`.

### 5.2 Affichage d'une sous-note dans le profil élève

```
noteAffichee = (note_stockee / 20) × poids_curriculum
```

Exemple : note orale stockée 14/20, poids orale = 20 → affiché 14.0 (car 14/20×20 = 14.0)

### 5.3 Agrégat sous-compétence → note /20

La formule correcte est la **moyenne pondérée** :

```
agregat = sum(val_stockee × poids) / sum(poids)
```

Où `val_stockee` est la note /20 et `poids` le max curriculum.

Cette formule est implémentée dans :
- `src/shared/constants/curriculum.js` → `calcAggregateFromSubNotes()`
- `src/renderer/sections/eleves/eleves.js` → calcul inline (lignes ~489–495)
- `seed_test_data.js` → `calcAggregate()`

### 5.4 Conversion note → code qualitatif

```javascript
getNoteToCode(note)  // note sur /20
→ note 0-10  → 'NA'
→ note 11-14 → 'ECA'
→ note 15-17 → 'A'
→ note 18-20 → 'A+'
```

### 5.5 🔴 Erreurs passées (corrigées)

| Erreur | Fichier | Correctif |
|--------|---------|-----------|
| `val * poids` → résultat non pondéré | `curriculum.js` `calcAggregateFromSubNotes` | Revenir à `sum(val×poids)/sum(poids)` |
| `sous_competence_code` stocké `C1_1A` au lieu de `1A` | `seed_test_data.js`, handlers | Stocker uniquement le code (`1A`, `2B`, etc.) |
| Notes générées `rand(4,19)` sans respecter max DB | `seed_test_data.js` | `rand(4,20)` |
| Formule `(totalPts/totalMax)*20` saturant à 20 quand max > 20 | `eleves.js` ligne 489-495 | Remplacer par `sum(val×poids)/sum(poids)` |

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
    note                 REAL NOT NULL CHECK(note >= 0 AND note <= 20),
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
- **N1/N2** : `matiere_id IS NULL`, `sous_competence_code` + `type_eval` + `ua` sont requis
- **N3** : `sous_competence_code IS NULL`, `matiere_id` + `trimestre` + `sequence` sont requis
- **Note** : `CHECK(note >= 0 AND note <= 20)` — toujours sur /20

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

---

## 9. ÉTAT D'AVANCEMENT PHASE 1 (✅ Complété)

| Pilier | Statut | Détail |
|--------|--------|--------|
| Migration schéma notes | ✅ | Table hybride N1/N2/N3, champ `niveau_v2` dans classes |
| Moteur curriculum | ✅ | `curriculum.js` avec templates N1/N2/N3, fonctions de calcul |
| Nettoyage UI Desktop | ✅ | Onglet Notes supprimé, presets classes, bannière rôles |

### Bugs corrigés dans la session (Juillet 2026)

- [x] `calcAggregateFromSubNotes` utilisait `val * poids` au lieu de moyenne pondérée
- [x] `sous_competence_code` stocké avec préfixe `C1_` au lieu du code seul
- [x] `seed_test_data.js` générait `rand(4,19)` hors plage autorisée pour certains types
- [x] Formule `(totalPts/totalMax)*20` dans `eleves.js` saturait à 20 pour N2

---

## 10. N3 (CM1/CM2) — VÉRIFICATION

Le niveau 3 conserve le système classique de la V1 :
- Matières fixes (22 matières, codifiées dans `CURRICULUM_TEMPLATES.N3.matieresFixes`)
- Notes /20 par matière
- 3 Trimestres × 2 Séquences
- Coefficients par matière
- Trigger SQL `trg_calc_stats_eleves` pour les moyennes pré-calculées

**Aucune modification nécessaire** — l'infrastructure V1 gère déjà nativement le N3.

---

## 11. VÉRIFICATIONS AVANT CHAQUE MODIFICATION

1. Le curriculum MINEDUB est-il respecté ? (vérifier `ELIMU_CURRICULUM_N1_N2.md` ou `ELIMU_CURRICULUM_N3.md`)
2. La formule utilise-t-elle `sum(val×poids)/sum(poids)` et non `(total/totalMax)*20` ?
3. Les sous-notes sont-elles stockées sur /20 en DB ?
4. L'affichage applique-t-il `(note/20) × poids` pour la note réelle ?
5. Le `sous_competence_code` est-il le code seul (ex: `1A`) sans préfixe ?
6. La conversion qualitative `getNoteToCode()` est-elle appliquée sur la note /20 ?

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

*Document généré le 15 Juillet 2026 — à mettre à jour après chaque modification significative.*
