# Tableau d'honneur — Spécification fonctionnelle

> Feature : Export PDF « Tableau d'honneur » dans la section **Import / Export**.
> Statut : **✅ Implémenté** — voir le module `src/shared/utils/pdf/tableauHonneur.js` et l'onglet `data-tab="tableau-honneur"`.

---

## 1. Objectif

Permettre au directeur/administrateur de générer un **tableau d'honneur PDF officiel**
d'une classe, en appliquant des **critères de sélection flexibles** propres à chaque école :

- certaines écoles récompensent uniquement le **Top N** (ex. 5 premiers) ;
- d'autres uniquement les élèves ayant une **moyenne ≥ X** (ex. 12) ;
- d'autres exigent **les deux conditions** (rang ≤ N **ET** moyenne ≥ X) ;
- d'autres encore acceptent **l'une ou l'autre** (rang ≤ N **OU** moyenne ≥ X) ;
- le seuil X est paramétrable (12, 13, 14…).

## 2. Décisions validées

| Question | Décision |
|---|---|
| Étendue | **Par classe** (rang calculé dans la classe) |
| Période | **Par trimestre** (moyenne du trimestre sélectionné) |
| Critères | **Moteur flexible** (rang + moyenne + règle ET / OU / rang seul / moyenne seule) |
| Sortie | **PDF officiel** (en-tête établissement, export via boîte de dialogue) |

## 3. Interface utilisateur (nouvel onglet)

Nouvel onglet **« Tableau d'honneur »** dans `src/renderer/sections/import_export/import_export.html`
(`data-tab="tableau-honneur"`), à côté de « Listes affichables ».

### 3.1 Champs

| Champ | Type | Défaut |
|---|---|---|
| Classe | `select` (`#tableau-honneur-classe`) | — |
| Trimestre | `select` (`#tableau-honneur-periode`) | Trimestre 1 |
| Activer rang (Top N) | `checkbox` (`#th-use-rang`) | coché |
| Rang max N | `input number` (`#th-rang-n`) | 5 |
| Activer seuil de moyenne | `checkbox` (`#th-use-seuil`) | coché |
| Moyenne minimale X | `input number step="0.5"` (`#th-seuil-x`) | 12 |
| Règle de combinaison | `select` (`#th-regle`) | `et` |

### 3.2 Règles de combinaison (`#th-regle`)

- `rang` — **Uniquement le rang** : élèves classés dans les N premiers.
- `moyenne` — **Uniquement la moyenne** : élèves avec moyenne ≥ X.
- `et` — **Les deux (ET)** : rang ≤ N **ET** moyenne ≥ X.
- `ou` — **L'un ou l'autre (OU)** : rang ≤ N **OU** moyenne ≥ X.

### 3.3 Bouton / retour

- Bouton `#btn-export-tableau-honneur` → `Exporter le tableau d'honneur (PDF)`.
- Zone d'état `#tableau-honneur-status` pour success/erreur.

## 4. Calcul des moyennes (réutilisation)

Le calcul réutilise les fonctions existantes pour garantir l'**exactitude avec les bulletins** :

| Niveau | Fonction réutilisée | Résultat |
|---|---|---|
| N1 / N2 (qualitatif) | `computeClassStatsQualitatif(classeId, anneeId, lvl, lesUA)` — `src/shared/utils/pdf/bulletinTrimestre.js:252` | `sorted: [{id, moy}]` trié par moyenne /20 décroissante |
| N3 (classique) | Logique N3 de `prepareBulletinTrimestreData` — `src/shared/utils/pdf/bulletinTrimestre.js:92-221` | moyenne pondérée / matières pour le trimestre (séquences 1+2) |

- Mapping trimestre → UA : `getUAsForPeriode(periode)` (`src/shared/constants/curriculum.js`).
- En-tête officiel : `drawAdminHeader(doc, cfg, y)` + `loadConfig()` (`src/shared/utils/pdf/helpers.js`).

## 5. Fichiers

### 5.1 Nouveau

- **`src/shared/utils/pdf/tableauHonneur.js`**
  - `prepareTableauHonneur(classeId, periode, criteres, anneeId)`
    - renvoie `{ classe, trimestre, annee, eleves: [{id, nom, prenom, matricule, moyenne, rang}] }`
    - affectation du **rang = position dans le tri par moyenne décroissante**
    - application des critères (rang / moyenne / ET / OU)
  - `exportTableauHonneurPDF(docData, outputPath, lang = 'fr')`
    - PDF A4 portrait, en-tête officiel, titre **« TABLEAU D'HONNEUR »**,
      tableau `Rang | Nom & Prénom | Moyenne` (1er/2e/3e mis en avant)
  - `module.exports = { prepareTableauHonneur, exportTableauHonneurPDF }`

### 5.2 Modifiés

| Fichier | Changement |
|---|---|
| `src/renderer/sections/import_export/import_export.html` | Onglet + formulaire `#tab-tableau-honneur` |
| `src/renderer/sections/import_export/import_export.js` | Remplissage select classe (liste ~ligne 43) + handler bouton → `window.elimuAPI.exportTableauHonneur(classeId, options, userId, lang)` |
| `src/main/handlers/importExport.js` | `ipcMain.handle('export:tableauHonneur', ...)` : droits admin/secretaire/enseignant → `dialog.showSaveDialog` → `prepareTableauHonneur` → `exportTableauHonneurPDF` → `logAudit` |
| `src/main/preload.js` | `exportTableauHonneur: (classeId, options, utilisateurId, lang) => ipcRenderer.invoke('export:tableauHonneur', ...)` |
| `src/renderer/locales/fr.js` | Clés `ie.*` (onglet, labels, toasts) |
| `src/renderer/locales/en.js` | Clés `ie.*` (traduction anglaise) |
| `src/shared/utils/pdf/locales.js` | Clés PDF (Rang, Moyenne, Tableau d'honneur…) |

## 6. Flux d'export (IPC)

```
UI (import_export.js)
  └─ window.elimuAPI.exportTableauHonneur(classeId, {periode, criteres}, userId, lang)
       └─ ipcRenderer.invoke('export:tableauHonneur', ...)      [preload.js]
            └─ ipcMain.handle('export:tableauHonneur')           [importExport.js]
                 ├─ vérification accès (hasRole)
                 ├─ classe + niveau_v2 + anneeId
                 ├─ dialog.showSaveDialog (default: tableau_honneur_<classe>.pdf)
                 ├─ prepareTableauHonneur(classeId, periode, criteres, anneeId)
                 ├─ exportTableauHonneurPDF(docData, path, lang)
                 └─ logAudit(uid, 'EXPORT_TABLEAU_HONNEUR', ...)
```

## 7. Cas particuliers

- **Aucun élève retenu** → retour `{ success: false, error: 'Aucun élève ne remplit ces critères' }`
  avant d'ouvrir la boîte de dialogue, message clair dans l'UI.
- **Seuil flottant** : X accepte des demi-points (12, 12.5, 13, 14…).
- **Égalités** : deux moyennes identiques → même rang possible ? À trancher à l'implémentation
  (recommandé : rangs consécutifs simples, 1, 2, 3… sans égalité partagée).

## 8. Vérification

1. `node --check` sur tous les fichiers JS modifiés.
2. Test manuel (app `npx electron .`) :
   - classe N1/N2 avec notes sur le trimestre → tableau correct ;
   - classe N3 (CM2) avec notes séquences → moyenne pondérée correcte ;
   - tester les 4 règles + seuils 12 / 13 / 14 + Top 5 ;
   - vérifier l'en-tête officiel, le tri par rang, la moyenne /20 sur le PDF.