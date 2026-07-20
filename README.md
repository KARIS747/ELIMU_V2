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
├── main/           Processus principal Electron (handlers IPC, utils)
├── renderer/       Interface utilisateur (sections, assets, locales)
└── shared/         Code partagé (curriculum, database, security, utils)
```

## Système de notation

| Niveau | Classes | Système |
|--------|---------|---------|
| N1 | SIL, CP | Compétences + UA (qualitatif NA/ECA/A/A+) |
| N2 | CE1, CE2 | Compétences + UA (qualitatif NA/ECA/A/A+) |
| N3 | CM1, CM2 | Classique /20 (quantitatif, 3 trimestres × 2 séquences) |

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
