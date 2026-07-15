# ÉLIMU — Spécification Bulletin N1/N2 (SIL, CP, CE1, CE2)
> Fichier destiné à l'IA qui implémentera la génération PDF du bulletin.
> Lire entièrement avant de coder.

---

## 1. STRUCTURE GÉNÉRALE DE LA PAGE

Le bulletin doit **tenir en UNE SEULE PAGE A4**.
Marges : 8mm de chaque côté.

### Ordre des éléments (du haut vers le bas) :

```
1. Mini en-tête (1 ligne)
2. En-tête officiel (bilingue, 3 colonnes)
3. Ligne de séparation épaisse
4. Titre du bulletin + Année scolaire
5. Infos élève
6. Tableau principal des compétences
7. Légende NA/ECA/A/A+
8. Observations + Signatures
9. Fait à / Généré par Elimu
```

---

## 2. MINI EN-TÊTE (NOUVEAU — à ajouter en tout premier)

Une seule ligne simple au-dessus de l'en-tête officiel :

```
[Nom de l'établissement]  |  Niveau : [1 ou 2]  |  Classe : [ex: SIL-A]
```

- Aligné à gauche
- Police 8pt bold
- Séparé de l'en-tête officiel par une fine ligne horizontale

---

## 3. EN-TÊTE OFFICIEL (3 colonnes)

### Colonne gauche (aligné à gauche, 7pt) :
```
RÉPUBLIQUE DU CAMEROUN
Paix - Travail - Patrie
—
MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES
DÉLÉGATION RÉGIONALE DU ...
DÉLÉGATION DÉPARTEMENTALE DE ...
—
[NOM DE L'ÉTABLISSEMENT]
```

### Colonne centrale (aligné au centre, 13pt bold) :
```
[LOGO ou NOM
ÉTABLISSEMENT]
```

### Colonne droite (aligné à droite, 7pt) :
```
REPUBLIC OF CAMEROON
Peace - Work - Fatherland
—
MINISTRY OF SECONDARY EDUCATION
—
[NOM DE L'ÉTABLISSEMENT]
```

---

## 4. TITRE

```
BULLETIN DE NOTES — [Xème] TRIMESTRE  |  ANNÉE SCOLAIRE : [AAAA/AAAA]
```
- 10pt bold, centré
- Le trimestre est dynamique : 1er, 2ème ou 3ème

---

## 5. INFOS ÉLÈVE (tableau 4 colonnes)

| NOM ET PRÉNOM | NÉ(E) LE | CLASSE + NIVEAU | EFFECTIF + TITULAIRE |
|---------------|----------|-----------------|----------------------|
| [Valeur] | [Date] | [Classe] \| Niveau : [N1 ou N2] | Effectif : [X] \| Titulaire : [Nom] |

- Fond gris clair
- Bordures fines

---

## 6. TABLEAU PRINCIPAL DES COMPÉTENCES

### 6.1 Colonnes du tableau

| # | Nom colonne | Largeur | Description |
|---|-------------|---------|-------------|
| 1 | COMPÉTENCE | 28mm | Nom de la compétence majeure + total points |
| 2 | SOUS-COMPÉTENCE | 28mm | Code + nom + points (ex: 1A - Français (40 pts)) |
| 3 | ÉVALUATION | 20mm | Type d'évaluation + barème (ex: Orale /20) |
| 4 | UA_N Note | 9mm | Note brute saisie par enseignant pour cette UA |
| 5 | UA_N Cote | 9mm | Cote calculée auto : NA / ECA / A / A+ |
| ... | (répété pour chaque UA du trimestre) | | |
| N-2 | TOTAL | 10mm | Somme des notes sur toutes les UA du trimestre |
| N-1 | MOY./20 | 10mm | **NOUVEAU** — Moyenne ramenée sur 20 |
| N | COTE | 10mm | Cote finale de la sous-compétence pour ce trimestre |

### 6.2 UA affichées selon le trimestre

```
Trimestre 1 → UA1, UA2, UA3  (3 paires de colonnes Note+Cote)
Trimestre 2 → UA4, UA5, UA6  (3 paires de colonnes Note+Cote)
Trimestre 3 → UA7, UA8       (2 paires de colonnes Note+Cote)
```

### 6.3 Lignes du tableau

Pour chaque compétence majeure :
- Une ligne par type d'évaluation de chaque sous-compétence
- Une ligne TOTAL par sous-compétence (fond légèrement plus foncé)
- Une ligne TOTAL COMPÉTENCE (fond coloré, bold)

En bas du tableau :
```
TOTAL GÉNÉRAL /320 | | | ... | MOY. GÉNÉRALE /20 | COTE FINALE
```

### 6.4 Calculs automatiques

```javascript
// Cote par UA (par type d'évaluation)
function getCote(note) {
  if (note >= 0  && note <= 10) return 'NA';
  if (note >= 11 && note <= 14) return 'ECA';
  if (note >= 15 && note <= 17) return 'A';
  if (note >= 18 && note <= 20) return 'A+';
}

// Total sous-compétence (sur toutes les UA du trimestre)
totalSousComp = somme(notes_toutes_UA_par_type_eval)

// Moyenne sur 20 (sous-compétence)
moy20SousComp = (totalSousComp / maxPossible) * 20

// Total compétence
totalComp = somme(totalsSousCompetences)

// Moyenne générale sur 20
moyGenerale = (totalGeneral / 320) * 20

// Cote finale = basée sur moyGenerale ramenée sur 20
cotefinale = getCote(moyGenerale)
```

### 6.5 Couleurs par compétence

| Compétence | Couleur fond |
|------------|-------------|
| C1 | Bleu clair #DCE9FF |
| C2 | Vert clair #DCFFDC |
| C3 | Jaune clair #FFF8D0 |
| C4 | Rose clair #FFE0E0 |
| C5 | Violet clair #F0DFFF |
| C6 | Orange clair #FFEbD0 |
| TOTAL GÉNÉRAL | Bleu gris #C0D0F0 |
| En-tête tableau | Bleu marine #26337A (texte blanc) |

---

## 7. NOUVEAU — RANG ET MOYENNE

### À ajouter entre le tableau principal et la légende :

```
┌──────────────────────────────────────────────────────────────┐
│  MOYENNE GÉNÉRALE : [XX.XX] / 20   │   RANG : [X]ème / [N]  │
└──────────────────────────────────────────────────────────────┘
```

- Fond bleu marine, texte blanc, bold, 9pt
- Moyenne calculée automatiquement depuis le total général
- Rang saisi manuellement ou calculé par rapport à la classe

---

## 8. LÉGENDE COTATION

```
┌──────────────┬───────────────────────────────┬──────────────┬──────────────┐
│ NA = Non     │ ECA = En Cours d'Acquisition  │ A = Acquis   │ A+ = Expert  │
│ Acquis (0-10)│ (11-14)                       │ (15-17)      │ (18-20)      │
└──────────────┴───────────────────────────────┴──────────────┴──────────────┘
```

Couleurs :
- NA → fond rouge clair
- ECA → fond jaune clair
- A → fond vert clair
- A+ → fond bleu clair

---

## 9. OBSERVATIONS ET SIGNATURES

Tableau 4 colonnes, hauteur fixe 18mm :

| Observations de l'enseignant | Le Professeur Principal | Le Directeur | Le Parent |
|------------------------------|------------------------|--------------|-----------|
| (zone de texte libre) | (Signature) | (Signature et cachet) | (Signature) |

---

## 10. PIED DE PAGE

```
Fait à _____________, le _____________          Généré par Elimu — [DATE]
```
Aligné à droite, 6.5pt, gris.

---

## 11. DONNÉES DYNAMIQUES (variables à injecter)

```javascript
const bulletinData = {
  // Établissement
  nomEtablissement: "MON ÉTABLISSEMENT",
  devise: "Excellence et Rigueur",
  
  // Classe
  niveau: 1,          // 1 ou 2
  nomClasse: "SIL-A",
  trimestre: 1,       // 1, 2 ou 3
  anneeScolaire: "2025/2026",
  
  // Élève
  nomPrenom: "BELINGA MARGUERITE",
  dateNaissance: "08/06/2017",
  effectif: 25,
  rang: 9,
  titulaire: "M. DUPONT",
  
  // Notes (par sous-compétence, par UA, par type d'évaluation)
  notes: {
    "1A": {
      "UA1": { oral: 14, ecrit: 12, savoir_etre: 4 },
      "UA2": { oral: 16, ecrit: 13, savoir_etre: 5 },
      "UA3": { oral: 15, ecrit: 14, savoir_etre: 4 },
    },
    // ... autres sous-compétences
  },
  
  // Observations
  observations: "Résultats acceptables. Progrès possibles.",
}
```

---

## 12. NOTES D'IMPLÉMENTATION IMPORTANTES

1. **Le bulletin change selon le niveau :**
   - N1 (SIL/CP) → C1 = 100pts, C2 = 60pts
   - N2 (CE1/CE2) → C1 = 80pts, C2 = 80pts
   - Utiliser les fichiers `ELIMU_CURRICULUM_N1_N2.md` pour les détails exacts

2. **Le trimestre 3 n'a que UA7 et UA8** (2 colonnes au lieu de 3)

3. **La colonne MOY./20 est cruciale** — c'est ce que les parents comprennent

4. **Le rang** est affiché dans le bandeau de moyenne, pas dans le tableau

5. **Tout doit tenir en une page A4** — ajuster les tailles de police si nécessaire (minimum 6pt)

6. **Utiliser reportlab (Python)** pour la génération PDF — c'est le stack actuel d'ÉLIMU

---

*Spécification rédigée le 11/07/2026 — À lire avant toute implémentation du bulletin PDF*
