const { ipcMain } = require('electron');
const { generateHardwareId, getAllPossibleHardwareIds, verifyLicense, extractExpiryFromKey } = require('../../shared/license');
const { run, get } = require('../../shared/database/db');

/**
 * handlers/license.js - Handlers IPC pour la gestion des licences
 */

function register(logger) {
  
  // Obtenir le Hardware ID de la machine
  ipcMain.handle('license:getHardwareId', async () => {
    return generateHardwareId();
  });

  // Sauvegarder une nouvelle licence
  ipcMain.handle('license:save', async (event, { key }) => {
    try {
      const hwid = generateHardwareId();
      
      const now = new Date();
      const systemDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      
      // On vérifie d'abord la signature et le HWID
      const parts = key.split('-');
      if (parts.length < 4 || parts[0] !== 'ELIMU') return { success: false, error: 'invalid' };
      
      const expiry = parts[1];
      const keyHwid = parts.slice(2, parts.length - 1).join('-');
      
      // 1. Vérifier le HWID
      if (keyHwid !== 'UNIVERSAL' && keyHwid !== hwid) {
        const allPossible = getAllPossibleHardwareIds();
        if (!allPossible.includes(keyHwid)) {
          return { success: false, error: 'hwid' };
        }
      }

      // 2. Vérifier l'expiration
      if (systemDate > expiry) {
        return { success: false, error: 'expired' };
      }

      // 3. Vérifier la signature globale
      const isValid = verifyLicense(key, hwid, systemDate);
      if (!isValid) return { success: false, error: 'invalid' };

      const expiryDate = extractExpiryFromKey(key);
      const expiryStr = `${expiryDate.getFullYear()}-${String(expiryDate.getMonth() + 1).padStart(2, '0')}-${String(expiryDate.getDate()).padStart(2, '0')}`;

      // Stocker en base
      run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_key', key]);
      run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_expiry', expiryStr]);
      run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_last_usage', systemDate]);

      // Sauvegarder également dans un fichier externe
      try {
        const fs = require('fs');
        const path = require('path');
        const { app } = require('electron');
        const keyPath = path.join(app.getPath('userData'), 'license.key');
        fs.writeFileSync(keyPath, key, 'utf8');
      } catch (e) {
        logger.error(`Erreur sauvegarde fichier license.key: ${e.message}`);
      }

      logger.info(`Licence activée avec succès jusqu'au ${expiryStr}`);
      ipcMain.emit('license:activated');
      
      return { success: true, expiry: expiryStr };
    } catch (error) {
      logger.error(`Erreur lors de la sauvegarde de la licence: ${error.message}`);
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
