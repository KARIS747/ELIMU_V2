# AGENTS.md — ÉLIMU V2 (Desktop)

> Fichier de mémoire pour l'assistant IA travaillant sur l'application desktop ÉLIMU V2.
> À lire en intégralité avant toute modification. Dernière mise à jour : 22 Août 2026 (état v1.8.0+).

---

## 1. IDENTITÉ DU PROJET

| Champ | Valeur |
|-------|--------|
| **Nom** | ÉLIMU V2 (produit : « Elimu », version courante : 1.8.x) |
| **Éditeur** | KarisDev — Karis Zogo Emmanuel |
| **Type** | Application de gestion scolaire desktop |
| **Stack** | Electron 31 + JavaScript (Vanilla) + better-sqlite3 ^12.11.1 |
| **Base de données locale** | SQLite via better-sqlite3 (fichiers dans `database/`) |
| **Base de données cloud** | PostgreSQL (Neon) — synchronisation Desktop/PWA/Portail |
| **Portail parents** | Web (Render) — lecture seule, repo séparé `../portal` |
| **PWA enseignants** | Web mobile hors-ligne, repo séparé `../PWA` |
| **Sécurité** | bcryptjs, HWID, HMAC-SHA256, JWT, audit trail, CSP stricte |
| **Cible** | Écoles primaires camerounaises (système MINEDUB) |
| **Contact** | karisdev369@gmail.com — Tél. : +237 681 266 058 |
| **Licence** | Propriétaire — CLUF 15 articles (`build-resources/license.txt`, UTF-8 avec BOM obligatoire) |

### Références documentaires (fichiers existants uniquement)

| Fichier | Contenu |
|---------|---------|
| `README.md` | Installation, build/release, structure |
| `docs/CALCUL_NOTES_N1_N2.md` | Formules de calcul N1/N2 détaillées |
| `docs/TABLEAU_D_HONNEUR.md` | Fonctionnement du module Tableau d'honneur |
| `build-resources/license.txt` | CLUF complet (15 articles, droit camerounais) |

> Les anciennes références (`gemini/`, `../ELIMU_V2_VISION.md`, etc.) n'existent plus. Ne pas s'y fier.

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
- **Flux au démarrage** : splash screen → vérification licence (HWID + HMAC) → écran d'activation si invalide (glisser-déposer du bundle ou clé manuelle) → fenêtre principale.

---

## 3. STRUCTURE DU PROJET

```
ELIMU_V2/
├── src/
│   ├── main/                        # Processus principal Electron (Backend)
│   │   ├── handlers/
│   │   │   ├── auth.js              # Connexion utilisateurs (10 handlers)
│   │   │   ├── eleves.js            # CRUD élèves, notes, stats, profil (12)
│   │   │   ├── classes.js           # CRUD classes (4)
│   │   │   ├── matieres.js          # Matières/coefs N3 (4)
│   │   │   ├── absences.js          # Absences et heures (8)
│   │   │   ├── finance.js           # Frais, tranches, paiements (16)
│   │   │   ├── parents.js           # Comptes parents + sync portail (8)
│   │   │   ├── professeurs.js       # Comptes enseignants PWA (17)
│   │   │   ├── importExport.js      # Exports PDF/Excel + imports Excel (23)
│   │   │   ├── parametres.js        # bulletin_config, logo, général (7)
│   │   │   ├── anneesScolaires.js   # Années scolaires (9)
│   │   │   ├── sauvegarde.js        # Backup local + Cloud Recovery (4)
│   │   │   ├── audit.js             # Journal d'audit (2)
│   │   │   └── license.js           # Activation/licence HWID (4)
│   │   ├── utils/                   # financeUtils, integrity, testData
│   │   ├── main.js                  # Point d'entrée : splash → licence → main
│   │   ├── preload.js               # Pont contextBridge (window.elimuAPI)
│   │   └── splash-preload.js        # Pont de la splash screen
│   ├── renderer/                    # Interface utilisateur
│   │   ├── assets/                  # CSS, images, polices (woff2)
│   │   ├── locales/                 # i18n : fr.js, en.js, index.js
│   │   ├── license-screen/          # Écran d'activation (drag-drop bundle / clé)
│   │   ├── splash/                  # Splash screen
│   │   ├── sections/
│   │   │   ├── dashboard/
│   │   │   ├── classes/
│   │   │   ├── eleves/              # Profil élève, notes N1/N2/N3, exports
│   │   │   ├── professeurs/         # Comptes enseignants PWA
│   │   │   ├── parents/
│   │   │   ├── finance/
│   │   │   ├── import_export/       # Tableau d'honneur, listes affichables, pyramide, imports
│   │   │   └── parametres/          # modules/ : general, bulletin, annees, seuils,
│   │   │                            #   absences, utilisateurs, sauvegarde, audit, update
│   │   ├── index.html               # Coquille principale (sidebar dynamique par rôle)
│   │   └── assets/js/renderer.js    # Point d'entrée UI
│   └── shared/                      # Code partagé (main + renderer)
│       ├── constants/curriculum.js  # *** CŒUR : templates N1/N2/N3 + fonctions de calcul ***
│       ├── database/
│       │   ├── schema.sql           # Schéma SQLite (version 123)
│       │   └── db.js                # Wrapper SQL + migrations idempotentes
│       ├── security/                # access.js, audit.js, auth.js, rate.Limit.js
│       ├── license.js (+ .secret.js # Secret injecté au build, JAMAIS commité
│       │      gitigné)              #
│       └── utils/
│           ├── pdf/                 # 11 modules PDF (voir §6.7)
│           ├── excel/               # exportExcel, exportExcelRentree, modeleImport
│           ├── import/              # classic, formatB, listeEleves, listeProfesseurs,
│           │                        #   absencesExcel, pwaExport
│           ├── importExcel.js       # Orchestrateur d'import signé
│           ├── parentSync.js        # Sync comptes parents → portail
│           ├── modeleNotes.js / modeleAbsences.js
│           ├── exportFiles.js / dateUtils.js / phone.js / logger.js
│           └── recuPDF.js           # Reçus de paiement
├── tests/
│   ├── unit/                        # Jest : curriculum, bulletinQualitatif, pyramideAge,
│   │                                #   finance, license, dateUtils, exportFiles
│   └── integration/                 # Jest --forceExit : db, auth, isolation, finance,
│                                    #   absences, importExcel, parentSync
├── scripts/                         # demo_data.js, generateTestData*.js, inject-secret.js,
│                                    #   obfuscate.js, smoke-test.js
├── tools/                           # diagnostic-finance.js, diagnostic.sh, reset_pass.js
├── build-resources/                 # icon.ico, icons/, license.txt (CLUF, UTF-8 BOM), scripts/
├── database/                        # Bases SQLite locales (*.db)
├── exports/                         # PDFs, exports générés
├── logs/                            # Journaux (winston daily rotate)
├── backups/                         # Sauvegardes locales
├── .github/workflows/               # ci.yml (tests), release.yml (build + publish)
├── seed_test_data.js                # Générateur seed racine (sous-commande clean)
└── package.json                     # v1.8.0 — voir scripts npm §13
```

> Fichiers divers à la racine (`clean*`, `clean_emojis.js`, `gen_advantages_pdf.js`,
> `LISTES_A_AJOUTER.md`) : artefacts historiques, ne pas s'en inspirer pour le code neuf.

---

## 4. SYSTÈME DE NOTATION — CURRICULUM MINEDUB

### 4.1 Niveaux et systèmes

| Niveau | Classes | Système | Total |
|--------|---------|---------|-------|
| **N1** | SIL, CP | Compétences + UA (qualitatif 4 niveaux) | 320 pts |
| **N2** | CE1, CE2 | Compétences + UA (qualitatif 4 niveaux) | 320 pts |
| **N2-APC** | CM1 | Même template que N2 — CM1 en APC, `niveau_v2='N2'` (depuis v123) | 320 pts |
| **N3** | CM2 | Classique /20 (quantitatif, trimestres) — seul niveau resté en classique | — |

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

### 4.4 Barèmes (src/shared/constants/curriculum.js — CURRICULUM_TEMPLATES)

**N1 (SIL/CP)** — 320 pts : C1=100, C2=60, C3=40, C4=20, C5=40, C6=60
**N2 (CE1/CE2)** — 320 pts : C1=80, C2=80, C3=40, C4=20, C5=40, C6=60

Chaque sous-compétence a 4 poids hardcodés MINEDUB : `orale, ecrite, pratique, savoirEtre`.
Exemple 1A (N1) : `{orale:20, ecrite:15, pratique:0, savoirEtre:5}`. Certaines sous-compétences
N2 ont `ecrite=28` (ex: 2A).

---

## 5. FORMULES DE CALCUL — POINT CRITIQUE

### 5.1 Stockage en base de données

Les sous-notes N1/N2 sont stockées **sur leur échelle réelle** (orale/20, ecrite/15,
pratique/0–10, savoir-être/2–5 selon sous-compétence), PAS sur une base /20.
Contrainte SQL : `CHECK(note >= 0)` sans upper bound.

### 5.2 Affichage d'une sous-note dans le profil élève

```
noteAffichee = note_stockee   // valeur réelle directe, aucune conversion
```

### 5.3 Agrégat sous-compétence → note /20

Formule correcte = **somme directe** (PAS une moyenne pondérée) :

```
total   = Σ(val)                    // somme des notes sur leur échelle réelle
agregat = (total / Σ(poids)) × 20   // poids = max curriculum de chaque sous-type
```

Implémentée dans :
- `src/shared/constants/curriculum.js` → `calcAggregateFromSubNotes()`
- `src/renderer/sections/eleves/eleves.js` (calcul inline)
- `seed_test_data.js` → `calcAggregate()` (même logique)

La moyenne générale d'un élève = **simple moyenne des agrégats** des sous-compétences.

### 5.4 Code qualitatif

`getNoteToCode()` s'applique sur l'équivalent /20 de l'agrégat, pas sur la somme brute :

```javascript
note 0–10 → 'NA' ; 11–14 → 'ECA' ; 15–17 → 'A' ; 18–20 → 'A+'
```

### 5.5 Erreurs passées corrigées (à ne JAMAIS réintroduire)

| Erreur | Correctif |
|--------|-----------|
| Agrégat = moyenne pondérée `Σ(val×poids)/Σ(poids)` | Somme directe `(total/totalPoids)*20` |
| Sous-notes stockées sur /20 avec CHECK ≤ 20 | Échelle réelle, CHECK `>= 0` seul |
| Affichage `(note/20)*poids` | `noteReelle = s.note` (valeur directe) |
| Seed généré sur /20 | Génération sur `1..weights[type]` |
| Code `sous_competence_code` préfixé (`C1_1A`) | Code seul (`1A`, `2B`) |
| N3 absent de la PWA | Table `teacher_notes_n3` + endpoint + frontend dédiés |

Des tests de non-régression existent : `tests/unit/bulletinQualitatif.test.js`.

---

## 6. FICHIERS CLÉS ET LEURS RESPONSABILITÉS

### 6.1 `src/shared/constants/curriculum.js`
Source de vérité unique. Exporte notamment : `NOTE_MAPPING`, `getNoteToCode()`,
`CURRICULUM_TEMPLATES`, `UA_TRIMESTRE_MAP`, `getWeightsForSousCompetence()`,
`calcAggregateFromSubNotes()`. Utilisé par handlers eleves/importExcel, renderer, seed, tests.

### 6.2 `src/renderer/sections/eleves/eleves.js`
Profil élève (notes N1/N2/N3), modale export pilotée par mode (`ouvrirModaleExportListe(mode)`
: `'liste'` vs `'pyramide'` — titre/description dynamiques via `dataset.i18n`).
Dépend de `curriculum.js` via IPC.

### 6.3 `src/main/handlers/eleves.js`
Handlers IPC CRUD élèves/notes/stats. Utilise `CURRICULUM_TEMPLATES` côté backend.

### 6.4 Imports Excel
- `src/shared/utils/importExcel.js` : orchestrateur (nomenclature stricte, fichier signé)
- `src/shared/utils/import/*` : formats spécialisés — `classic.js`, `formatB.js`,
  `listeEleves.js`, `listeProfesseurs.js`, `absencesExcel.js` (scan entête tolérant),
  `pwaExport.js`
- L'import génère automatiquement les comptes enseignants (utilisateur + professeur)

### 6.5 `src/renderer/sections/classes/templates.js`
`CLASS_TEMPLATES` + listes de compétences/sous-compétences pour l'UI.

### 6.6 `seed_test_data.js` / `scripts/demo_data.js`
- `node seed_test_data.js clean` : reset + seed technique
- `npm run demo:data` : base de démonstration réaliste (~250 élèves, notes, finances).
  Préserve `ecole_id`, `code_ecole` et les clés de connexion PWA/portail lors de la
  régénération.

### 6.7 Modules PDF (`src/shared/utils/pdf/`)

Conventions partagées dans `helpers.js` : `loadConfig()` (table `bulletin_config`, avec cache),
`drawAdminHeader(doc, cfg, y, lang, isMinimal)` (entête officielle bilingue),
`drawLogoFiligrane(doc, cfg, {opacity})`, `getMention/getMentionColor(note, cfg)`.
Traductions PDF : `locales.js` → `getDocTranslator(lang)`.

| Module | Rôle |
|--------|------|
| `bulletinTrimestre.js` | Bulletins trimestriels N1/N2/N3, 3 styles (`officiel`, `moderne`, `minimal`) |
| `bulletinRecap.js` | Récapitulatif annuel |
| `tableauHonneur.js` | Diplômes A4 paysage ; couleurs dédiées `th_couleur_primaire`/`th_couleur_secondaire` avec repli sur celles du bulletin |
| `pyramideAge.js` | Pyramide des âges d'une classe par sexe |
| `listesAffichables.js` | Listes affichables paysage N1/N2 (poids/UA) et N3 (/20 par séquence) |
| `ficheAccesEnseignant.js` | Fiche d'accès A5 (module partagé : création de compte ET impression manuelle) |
| `recuParents.js` | Reçus de paiement |
| `exportImpayes.js` | Liste des impayés |
| `styles.js` | Constantes de style communes |

Couleurs bulletins : `couleur_primaire` (défaut `#1a3c6e`), `couleur_secondaire` (défaut `#c8a415`),
stockées dans `bulletin_config` (clé/valeur, sauvegarde sans whitelist via `db:saveBulletinConfig`).
Après sauvegarde UI, appeler `window.invalidateBulletinConfigCache()`.

---

## 7. BASE DE DONNÉES

Version courante du schéma : **123** (`CURRENT_SCHEMA_VERSION` dans `db.js`).
Toute migration DOIT incrémenter cette version (sinon les bases installées ne migrent pas)
et rester idempotente (`IF NOT EXISTS`). Historique récent : 121→122 (matricule élèves),
122→123 (CM1 en notation N2/APC).

### Table `notes` (hybride N1/N2/N3)

```sql
CREATE TABLE notes (
    note_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    eleve_id             INTEGER NOT NULL REFERENCES eleves(eleve_id) ON DELETE CASCADE,
    matiere_id           INTEGER,           -- N3 only
    sous_competence_code TEXT,               -- N1/N2 only (ex: '1A', '2B')
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

- **N1/N2** : `matiere_id IS NULL` ; code + type_eval + ua requis ; échelle réelle.
- **N3** : `sous_competence_code IS NULL` ; matiere + trimestre + sequence requis ;
  moyennes pré-calculées via trigger `trg_calc_stats_eleves` sur `stats_eleves`.
- `stats_eleves` est poussée vers le portail lors de la sync (mêmes formules que l'app).

---

## 8. SÉCURITÉ ET CONVENTIONS DE CODE

1. **Toute requête SQL** utilise des paramètres (`?`, `$variable`). Interdiction de concaténer.
2. **Échapper tout innerHTML** avec `esc()`.
3. **Vérifier les rôles** avant modification via IPC.
4. **i18n** : `t('clé')` ou `data-i18n`, jamais de texte en dur. Le mécanisme `translatePage()`
   relit `[data-i18n]` à chaque changement de langue : pour un texte mis à jour dynamiquement,
   mettre à jour `el.dataset.i18n` ET `el.textContent`.
5. **Performance** : DocumentFragment + requestAnimationFrame pour listes > 20 éléments.
6. **Migrations idempotentes** : `IF NOT EXISTS` + bump de `CURRENT_SCHEMA_VERSION`.
7. **Jamais modifier schema.sql sans script de migration séparé dans db.js.**
8. **Jamais supprimer/renommer un fichier sans confirmation.**
9. **Commiter après chaque changement significatif :**
   `git add -A && git commit -m "description" && git push`.
10. **Pas d'émojis dans les textes visibles par l'utilisateur** (fr.js/en.js, PDF, HTML).
11. **CSP stricte** : aucun script inline, aucun gestionnaire inline (`onclick=` interdit) —
    utiliser `addEventListener` + CSS hover. Le script de thème vit dans preload.
12. **Isolation multi-école** : toute requête sur table de données filtre par `ecole_id` (§15).

---

## 9. LICENCE ET ACTIVATION

- Clé au format `ELIMU-YYYY-MM-DD-HWID-XXXX` : signature HMAC-SHA256 tronquée à 16 hex
  (64 bits). Le Desktop accepte les signatures 16 et 8 hex, calculées avec le secret courant
  OU le secret historique (compatibilité).
- **Secret jamais commité** : injecté au build par `scripts/inject-secret.js` depuis la var
  d'environnement `ELIMU_LICENCE_SECRET` dans `src/shared/license.secret.js` (gitigné,
  obfusqué ensuite). Un build sans secret échoue volontairement.
- **Activation** : écran `renderer/license-screen/` — méthode 1 : glisser-déposer d'un
  `elimu-installation.json` (bundle fournisseur contenant licence + config école initiale,
  appliquée sans écraser l'identité existante) ; méthode 2 : saisie manuelle de la clé.
  La clé validée est stockée dans `<userData>/license.key`.
- La licence est liée au HWID ; bandeau d'avertissement dans l'app à J-30/J-0 de l'expiration.
- Le CLUF affiché par l'installateur NSIS est `build-resources/license.txt` :
  **UTF-8 avec BOM obligatoire**, sinon accents cassés chez le client.

---

## 10. BUILD, RELEASE ET CI

```bash
npm run build:win      # Windows NSIS x64 (inject-secret + obfuscate + smoke-test + builder)
npm run build:linux    # AppImage + deb
npm run build:all      # Les deux
```

- Builds officiels **exclusivement via GitHub Actions** (`release.yml`) : publication
  electron-builder `--publish always` sur le repo GitHub `KARIS747/ELIMU-APP`
  (les mises à jour auto passent par `electron-updater`).
- `ci.yml` : job tests avec `npm rebuild better-sqlite3` après `npm ci` (le postinstall
  compile sinon pour Electron).
- Obfuscation (`javascript-obfuscator`) puis smoke-test (`scripts/smoke-test.js`) avant empaquetage.
- Packaging : asar activé, `bcryptjs` dépacké, `database/*.db` en extraResources.

---

## 11. N3 (CM2) — VÉRIFICATION

Le niveau 3 (**réservé au CM2**) conserve le système classique :
22 matières fixes (`CURRICULUM_TEMPLATES.N3.matieresFixes`), notes /20 par matière,
3 Trimestres × 2 Séquences, coefficients par matière, moyennes pré-calculées par triggers SQL.

**Desktop** : infrastructure native (table `notes` avec `matiere_id`, triggers).
**PWA** : table `teacher_notes_n3` + endpoint `POST /api/teacher/notes-n3` + flux dédié
(sélection séquence → grille élèves × matières).

---

## 12. VÉRIFICATIONS AVANT CHAQUE MODIFICATION

1. Le curriculum MINEDUB est-il respecté ?
2. La formule utilise-t-elle la **somme directe** `Σ(val)` convertie en `/20` (jamais la moyenne pondérée) ?
3. Les sous-notes N1/N2 restent-elles sur leur échelle réelle (pas /20) ?
4. L'affichage montre-t-il la note réelle directement ?
5. Le `sous_competence_code` est-il le code seul (ex: `1A`) ?
6. `getNoteToCode()` est-il appliqué sur l'équivalent /20 ?
7. Migration DB ? → bump `CURRENT_SCHEMA_VERSION` + idempotence.
8. Nouveau texte UI ? → i18n fr + en, pas d'émojis.
9. Nouvelle table/requête ? → `ecole_id` partout (§15).

---

## 13. TESTS ET OUTILS DE DÉVELOPPEMENT

Framework : **Jest 30**. Ne JAMAIS supposer qu'il n'y a pas de tests.

```bash
npm test                # Tests unitaires (jest tests/unit)
npm run test:integration # Tests d'intégration (--forceExit requis)
npm run test:all        # Tout (--forceExit)
```

- Unitaires : `curriculum`, `bulletinQualitatif` (non-régression somme directe),
  `pyramideAge`, `finance`, `license`, `dateUtils`, `exportFiles`.
- Intégration : `db`, `auth`, `isolation` (multi-école), `finance`, `absences`,
  `importExcel`, `parentSync`.

### Piège better-sqlite3 (Node vs Electron ABI)

Module natif : compilé pour **Electron ABI 125** par le postinstall, mais les tests tournent
sous **Node 24 ABI 137**. Impossible d'avoir les deux simultanément en local.

```bash
npm run rebuild:electron   # Avant de lancer l'app
npm run rebuild:node       # Avant de lancer les tests Node
```

- Ne jamais vérifier l'ABI par un simple `require('better-sqlite3')` : le binaire n'est
  chargé qu'à l'instantiation `new Database(...)`.
- Après des tests Node, penser à restaurer `npm run rebuild:electron` avant de lancer l'app.

Autres outils : `tools/diagnostic-finance.js`, `tools/reset_pass.js`, `tools/diagnostic.sh`,
`scripts/generateTestData*.js`.

---

## 14. DÉCISIONS ARCHITECTURALES CLÉS

| Décision | Justification |
|----------|--------------|
| **Hardcoder les templates** | Conformité MINEDUB garantie, pas de dérive par configuration UI |
| **Stockage des sous-notes sur échelle réelle** | Le max varie par sous-type (orale 20, ecrite 15/28...) ; conversion /20 uniquement au calcul d'agrégat |
| **Poids = max curriculum** | `orale:20` = « note sur 20 au max » pour l'affichage ET poids de conversion |
| **Desktop = pilotage uniquement** | Évite toute confusion de rôle, aligné avec la vision V2 |
| **Triggers SQL pour moyennes N3** | Performance O(1) vs recalcul à chaque affichage ; `stats_eleves` synchronisée telle quelle vers le portail |
| **N1/N2 calcul côté JS** | Dépend du curriculum (poids variables par sous-compétence) |
| **Couleurs TH distinctes des bulletins** | `th_couleur_*` dans `bulletin_config` avec repli — personnalisation diplômes sans toucher aux bulletins |

---

## 15. MULTI-ÉCOLE — ISOLATION PAR `ecole_id`

### 15.1 Principe
Chaque installation génère un UUID stable au premier démarrage (`crypto.randomUUID()`,
stocké dans `parametres.cle='ecole_id'`), préservé entre redémarrages et régénérations
de démo. Il isole les données de l'école dans la base cloud partagée.

### 15.2 Règles strictes
1. Chaque table de données a une colonne `ecole_id TEXT NOT NULL DEFAULT ''`
2. Chaque requête (SELECT/INSERT/UPDATE/DELETE) inclut `ecole_id = ?`
3. `ecole_id` provient de `deps.getCurrentEcoleId()` dans les handlers, jamais du client
4. Les contraintes UNIQUE incluent `ecole_id` (ex: `UNIQUE(ecole_id, nom_utilisateur)`)
5. Tables isolées : `utilisateurs`, `professeurs`, `classes`, `eleves`, `notes`, `absences`,
   `parents`, `sanctions`, `imports`, `audit_log`, `heures_absence`, `frais_types`,
   `tranches`, `paiements`

### 15.3 Où le directeur trouve le code école
1. Paramètres > Général — bloc « Code établissement » avec bouton Copier
2. Création d'un compte enseignant — encadré sous le mot de passe généré
3. Détail du compte enseignant — section « Compte PWA »
4. Fiche d'accès PDF imprimée — ligne « Code ecole »

L'enseignant saisit ce code une seule fois à sa première connexion PWA.

### 15.4 Tests d'isolation
Couverts par `tests/integration/isolation.test.js` — à maintenir à jour pour toute nouvelle
table isolée.

---

## 16. COMPTES ENSEIGNANTS PWA (section Professeurs)

- Backend `handlers/professeurs.js` : createTeacherAccount, suspend/reactivate, resetPassword,
  getTeacherLoginHistory, printTeacherAccessCard (fiche PDF partagée `ficheAccesEnseignant.js`).
- Le mot de passe généré est affiché UNE SEULE fois (bloc d'avertissement jaune) ; il ne se
  modifie que via Réinitialiser. Minimum 6 caractères.
- Champs RH supprimés de l'UI et des imports (civilité, sexe, spécialité, diplôme, adresse,
  ville, date_embauche).
- Historique des connexions : table `pwa_login_history` (incluse dans backup/restauration).

---

## 17. HISTORIQUE DES MODIFICATIONS

| Date | Changement | Fichiers principaux |
|------|-----------|---------------------|
| Août 2026 | **CLUF refonte KarisDev** — 15 articles (indemnisation, non-remboursement, compétence exclusive tribunaux domicile éditeur, données mineurs/sauvegardes/cloud, loi 2000/011-OAPI-Berne) ; UTF-8 avec BOM pour corriger les accents NSIS | `build-resources/license.txt` |
| Août 2026 | **Couleurs Tableau d'honneur indépendantes** — clés `th_couleur_primaire/th_couleur_secondaire` (repli bulletin), pickers + aperçu mini-diplôme dans Paramètres > Bulletin | `tableauHonneur.js`, `parametres.html`, `modules/bulletin.js`, locales fr/en |
| Août 2026 | **Fiche d'accès enseignant PDF refondue** — module partagé A5 (bandeau ELIMU, carte infos, encadrés code école/mot de passe, filigrane) utilisé par création de compte et impression manuelle | `pdf/ficheAccesEnseignant.js`, `handlers/professeurs.js` |
| Août 2026 | **Modale export élèves pilotée par mode** (liste vs pyramide), libellés dynamiques i18n | `sections/eleves/` |
| Août 2026 | **Activation licence par glisser-déposer** d'un bundle JSON `elimu-installation.json` (licence + config école, identité préservée) | `license-screen/*`, `handlers/license.js`, `preload.js` |
| Août 2026 | Onglets Paramètres/Import-Export flex-wrap ; auto-création année scolaire en cours + rattachement orphelins ; base démo réaliste `npm run demo:data` | divers |
| Juil.-Août 2026 | v1.8.0 : pyramide des âges PDF ; licence signée secret injecté au build ; somme directe bulletins + moyenne simple des agrégats (+ tests régression) ; champ Matricule élèves (schéma 122) ; CM1 passé en notation N2/APC (schéma 123) ; listes affichables paysage N1/N2/N3 ; filigrane logo bulletins ; `stats_eleves` poussée vers portail ; Cloud Recovery complet (backup/restauration incluant dépendances + re-sync ecole_id/année) ; better-sqlite3 11→12.11.1 ; Jest --forceExit CI | nombreux |
| 27 Juillet 2026 | Affichage code école dans l'UI Desktop (4 endroits) ; correction CSP + police corrompue, suppression des gestionnaires inline | `parametres/general`, `professeurs/*`, `preload.js`, `index.html`, styles |
| Juillet 2026 | Transformation Professeurs → Comptes Enseignants PWA (6 handlers, colonnes `utilisateur_id`/`derniere_connexion`, import auto-comptes, fiche accès) | `handlers/professeurs.js`, `professeurs/*`, `locales/*` |
| Juillet 2026 | Correction erreur fondamentale calcul N1/N2 (somme directe, échelle réelle, CHECK >= 0) sur toute la stack | `curriculum.js`, `schema.sql`, `db.js`, `eleves.js`, `seed_test_data.js`, PWA |

---

## 18. OUTILLAGE — MCP & MÉMOIRE (depuis 23 Août 2026)

- **MCP actifs (global `~/.config/opencode/opencode.jsonc`)** : `filesystem` (/home/karis/ELIMU), `memory` (`MEMORY_FILE_PATH=~/.local/share/mcp-memory/memory.json`), `sequential-thinking`, `fetch`, `sqlite` (elimu.db), `postgres` (Neon PWA), `github` (ghp_rcJZ...) — 7/20. 13 désactivés (`enabled:false`) : `gitlab`, `brave-search`, `google-drive`, `google-maps`, `youtube-transcript`, `slack`, `notion`, `sentry`, `stripe`, `playwright` (chromium 656 Mo installé, `--executable-path`), `puppeteer`, `docker`, `kubernetes` — à activer via `enabled:true` + token quand besoin.
- **Mémoire persistante** : graphe `~/.local/share/mcp-memory/memory.json` (4 entités : ELIMU_Ecosystem, Karis, ELIMU_Docs (11 docs résumés), ELIMU_Credentials (référence hors-git vers `github_credentials`)) — chargée via MCP `memory` (redémarrage requis après modif `opencode.jsonc`).
- **Skills globaux (20)** : `~/.config/opencode/skills/*/SKILL.md` — design-system, ui-review, security-audit, perf-audit, test-generator, pr-review, refactor-clean, spec-writer, changelog-generator, git-release, docs-generator, api-design, db-migration, i18n-translator, accessibility-audit, seo-optimizer, prompt-optimizer, code-explainer, dependency-scan, customize-opencode — invoqués via `skill({name})`.
- **Modèle par défaut** : `opencode/muse-spark-1.2-contributor-free` en `reasoningEffort=high` (medium écrasé) + variantes `rapide` (low) / `max` (xhigh) — config dans `provider.opencode.models`.

> Après toute modification de `opencode.jsonc` (MCP, modèle, skills), **redémarrer opencode**.

---

*Règle d'or : mettre à jour ce fichier après tout changement structurel significatif.*
