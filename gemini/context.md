# 🎯 ÉLIMU V2 — CONTEXTE ACTUEL (ÉTAT DES LIEUX)

Ce fichier définit l'état actuel du projet, orienté exclusivement vers la **Vision V2**. Tout ce qui concerne la V1 est archivé dans `elimu/gemini/ARCHIVE_V1_HISTORY.md`.

---

## 🚀 VISION V2 : L'ÉCOSYSTÈME SEGMENTÉ

L'objectif est de séparer la **production** de la **gestion**.

1.  **Station de Pilotage (Desktop - Directeur)** : Contrôle, gestion admin/financière, et **Ingestion** (via Cloud ou Excel "signés"). *Le Directeur ne saisit plus de notes.*
2.  **Station de Production (PWA - Enseignants)** : Saisie mobile rapide (Notes/Absences) avec mode **Hors-ligne** (IndexedDB).
3.  **Station de Consultation (Portail Web - Parents)** : Lecture seule des résultats et suivi financier.

---

## 🛠️ ROADMAP ACTUELLE : PHASE 1 (FONDATION & DONNÉES)

L'objectif de la phase actuelle est de préparer le terrain technique pour supporter le nouveau système de notation et la segmentation.

### 📋 Tâches en cours / À venir :
- [ ] **Schéma Hybride (Base de données) :** Migration pour supporter simultanément le système de **Compétences/UA** (Niveaux 1&2) et le système **Classique /20** (Niveau 3) dans une structure `notes` optimisée.
- [ ] **Curriculum National (Code) :** Implémentation des constantes de compétences et UA directement dans le code source.
- [ ] **Nettoyage Desktop (UI) :** Suppression des interfaces de saisie et des rôles "Enseignant/Secrétaire" sur l'application Desktop pour renforcer le rôle de "Pilote".

---

## 🔒 RÈGLES DE DÉVELOPPEMENT V2 (PRIORITÉS)

- **Hybride par design :** Tout nouveau champ de données doit anticiper le support du mode hors-ligne (PWA) et de la synchronisation (Cloud).
- **Performance :** Utilisation systématique des Triggers SQL pour les calculs (moyennes, stats) afin de minimiser la charge côté client.
- **Sécurité :** Maintien des standards de la V1 (Scrypt, Paramètres SQL, XSS protection).
- **Zéro Saisie Desktop :** Toute modification de données sensibles (notes) doit être pensée pour provenir d'une source externe (PWA ou Ingestion Excel).

---
*Dernière mise à jour : 1er Juillet 2026*
