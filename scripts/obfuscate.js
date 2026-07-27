const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const EXCLUDE_DIRS = ['__mocks__'];
const EXCLUDE_FILES = ['babel.config.js'];

function walkDir(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(entry.name)) walkDir(fullPath, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

function obfuscateFile(filePath) {
  const ext = path.extname(filePath);
  if (ext !== '.js') return false;
  if (EXCLUDE_FILES.includes(path.basename(filePath))) return false;

  const relativePath = path.relative(SRC_DIR, filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.length < 30) return false;

  try {
    const obfuscated = JavaScriptObfuscator.obfuscate(source, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: false,
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: false,
      stringArray: true,
      stringArrayCallsTransform: false,
      stringArrayEncoding: ['none'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 1,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 2,
      stringArrayWrappersType: 'variable',
      stringArrayThreshold: 0.75,
      unicodeEscapeSequence: false
    });

    const obfuscatedCode = obfuscated.getObfuscatedCode();
    fs.writeFileSync(filePath, obfuscatedCode);
    console.log(`  obfusqué: ${relativePath}`);
    return true;
  } catch (err) {
    console.error(`  ERREUR: ${relativePath} — ${err.message}`);
    return false;
  }
}

function main() {
  console.log('Début de l\'obfuscation...');
  let count = 0;
  walkDir(SRC_DIR, (filePath) => {
    if (obfuscateFile(filePath)) count++;
  });
  console.log(`Terminé. ${count} fichier(s) obfusqué(s).`);
}

main();
