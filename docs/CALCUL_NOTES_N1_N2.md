# Calcul des notes N1/N2 — Curriculum MINEDUB

## Principes généraux

- Les sous-notes (orale, écrite, pratique, savoir-être) sont **stockées sur /20** dans la base (`note REAL CHECK(note >= 0 AND note <= 20)`)
- Les **poids** (max curriculum) définissent le barème réel de chaque sous-type par sous-compétence
- L'affichage convertit la note /20 en échelle réelle pour montrer `noteRéele / max`
- L'agrégat d'une sous-compétence est une **moyenne pondérée** : `sum(note × poids) / sum(poids)`

---

## 1. Stockage en base

Table `notes`, colonnes clés pour N1/N2 :

| colonne | valeur | exemple |
|---------|--------|---------|
| `note` | note sur /20 | `14.0` |
| `sous_type` | `'orale'`, `'ecrite'`, `'pratique'`, `'savoirEtre'` | `'ecrite'` |
| `sous_competence_code` | code MINEDUB | `'1A'` |
| `ua` | unité d'apprentissage | `'UA1'` |
| `periode` | trimestre | `'Trimestre 1'` |
| `sous_type = NULL` | note agrégée (calculée) | — |

---

## 2. Poids MINEDUB (max curriculum)

Source unique : `src/shared/constants/curriculum.js` → `CURRICULUM_TEMPLATES`

Exemple N1 – 1A (Communiquer en Français, total: 40) :

| sous-type | poids (max) |
|-----------|-------------|
| orale | 20 |
| ecrite | 15 |
| pratique | 0 |
| savoirEtre | 5 |

Exemple N2 – 2A (Mathématiques, total: 40) :

| sous-type | poids (max) |
|-----------|-------------|
| orale | 8 |
| ecrite | 28 |
| pratique | 0 |
| savoirEtre | 4 |

> Les poids N2 peuvent dépasser 20 (ex: ecrite=28). La note stockée reste sur /20 ; le poids sert uniquement au calcul pondéré et à l'affichage en échelle réelle.

---

## 3. Affichage d'une sous-note

Dans `eleves.js` (profil élève) :

```javascript
const noteReelle = (noteStockee / 20) * maxPts;
// Affiche : "12.5 / 15"
```

**Exemple :** note stockée = `15.2`, max ecrite 1A N2 = `15`
```
noteReelle = (15.2 / 20) × 15 = 11.4
→ Affiche "11.4 / 15"
```

Le code qualitatif (NA/ECA/A/A+) est déterminé depuis la **note /20** (pas l'échelle réelle) :

| note /20 | code |
|----------|------|
| 0–10 | NA |
| 11–14 | ECA |
| 15–17 | A |
| 18–20 | A+ |

---

## 4. Agrégat d'une sous-compétence

Fonction : `calcAggregateFromSubNotes` dans `curriculum.js`

```javascript
function calcAggregateFromSubNotes(subNotes, weights) {
  let total = 0, totalPoids = 0;
  for (const type of ['orale','ecrite','pratique','savoirEtre']) {
    const val = subNotes[type];  // note /20
    const p = weights[type];
    if (val != null && p > 0) {
      total += val * p;
      totalPoids += p;
    }
  }
  return totalPoids > 0 ? total / totalPoids : null;
}
```

### Exemple N1 – 1A

| sous-type | note /20 | × poids | = |
|-----------|----------|---------|---|
| orale | 14.0 | × 20 | 280.0 |
| ecrite | 12.0 | × 15 | 180.0 |
| savoirEtre | 4.0 | × 5 | 20.0 |
| **Total** | | **40** | **480.0** |

```
Agrégat = 480 / 40 = 12.0 /20 → ECA
```

### Exemple N2 – 2A

| sous-type | note /20 | × poids | = |
|-----------|----------|---------|---|
| ecrite | 18.3 | × 28 | 512.4 |
| orale | 8.6 | × 8 | 68.8 |
| **Total** | | **36** | **581.2** |

```
Agrégat = 581.2 / 36 = 16.14 /20 → A
```

> `pratique=0` et `savoirEtre=4` absents (poids > 0 requis).

---

## 5. Moyenne générale N1/N2

Dans `eleves.js` (profil élève, calcul de la moyenne affichée en haut de la carte) :

1. **Si des notes agrégées existent** (`sous_type IS NULL`) : moyenne simple des agrégats
   ```javascript
   moy = aggNotes.reduce((s, n) => s + n.note, 0) / aggNotes.length;
   ```
2. **Sinon** : on regroupe les sous-notes par (UA, code), on calcule l'agrégat pondéré de chaque, puis moyenne des agrégats
   ```javascript
   const agg = calcAggregateFromSubNotes(subNotes, poids);
   // puis
   moy = sum(agg) / count(agg);
   ```

Le résultat est une note /20 convertie en code qualitatif pour l'affichage.

---

## 6. Exemple complet — Benoît Nkoulou, CE1-A, 1A

Trimestre 1, UA1 :

| sous-type | stocké /20 | poids | échelle réelle | qualitatif |
|-----------|-----------|-------|----------------|------------|
| ecrite | 18.3 | 15 | 13.7/15 | A |
| orale | 8.6 | 12 | 5.2/12 | NA |
| savoirEtre | 9.0 | 3 | 1.4/3 | NA |

```
Agrégat = (18.3×15 + 8.6×12 + 9.0×3) / (15+12+3)
        = (274.5 + 103.2 + 27.0) / 30
        = 404.7 / 30
        = 13.49 /20 → ECA
```

Affichage dans le profil :
```
1A ▼  [ECA]
  ecrite:     13.7 / 15    (A)
  orale:       5.2 / 12    (NA)
  savoirEtre:   1.4 / 3    (NA)
```

---

## 7. Fichiers sources

| fichier | rôle |
|---------|------|
| `src/shared/constants/curriculum.js` | Poids MINEDUB, `calcAggregateFromSubNotes`, `getWeightsForSousCompetence` |
| `src/renderer/sections/eleves/eleves.js` | Profil élève : affichage sous-notes + calcul moyenne générale |
| `src/main/handlers/eleves.js` | Handlers API (saveNotes, getNotes) |
| `seed_test_data.js` | Génération de données de test (utilise les mêmes formules) |
