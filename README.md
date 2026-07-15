# 🏆 ELIMU — Application de Gestion Scolaire

> *"Elimu"* signifie **éducation** en swahili.
> Application desktop de gestion scolaire pour établissements en Afrique, inspirée des interfaces FIFA.

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue)
![Internationalization](https://img.shields.io/badge/i18n-FR%20%7C%20EN-orange)
![License](https://img.shields.io/badge/Licence-PROPRIÉTAIRE-red)

---

## 📋 Table des matières

- [Prérequis](#-prérequis)
- [Installation](#-installation-développement)
- [Build Production](#-build-production)
- [Architecture du Projet](#-architecture-du-projet)
- [Import Excel](#-format-du-fichier-excel-pour-import-notes)
- [Sécurité](#-sécurité)
- [Personnalisation](#-personnalisation)
- [Dépannage](#-dépannage)
- [Support](#-support)

---

## 📦 Prérequis

| Outil | Version minimale | Lien |
|-------|-----------------|------|
| Node.js | v20+ | [nodejs.org](https://nodejs.org) |
| npm | v8+ | *(inclus avec Node.js)* |
| OS | Windows 10/11 ou Ubuntu 20.04+ / Zorin OS 17+ | — |

---

## 🚀 Installation (Développement)

```bash
# 1. Cloner ou décompresser le projet
cd elimu

# 2. Installer les dépendances
npm install

# 3. Lancer l'application
npm start
```

---

## 📦 Build (Production)

Le processus de build est automatisé via **GitHub Actions**. Les exécuteurs sont séparés par plateforme pour garantir la compilation correcte des dépendances natives.

```bash
# Windows (.exe)
npm run build:win

# Linux (.AppImage + .deb)
npm run build:linux
```

---

## 📁 Architecture du Projet

Le projet suit une structure modulaire et sécurisée.

```
elimu/
├── .github/workflows/       # CI/CD (Builds séparés Win/Linux)
├── backups/                 # Sauvegardes automatiques (.db)
├── build-resources/         # Icônes, Licence (CLUF) et scripts
├── database/                # Base SQLite locale et schéma SQL
├── exports/                 # Dossiers pour les exports PDF/Excel
├── logs/                    # Journaux d'erreurs et d'activité
├── scripts/                 # Scripts utilitaires (génération de données)
├── src/
│   ├── main/                # Processus principal (Backend Electron)
│   │   ├── handlers/        # Logique métier (Finance, Sauvegarde, Eleves...)
│   │   ├── utils/           # Utilitaires Node.js
│   │   ├── main.js          # Entrée de l'application
│   │   └── preload.js       # Pont sécurisé (IPC API)
│   ├── renderer/            # Interface utilisateur (UI/UX)
│   │   ├── assets/          # CSS (Thèmes FIFA), Images, JS
│   │   ├── license-screen/  # Écran d'activation
│   │   ├── locales/         # i18n (FR, EN)
│   │   └── sections/        # Modules (Dashboard, Finance, Paramètres...)
│   │       └── parametres/  # Sous-modules (Audit, Sauvegarde, Annees...)
│   └── shared/              # Code partagé
│       ├── database/        # Wrappers SQLite & Schéma SQL
│       ├── security/        # Auth, Audit, Rate Limit
│       └── utils/           # Moteurs d'export & Helpers
├── tests/                   # Tests unitaires et d'intégration
├── tools/                   # Outils de diagnostic et maintenance
└── package.json             # Configuration & Dépendances
```

---

## 📊 Format du Fichier Excel pour Import Notes

Le fichier doit respecter la structure suivante :

| Nom | Prénom | Note |
|-----|--------|------|
| KAMGA | Pierre | 14.5 |
| MBOCK | Aurélie | 16 |

- ✅ La première ligne est l'**en-tête** (ignorée).
- ✅ Les notes sont sur **20** (points ou virgules acceptés).
- ✅ Les noms doivent correspondre aux élèves enregistrés.

---

## 🔒 Sécurité

- **Mots de passe** : Hashés avec **bcryptjs**.
- **Licence** : Système d'activation par Identifiant Machine (HWID) "CMOS-proof" et signature HMAC-SHA256.
- **Protection Juridique** : Couvert par un Contrat de Licence Utilisateur Final (CLUF) rigoureux.
- **Audit** : Journal d'activité complet (Audit Trail).
- **Isolation** : Electron sécurisé via `contextIsolation`.

---

## 🎨 Fonctionnalités Clés

- **Internationalisation** : Support complet Français / Anglais.
- **Bordereaux** : Génération de bordereaux de notes, absences et **émargement**.
- **Bulletins Multi-styles** :
  - **Officiel** : Classique et conforme aux normes.
  - **Moderne** : Design contemporain avec bords arrondis.
  - **Minimal** : Économie d'encre et sobriété.
- **Finance** : Gestion des tranches de paiement et reçus PDF.
- **Thèmes FIFA** : Plusieurs thèmes visuels (Sombre, Clair, Néon, Océan).

---

## 📞 Support

Développé par **M. Karis** — Projet Elimu 🌍 (2025-2026)
📧 Contact : [karisdev369@gmail.com](mailto:karisdev369@gmail.com)

<div align="center">
  <sub>Fait avec ❤️ pour l'éducation en Afrique</sub>
</div>
