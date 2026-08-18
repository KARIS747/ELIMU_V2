/**
 * smoke-test.js — Vérifie que les sources obfusquées restent valides avant
 * l'empaquetage electron-builder. À lancer APRÈS scripts/obfuscate.js.
 *
 * Contrôles :
 *  1. node --check (parsing) sur chaque fichier .js de src/
 *  2. Les dépendances de package.json sont résolvables
 *  3. Chargement réel des modules critiques pur Node (pas d'Electron requis)
 *
 * Sortie : code 0 si tout est valide, 1 sinon (bloque la release).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));

let failures = 0;

function walk(dir, cb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, cb);
    else if (entry.isFile()) cb(fullPath);
  }
}

// 1. Parsing de chaque fichier .js (syntaxe valide après obfuscation)
const jsFiles = [];
walk(SRC_DIR, (filePath) => {
  if (filePath.endsWith('.js')) jsFiles.push(filePath);
});

for (const filePath of jsFiles) {
  const res = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`[smoke] SYNTAXE ERRONÉE: ${path.relative(ROOT, filePath)}`);
    console.error(res.stderr || res.stdout);
    failures++;
  }
}
console.log(`[smoke] Parsing OK : ${jsFiles.length} fichier(s) .js`);

// 2. Dépendances du package résolvables
for (const dep of Object.keys(pkg.dependencies || {})) {
  try {
    require.resolve(dep, { paths: [ROOT] });
  } catch (err) {
    console.error(`[smoke] Dépendance irrésolvable : ${dep}`);
    failures++;
  }
}
console.log('[smoke] Dépendances OK');

// 3. Chargement réel des modules critiques (pur Node, sans './electron')
const critical = [
  'src/shared/license.js',
  'src/shared/license.secret.js',
  'src/shared/constants/curriculum.js',
  'src/shared/utils/dateUtils.js',
];
for (const rel of critical) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue; // p.ex. license.secret.js absent en test
  try {
    require(abs);
  } catch (err) {
    console.error(`[smoke] CHARGEMENT ÉCHOUÉ: ${rel}`);
    console.error(err.message);
    failures++;
  }
}
console.log('[smoke] Modules critiques OK');

if (failures > 0) {
  console.error(`[smoke] ${failures} problème(s) détecté(s) — release bloquée.`);
  process.exit(1);
}

console.log('[smoke] OK — prêt pour electron-builder.');