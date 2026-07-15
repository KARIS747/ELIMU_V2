# Récapitulatif des modifications — Session du 16 Mai 2026

## 1. Module Import/Export (Absences)
- **Interface UI** : Ajout d'un sélecteur de trimestre dans l'onglet `Absences` pour cibler l'importation.
- **Backend Import** : Mise à jour de `importExcel.js` avec un algorithme flexible supportant :
  - `Nom | Prénom | Heures`
  - `Nom Prénom | Heures`
  - `Nom | Prénom | T1 | T2 | T3`
- **Backend Export** : Génération de modèles Excel simplifiés (3 colonnes) lorsque le trimestre est sélectionné.

## 2. Module Finance (Impayés)
- **Export PDF** : Création de `src/shared/utils/pdf/exportImpayes.js` intégrant l'en-tête administratif officiel.
- **Filtres Avancés** : Ajout des filtres `Type de frais` et `Numéro de tranche` dans l'interface et les requêtes SQL (backend).
- **Interface** : Réorganisation de la barre de filtres pour une meilleure lisibilité.

## 3. Maintenance Base de Données
- **Migration SQL** : Ajout sécurisé de `annee_scolaire_id` dans les tables `heures_absence`, `absences`, et `sanctions` via `db.js`.
- **Intégrité** : Mise à jour de la clé primaire de `heures_absence` pour inclure l'année scolaire et éviter les conflits de contraintes.

## 4. Divers
- Correction d'une erreur d'importation circulaire dans les utilitaires PDF.
- Mise à jour de `context.md` et `gemini/GEMINI.md`.

## Session du 11 Juin 2026 — Refonte Performance & Fluidité
... (garder le contenu existant) ...

## Session du 16 Juin 2026 — Reverse Sync & Cloud Recovery
- **Cloud Backup (Invisible)** : Modification du protocole d'export pour inclure un backup complet des tables de configuration (Professeurs, Paramètres, Frais, etc.).
- **Reverse Sync (Restaurer)** : Création du bouton "Restaurer depuis le cloud" permettant une reconstruction intégrale de la base SQLite locale.
- **Optimisation Turbo 2.0** :
    - Utilisation de **PostgreSQL UNNEST** pour des insertions massives ultra-rapides.
    - Parallélisation des requêtes de suppression et d'insertion sur le serveur Portal.
    - Compression Gzip asynchrone côté Desktop pour maintenir la fluidité de l'UI.
- **Fiabilité** : Mise en place du mécanisme `app:relaunch` pour assurer un redémarrage propre de l'application après restauration.
- **PostgreSQL** : Ajout d'index sur `ecole_id` pour accélérer les opérations multi-écoles.

## Session du 17 Juin 2026 — Section Parents (Aide & UX)
- **Interface UI** : Restructuration de l'onglet `Synchronisation` en mode grille (2 colonnes).
- **Aide Contextuelle** : Ajout d'une carte "💡 Comment ça fonctionne" expliquant le processus de synchronisation portail et de restauration cloud.
- **i18n** : Ajout des clés de traduction pour le tutoriel de synchronisation (FR/EN).
- **Sécurité** : Ajout d'un conseil de synchronisation régulière pour maintenir les parents informés.
- **Impression** : Support de `passwordOverride` dans l'API de preload pour l'impression des fiches parents.
- **Unification UI** : Utilisation de l'URL du portail comme lien d'impression unique (suppression du champ redondant).
- **Performance & Sécurité (Turbo-Scrypt)** : Migration massive du hachage de Bcrypt (bcryptjs) vers **Scrypt natif**.
    - Réduction drastique du temps de génération (5000 parents : ~30min -> <1min).
    - Optimisation pour CPU basse consommation (N=8192).
    - Traitement asynchrone avec libération du thread principal (`yieldToMain`) pour éviter les plantages.
- **Portail** : Mise à jour du système d'authentification pour supporter le format PHC Scrypt (hachage natif crypto) tout en restant compatible avec l'ancien format.
