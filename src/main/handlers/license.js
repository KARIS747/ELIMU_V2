const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { generateHardwareId, getAllPossibleHardwareIds, verifyLicense, extractExpiryFromKey } = require('../../shared/license');
const { run, get, getDatabase } = require('../../shared/database/db');

/**
 * handlers/license.js - Handlers IPC pour la gestion des licences
 */

// ============================================================
// BUNDLE D'INSTALLATION (elimu-installation.json)
// Whitelist stricte des clés du bundle → clés de la table parametres
// ============================================================
const BUNDLE_KEY_MAP = {
  licence_key: 'licence_key',
  ecole_id: 'ecole_id',
  code_ecole: 'code_ecole',
  nom_etablissement: 'nom_etablissement',
  abreviation_etab: 'abreviation_etab',
  adresse: 'adresse',
  telephone: 'telephone',
  email: 'email',
  portail_url: 'portail_url',
  portail_api_key: 'portail_api_key',
  pwa_sync_url: 'pwa_sync_url',
  pwa_api_initial_key: 'pwa_sync_api_key'
};

const IDENTITY_BUNDLE_KEYS = ['ecole_id', 'code_ecole'];

function systemDateCompact() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Valide une clé de licence (structure, HWID, expiration, signature).
 * Retourne { ok: true, expiryStr } ou { ok: false, error }.
 */
function validateNewLicenseKey(key, hwid, systemDate) {
  const parts = key.split('-');
  if (parts.length < 4 || parts[0] !== 'ELIMU') return { ok: false, error: 'invalid' };

  const expiry = parts[1];
  const keyHwid = parts.slice(2, parts.length - 1).join('-');

  if (keyHwid !== 'UNIVERSAL' && keyHwid !== hwid) {
    const allPossible = getAllPossibleHardwareIds();
    if (!allPossible.includes(keyHwid)) return { ok: false, error: 'hwid' };
  }

  if (systemDate > expiry) return { ok: false, error: 'expired' };

  if (!verifyLicense(key, hwid, systemDate)) return { ok: false, error: 'invalid' };

  const expiryDate = extractExpiryFromKey(key);
  const expiryStr = `${expiryDate.getFullYear()}-${String(expiryDate.getMonth() + 1).padStart(2, '0')}-${String(expiryDate.getDate()).padStart(2, '0')}`;
  return { ok: true, expiryStr };
}

function writeLicenseKeyFile(key, logger) {
  try {
    const { app } = require('electron');
    const keyPath = path.join(app.getPath('userData'), 'license.key');
    fs.writeFileSync(keyPath, key, 'utf8');
  } catch (e) {
    logger.error(`Erreur sauvegarde fichier license.key: ${e.message}`);
  }
}

function register(logger) {
  
  // Obtenir le Hardware ID de la machine
  ipcMain.handle('license:getHardwareId', async () => {
    return generateHardwareId();
  });

  // Sauvegarder une nouvelle licence
  ipcMain.handle('license:save', async (event, { key }) => {
    try {
      const hwid = generateHardwareId();
      const systemDate = systemDateCompact();

      const check = validateNewLicenseKey(key, hwid, systemDate);
      if (!check.ok) return { success: false, error: check.error };

      // Stocker en base
      run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_key', key]);
      run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_expiry', check.expiryStr]);
      run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_last_usage', systemDate]);

      // Sauvegarder également dans un fichier externe
      writeLicenseKeyFile(key, logger);

      logger.info(`Licence activée avec succès jusqu'au ${check.expiryStr}`);
      ipcMain.emit('license:activated');
      
      return { success: true, expiry: check.expiryStr };
    } catch (error) {
      logger.error(`Erreur lors de la sauvegarde de la licence: ${error.message}`);
      return { success: false, error: 'system' };
    }
  });

  // Importer un bundle d'installation complet (fichier JSON glissé-déposé)
  ipcMain.handle('license:importBundle', async (event, { filePath }) => {
    try {
      if (!filePath || typeof filePath !== 'string') return { success: false, error: 'file' };

      let raw;
      try {
        raw = fs.readFileSync(filePath, 'utf8');
      } catch {
        return { success: false, error: 'file' };
      }

      let bundle;
      try {
        bundle = JSON.parse(raw);
      } catch {
        return { success: false, error: 'file' };
      }

      if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return { success: false, error: 'format' };
      if (bundle.format !== 'elimu-install' || bundle.version !== 1) return { success: false, error: 'format' };

      const licenceKey = typeof bundle.licence_key === 'string' ? bundle.licence_key.trim() : '';
      if (!licenceKey) return { success: false, error: 'format' };

      const hwid = generateHardwareId();
      const systemDate = systemDateCompact();
      const check = validateNewLicenseKey(licenceKey, hwid, systemDate);
      if (!check.ok) return { success: false, error: check.error };

      // Protection identité : ecole_id/code_ecole ne sont écrasés que sur base vierge
      let hasData = false;
      try {
        const row = get('SELECT COUNT(*) AS c FROM eleves');
        hasData = (row?.c || 0) > 0;
      } catch { /* table absente : base vierge */ }

      const toWrite = [];
      const skipped = [];
      const warnings = [];

      for (const [bundleKey, paramKey] of Object.entries(BUNDLE_KEY_MAP)) {
        if (!(bundleKey in bundle)) continue;
        const val = bundle[bundleKey];
        if (val === null || val === undefined || val === '') continue;
        if (typeof val !== 'string') { warnings.push(`${bundleKey}: type invalide, ignoré`); continue; }
        const trimmed = val.trim();
        if (!trimmed) continue;
        if (trimmed.length > 1000) { warnings.push(`${bundleKey}: valeur trop longue, ignorée`); continue; }
        if (hasData && IDENTITY_BUNDLE_KEYS.includes(bundleKey)) {
          skipped.push(bundleKey);
          continue;
        }
        toWrite.push([paramKey, trimmed]);
      }

      // Écriture atomique de tous les paramètres
      const tx = getDatabase().transaction(() => {
        for (const [k, v] of toWrite) {
          run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', [k, v]);
        }
        run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_expiry', check.expiryStr]);
        run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_last_usage', systemDate]);
      });
      tx();

      writeLicenseKeyFile(licenceKey, logger);

      logger.info(`Bundle d'installation importé (${toWrite.length + 2} paramètres écrits), licence jusqu'au ${check.expiryStr}${skipped.length ? `, identité locale préservée (${skipped.join(', ')})` : ''}`);
      ipcMain.emit('license:activated');

      return {
        success: true,
        expiry: check.expiryStr,
        schoolName: typeof bundle.nom_etablissement === 'string' ? bundle.nom_etablissement.trim() : '',
        applied: [...toWrite.map(([k]) => k), 'licence_expiry', 'licence_last_usage'],
        skipped,
        warnings
      };
    } catch (error) {
      logger.error(`Erreur import bundle d'installation: ${error.message}`);
      return { success: false, error: 'system' };
    }
  });

  // Obtenir le statut actuel de la licence
  ipcMain.handle('license:getStatus', async () => {
    try {
      const hwid = generateHardwareId();
      
      if (process.env.NODE_ENV === 'development') {
        return { isValid: true, expiry: '2099-12-31', hwid, isDev: true };
      }

      const keyRow = get('SELECT valeur FROM parametres WHERE cle = ?', ['licence_key']);
      const expiryRow = get('SELECT valeur FROM parametres WHERE cle = ?', ['licence_expiry']);
      const lastUsageRow = get('SELECT valeur FROM parametres WHERE cle = ?', ['licence_last_usage']);

      if (!keyRow || !keyRow.valeur) {
        return { isValid: false, error: 'missing', hwid };
      }

      const now = new Date();
      const systemDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const lastUsage = lastUsageRow ? lastUsageRow.valeur : '00000000';
      const effectiveDate = systemDate < lastUsage ? lastUsage : systemDate;

      const key = keyRow.valeur;
      const isValid = verifyLicense(key, hwid, effectiveDate);
      const expiry = expiryRow ? expiryRow.valeur : null;

      let error = null;
      if (!isValid) {
        const parts = key.split('-');
        const expiryKey = parts[1];
        const keyHwid = parts.slice(2, parts.length - 1).join('-');
        
        if (keyHwid !== 'UNIVERSAL' && keyHwid !== hwid) {
          const allPossible = getAllPossibleHardwareIds();
          if (!allPossible.includes(keyHwid)) {
            error = 'hwid';
          } else {
            // Si le HWID est dans la liste mais que verifyLicense a échoué, 
            // c'est probablement la signature ou l'expiration (mais ici isValid est false)
            error = 'invalid';
          }
        }
        else if (effectiveDate > expiryKey) error = 'expired';
        else error = 'invalid';
      }

      // Si valide et date système OK, mettre à jour last_usage
      if (isValid && systemDate >= lastUsage) {
        run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_last_usage', systemDate]);
      }

      return { isValid, expiry, error, hwid, clockDrift: systemDate < lastUsage };
    } catch (error) {
      return { isValid: false, error: 'system', details: error.message, hwid: generateHardwareId() };
    }
  });
}

module.exports = { register };
