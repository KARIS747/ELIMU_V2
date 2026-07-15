# 🚀 ÉLIMU V2 — État d'Avancement et Plan d'Implémentation

Ce document sert de mémoire technique pour la transition de la version 1 vers la version 2 d'ÉLIMU. Il consigne les décisions architecturales, les validations de l'existant et la roadmap immédiate.

---

## 🎯 Vision de la V2 (Écosystème Segmenté)
L'objectif est de séparer la **production des données** de la **gestion/validation**.
1. **Station de Pilotage (Desktop)** : Contrôle, Finance, Ingestion, Impression. (Rôle : Directeur).
2. **Station de Production (PWA)** : Saisie rapide des notes et absences. (Rôle : Enseignant).
3. **Station de Consultation (Portail)** : Lecture seule. (Rôle : Parent).

---

## ✅ État des Lieux : Le Niveau 3 (CM1/CM2)
**Validation technique :** L'infrastructure actuelle de la V1 supporte déjà nativement tout ce qui est nécessaire pour le Niveau 3.
- **Notation** : Quantitative /20.
ightarrow$ Trimestres.
- **Calculs** : Moyennes pondérées via coefficients (déjà gérées par les triggers SQL et la table `matieres`).
- **Matières** : Groupes de matières fixes (Français, Maths, Éveil, etc.).
- **Action** : **NE PAS MODIFIER** la logique du Niveau 3. L'objectif est de greffer le système N1/N2 sans casser l'existant.

---

## 📚 Spécifications du Nouveau Système (Niveaux 1 & 2)
Le système pour SIL, CP, CE1, CE2 est **Qualitatif** et basé sur les **Unités d'Apprentissage (UA)**.

### 1. Structure Temporelle
ightarrow$ 8 UA**.
- T1 : UA1, UA2, UA3 | T2 : UA4, UA5, UA6 | T3 : UA7, UA8.

### 2. Notation Qualitative
L'enseignant saisit une note /20, convertie automatiquement :
ightarrow$ **NA** (Non Acquis) | Mapping numérique : **5**
ightarrow$ **ECA** (En Cours d'Acquisition) | Mapping numérique : **12**
ightarrow$ **A** (Acquis) | Mapping numérique : **16**
ightarrow$ **A+** (Expert) | Mapping numérique : **19**

### 3. Barèmes (Total 320 pts)
- **Niveau 1 (SIL, CP)** : C1 (100), C2 (60), C3 (40), C4 (20), C5 (40), C6 (60).
- **Niveau 2 (CE1, CE2)** : C1 (80), C2 (80), C3 (40), C4 (20), C5 (40), C6 (60).

---

## 🛠️ Plan d'Action Immédiat (Phase 1) — ✅ COMPLÉTÉ

L'implémentation de la Phase 1 a été entièrement réalisée et validée :

### Pilier 1 : Migration du Schéma (Données) — ✅ TERMINÉ
- **Statut** : Complété avec succès.
- **Détail** : La table `notes` a été migrée via une transaction SQLite robuste et atomique dans `src/shared/database/db.js`. Elle est désormais hybride et supporte simultanément le Niveau 3 (Matière/Séquence requis) et les Niveaux 1 & 2 (Matière/Séquence optionnels, remplacés par les UA/Compétences/Type d'évaluation).
- **Champs ajoutés** : `ua` (TEXT), `sous_competence_code` (TEXT), `type_eval` (TEXT), `source` (TEXT DEFAULT 'DESKTOP').
- **Classes** : Ajout du champ `niveau_v2` (TEXT) à la table `classes` pour assigner et mémoriser le niveau technique (`N1`, `N2`, `N3`) dès sa création.

### Pilier 2 : Moteur du Curriculum (Logique) — ✅ TERMINÉ
- **Statut** : Complété avec succès.
- **Détail** : Fichier centralisé de constantes et de logique de curriculum national créé sous `src/shared/constants/curriculum.js`.
- **Fonctionnalités** :
  - `NOTE_MAPPING` : Échelle quantitative des cotes qualitatives (NA: 5, ECA: 12, A: 16, A+: 19).
  - `getNoteToCode(note)` : Conversion automatique des notes /20 vers les codes de cotes.
  - `CURRICULUM_TEMPLATES` : Templates stricts et barèmes de points par type d'évaluation (orale, écrite, pratique, savoir-être) pour `N1` (320 pts) et `N2` (320 pts), ainsi que la liste exhaustive des matières fixes pour le Niveau 3 (`N3`).

### Pilier 3 : Nettoyage "Pilotage" (UI/UX) — ✅ TERMINÉ
- **Statut** : Complété avec succès.
- **Détail** : L'interface Desktop a été épurée pour se recentrer exclusivement sur le Directeur/Pilote.
- **Actions réalisées** :
  - **Suppression de l'onglet Notes** : Le gros onglet "Notes" global a été supprimé de la barre latérale et de la navigation globale (objet `TOUTES_SECTIONS` dans `renderer.js`), éliminant la saisie directe de notes de masse sur PC.
  - **Consultation des notes** : Le Directeur consulte les résultats importés ou synchronisés de manière unifiée via la fiche individuelle de l'élève (Section *Élèves*).
  - **Presets de classes (Ergonomie)** : Intégration de boutons de sélection rapide (`SIL` à `CM2`) lors de la création d'une classe, pré-remplissant le nom et configurant automatiquement le niveau V2 en arrière-plan (avec flexibilité de personnalisation maintenue).
  - **Clarification des rôles (Paramètres)** : Ajout d'une bannière informative sous l'onglet *Utilisateurs* des Paramètres pour clarifier que les comptes "Enseignant" et "Secrétaire" servent désormais pour l'utilisation de la PWA mobile et du Portail Parents.

---
*Dernière mise à jour : 3 Juillet 2026*
