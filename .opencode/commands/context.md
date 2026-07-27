---
description: Charge tout le contexte du projet (config, AGENTS, schéma, curriculum, docs, github_credentials, mémoire)
---

Utilise `glob` pour lister tous les fichiers dans chaque dossier ci-dessous, puis lis-les tous en parallèle avec `read`.

1. **`opencode.json`** — configuration opencode
2. **`AGENTS.md`** — guide de référence du projet
3. **`src/shared/database/schema.sql`** — schéma complet de la base de données
4. **`src/shared/constants/curriculum.js`** — templates et formules de calcul MINEDUB
5. **`gemini/GEMINI.md`** — règles de codage pour l'IA
6. **`gemini/V2_IMPLEMENTATION_STATE.md`** — état d'avancement V2
7. **`../docs/`** — Lister tous les fichiers avec `glob pattern="*" path="../docs/"` puis tous les lire
8. **`../github_credentials`** — credentials GitHub et API
9. **`../memory/`** — Lister tous les fichiers avec `glob pattern="*" path="../memory/"` puis tous les lire

Une fois la lecture terminée, résume les points clés et dis que le contexte est chargé.
