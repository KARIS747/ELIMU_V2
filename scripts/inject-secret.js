/**
 * inject-secret.js — Injecte le secret de signature des licences dans
 * src/shared/license.secret.js au moment du build (CI ou local).
 *
 * Utilisation :
 *   ELIMU_LICENCE_SECRET="secret-correct-..." node scripts/inject-secret.js
 *
 * - Le fichier généré est gitignoré et n'est JAMAIS commité.
 * - Il doit être écrit AVANT l'obfuscation pour que le secret soit intégré
 *   au paquet final.
 * - Si la variable d'environnement est absente ou trop courte, le script
 *   échoue : un build sans secret n'aurait aucune sécurité de licence.
 */

const fs = require('fs');
const path = require('path');

const secret = process.env.ELIMU_LICENCE_SECRET;
if (!secret || secret.length < 32) {
  console.error(
    '[inject-secret] ELIMU_LICENCE_SECRET manquant ou trop court (< 32 caractères). ' +
      'Il DOIT être identique à la variable LICENSE_SECRET du portail (Licence Manager).' +
      'Abandon du build : un secret de signature est obligatoire.'
  );
  process.exit(1);
}

const outFile = path.join(__dirname, '..', 'src', 'shared', 'license.secret.js');
const content = `module.exports = ${JSON.stringify(secret)};\n`;
fs.writeFileSync(outFile, content, 'utf8');
console.log(`[inject-secret] Secret injecté dans ${path.relative(process.cwd(), outFile)}`);