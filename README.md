# ÉLIMU V2 — Gestion Scolaire Desktop

Application de gestion scolaire pour les écoles primaires africaines (système MINEDUB Cameroun). Desktop de pilotage pour le directeur : gestion des comptes, finances, bulletins PDF, import/export Excel signé.

## Architecture

```
ELIMU_V2/             # Desktop — Electron (Directeur/Admin/Finance)
PWA/                  # Mobile — Saisie notes & absences (Enseignants)
portal/               # Web — Consultation (Parents) — ne pas modifier
```

## Prérequis

- Node.js v20+
- npm v8+

## Installation & Développement

```bash
npm install
npx electron .
```

## Structure

```
src/
├── main/                       Processus principal Electron
│   ├── main.js                 Point d'entrée Electron
│   ├── preload.js              Pont sécurisé IPC (contextBridge)
│   ├── updater.js              Mise à jour automatique
│   ├── handlers/               Handlers IPC (backend)
│   │   ├── auth.js, classes.js, eleves.js, finance.js
│   │   ├── professeurs.js, importExport.js, parents.js
│   │   ├── absences.js, parametres.js, matieres.js
│   │   ├── anneesScolaires.js, audit.js, licence.js
│   │   └── sauvegarde.js, checkAccess_mock.js
│   └── utils/                  Utilitaires main process
│       ├── financeUtils.js, integrity.js, testData.js
│
├── renderer/                   Interface utilisateur
│   ├── assets/js/renderer.js   Point d'entrée UI + navigation
│   ├── locales/                i18n (fr.js, en.js, index.js)
│   ├── license-screen/         Écran de licence
│   └── sections/               Modules fonctionnels
│       ├── classes/            Gestion des classes ★ modulaire
│       │   ├── classes.js      Point d'entrée (init + events)
│       │   ├── state.js        État partagé
│       │   ├── helpers.js      Fonctions pures
│       │   ├── liste.js        KPIs + grille + filtre
│       │   ├── config.js       Modale configuration matières/groupes
│       │   ├── form.js         Formulaire création/édition
│       │   ├── detail.js       Détail classe + suppression
│       │   └── templates.js    Templates de compétences
│       ├── finance/            Section finance ★ modulaire
│       │   ├── finance.js      Point d'entrée (init + events)
│       │   ├── state.js        État partagé
│       │   ├── helpers.js      Formatage, loader, utilitaires
│       │   ├── dashboard.js    KPIs, graphique, top impayés
│       │   ├── fraisTypes.js   CRUD types de frais
│       │   ├── tranches.js     Tranches, impayés, historique
│       │   └── paiement.js     Modale paiement + reçu PDF
│       ├── dashboard/          Tableau de bord
│       ├── eleves/             Profil élève & notes N1/N2/N3
│       ├── professeurs/        Comptes enseignants PWA
│       ├── import_export/      Import/Export Excel
│       ├── parametres/         Paramètres (modules : general, utilisateurs,
│       │                       absences, bulletin, seuils, sauvegarde,
│       │                       annees, audit, update)
│       └── parents/            Portail parents
│
└── shared/                     Code partagé (main + renderer)
    ├── constants/curriculum.js Templates MINEDUB N1/N2/N3
    ├── database/               SQLite (db.js, schema)
    ├── license.js              Gestion licence
    ├── security/               Contrôle d'accès, audit, auth
    └── utils/                  Utilitaires partagés
        ├── importExcel.js      Barrel (dispatche vers sous-modules)
        ├── import/             ★ Moteur d'import Excel modulaire
        │   ├── helpers.js      Logger, trouverEleve, validateMetadata
        │   ├── formatB.js      Import notes Format B (N1/N2)
        │   ├── classic.js      Import notes classique (N3)
        │   ├── listeEleves.js  Import liste d'élèves
        │   ├── listeProfesseurs.js  Import liste professeurs
        │   ├── absencesExcel.js     Import absences Excel
        │   └── pwaExport.js    Import export PWA (notes + absences)
        ├── excel/              Export Excel
        ├── dateUtils.js
        ├── financeUtils.js
        ├── modeleAbsences.js
        ├── parentSync.js
        └── phone.js
```

## Système de notation

| Niveau | Classes | Système |
|--------|---------|---------|
| N1 | SIL, CP | Compétences + UA (qualitatif NA/ECA/A/A+) |
| N2 | CE1, CE2, CM1 | Compétences + UA (qualitatif NA/ECA/A/A+) — CM1 en APC |
| N3 | CM2 | Classique /20 (quantitatif, 3 trimestres × 2 séquences) |

## Documentation

| Fichier | Contenu |
|---------|---------|
| `AGENTS.md` | Mémoire IA complète du projet |
| `ELIMU_CURRICULUM_N1_N2.md` | Curriculum officiel MINEDUB N1/N2 |
| `ELIMU_CURRICULUM_N3.md` | Curriculum officiel MINEDUB N3 |
| `ELIMU_V2_ARCHITECTURE.md` | Architecture détaillée, barèmes, flux |
| `docs/CALCUL_NOTES_N1_N2.md` | Formules de calcul N1/N2 |

## Licence

Propriétaire (CLUF) — M. Karis
