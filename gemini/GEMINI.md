# Règles pour l'assistant Gemini CLI (projet Élimu)

Ce fichier définit la démarche à suivre et les contraintes à respecter lorsque tu modifies le code d'Élimu (Electron + better-sqlite3 + JS vanilla).

## 🧱 Principes généraux

1. **Ne jamais modifier le schéma de la base de données** (fichier `database/schema.sql`) sans fournir un script de migration séparé et explicite.
2. **Ne pas supprimer ou renommer des fichiers** sans demander confirmation explicite.
3. **Privilégier les modifications incrémentales** : une seule fonctionnalité ou correction par session.
4. **Optimisation System-Level** : Toujours utiliser les modèles de performance établis (Triggers SQL pour les calculs, DocumentFragments pour l'UI, etc.).

## 🔒 Sécurité (MAJ v1.0.4)

- **Toutes les requêtes SQL** doivent utiliser des paramètres (`?`, `$variable`). Interdiction de concaténer des chaînes.
- **Échapper toutes les variables** insérées dans `innerHTML` (utiliser la fonction `esc()` existante).
- **i18n Sécurisé** : `data-i18n-html` est restreint. Ne jamais l'utiliser pour injecter des données utilisateur dynamiques. Préférer `textContent` (`data-i18n`).
- **Vérifier les rôles** (`admin`, `enseignant`, `secretaire`, `comptable`) avant toute modification de données via les handlers IPC.
- **Session & Logout** : Utiliser impérativement `auth:logout` pour réinitialiser l'état du système lors de la déconnexion.
- **Hachage Haute Performance** : Utiliser exclusivement `crypto.scrypt` (natif) avec les paramètres `N: 8192, r: 8, p: 1` pour le hachage des mots de passe.
    - Format de stockage obligatoire : **PHC String** (`$scrypt$n=8192,r=8,p=1$salt$hash`).
    - Traitement asynchrone impératif avec `yieldToMain()` pour préserver la fluidité sur les processeurs lents.
- **Ne jamais stocker** de mot de passe en clair.

## 🔗 Unification des Services Portail
- Le lien de synchronisation (`portail_url`) fait foi pour tout service externe (Portail Parents, Impression des fiches). Ne pas créer de doublon de configuration.

## 📁 Fichiers sensibles à ne pas modifier sans précaution

- `src/main/main.js` (point d’entrée)
- `src/main/preload.js` (exposition API sécurisée)
- `src/shared/database/db.js` (wrapper SQL + Migrations)
- `src/renderer/assets/css/style.css` (Thèmes & Antialiasing)

## 🧪 Démarche de Performance (Nouveau)

1. **Calculs lourds** : Doivent être déportés dans la base de données via des **Triggers** ou des **Vues** pour garantir un accès O(1) dans l'UI.
2. **Rendu UI** : Utiliser systématiquement `DocumentFragment` et `requestAnimationFrame` pour les injections DOM massives (listes > 20 éléments).
3. **IPC Payload** : Sélectionner chirurgicalement les colonnes SQL (`SELECT id, nom...`) pour minimiser le coût de sérialisation JSON.

## 🌐 Internationalisation (i18n)

- Tous les textes visibles doivent utiliser `t('clé')` (renderer) ou `data-i18n` (HTML).
- Les nouvelles clés doivent être ajoutées à `locales/fr.js` et `en.js`.

## 🎨 Style et UI/UX (MAJ v1.0.4)

- **Offline First** : Toutes les ressources (polices, icônes) doivent être stockées localement (`assets/fonts/`). Aucun import externe.
- **Rendu Net** : Maintenir les réglages d'antialiasing (`-webkit-font-smoothing: antialiased`) pour la cohérence entre OS.
- **Thèmes** : Toujours utiliser les variables CSS natives.

## 📦 Gestion de la base de données

- **Migrations Idempotentes** : Utiliser `IF NOT EXISTS` et des blocs try/catch.
- **Indexing** : Utiliser `COLLATE NOCASE` pour toutes les colonnes de recherche textuelle.
- **Performance** : Vérifier que les nouvelles tables n'impactent pas les triggers de performance existants (`stats_eleves`).

## 📜 Historique des sessions majeures

### Juin 2026 (v1.0.6) - "Mise à jour Contrôle d'Accès"
- **Accès Secrétaire** : Extension des permissions pour le rôle `secretaire` (accès aux sections Notes et Parents).
- **Synchronisation** : Autorisation de la synchronisation portail et génération des accès parents pour le secrétariat.

### Juin 2026 (v1.0.4) - "Refonte Performance & Sécurité"
- **Performance** : Passage aux moyennes pré-calculées (Triggers SQL) et rendu 60 FPS.
- **Sécurité** : Audit complet, durcissement i18n, gestion de session sécurisée.
- **Offline** : Migration locale des polices Google Fonts.

### Mai 2026
- **Optimisation Absences** : Ajout sélecteur de trimestre et flexibilité import Excel.
- **Migration SQL** : Gestion multi-année sur les absences et sanctions.
