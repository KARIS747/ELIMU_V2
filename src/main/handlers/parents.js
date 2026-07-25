/**
 * handlers/parents.js — Gestion des comptes parents et synchronisation portail
 */

const { getLocalTimestampForFile } = require('../../shared/utils/dateUtils');
const { run, get, all, getDatabase } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { genererFichesParentsPDF } = require('../../shared/utils/pdf/recuParents');
const { dialog } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');
const crypto = require('crypto');
const { CURRICULUM_TEMPLATES, getPeriodeForUA } = require('../../shared/constants/curriculum');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getMainWindow: function, getCurrentUserId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getMainWindow, getCurrentUserId, getCurrentEcoleId } = deps;

  /**
   * Hache un mot de passe en utilisant scrypt (format PHC) - Version Main Thread pour un seul parent
   */
  async function hashPasswordScrypt(password) {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16);
      crypto.scrypt(password, salt, 64, { N: 8192, r: 8, p: 1 }, (err, derivedKey) => {
        if (err) return reject(err);
        const saltB64 = salt.toString('base64').replace(/=/g, '');
        const hashB64 = derivedKey.toString('base64').replace(/=/g, '');
        resolve(`$scrypt$n=8192,r=8,p=1$${saltB64}$${hashB64}`);
      });
    });
  }

  /**
   * Construit un nom lisible pour le portail a partir d'un code sous-competence N1/N2.
   * Ex: "1A" -> "Communiquer en Français, Anglais et langue nationale — Communiquer en Français"
   */
  function _buildPortalNoteName(sousCode) {
    for (const lvl of ['N1', 'N2']) {
      const templ = CURRICULUM_TEMPLATES[lvl];
      if (!templ) continue;
      for (const compKey of Object.keys(templ.competences)) {
        const comp = templ.competences[compKey];
        if (comp.sousCompetences && comp.sousCompetences[sousCode]) {
          return comp.nom + ' — ' + comp.sousCompetences[sousCode].nom;
        }
      }
    }
    return null;
  }

  // ── Helper pour laisser respirer l'event loop ──────────────────────────────
  const yieldToMain = () => new Promise(resolve => setImmediate(resolve));

  const { hasRole } = require('../../shared/security/access');

  // Alphabet sécurisé (32 caractères, sans ambiguïté)
  const PASS_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PASS_LENGTH = 10;

  /**
   * Génère un mot de passe cryptographiquement sécurisé
   */
  const generateSecurePassword = (length = PASS_LENGTH) => {
    let pwd = '';
    for (let i = 0; i < length; i++) {
      pwd += PASS_CHARSET[crypto.randomInt(0, PASS_CHARSET.length)];
    }
    return pwd;
  };

  // Nettoyage de sécurité : vider les mots de passe en clair existants au démarrage (Option 2)
  try {
    const count = run('UPDATE parents SET mot_de_passe = NULL WHERE mot_de_passe IS NOT NULL');
    if (count > 0) logger.info(`Audit Sécurité : ${count} mots de passe en clair supprimés de la base de données.`);
  } catch (e) {
    logger.error('Erreur lors du nettoyage de sécurité des parents:', e);
  }

  // Helper pour vérifier l'accès
  const checkAccess = async (roles = ['admin', 'secretaire']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  // ── Export fiches parents par classe ────────────────────────────────────────

  ipcMain.handle('parents:exporterFiches', async (event, classeId, lang = 'fr') => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const rowsParam = all('SELECT valeur FROM parametres WHERE cle = ?', ['portail_url']);
      const printLink = rowsParam[0]?.valeur || '[Lien portail non configuré]';

      let query = `
        SELECT p.id, p.telephone, p.nom_parent,
               (SELECT JSON_GROUP_ARRAY(
                 JSON_OBJECT('id', e.id, 'nom', e.nom, 'prenom', e.prenom, 'classe_nom', c.nom_classe)
               )
               FROM parents_eleves pe
               JOIN eleves e ON pe.eleve_id = e.id
               JOIN classes c ON e.classe_id = c.id
               WHERE pe.parent_id = p.id) as eleves_json
        FROM parents p
        WHERE p.ecole_id = ?
      `;
      let params = [ecoleId];
      const cid = parseInt(classeId);
      if (!isNaN(cid) && cid > 0) {
        query += ` AND p.id IN (SELECT parent_id FROM parents_eleves pe JOIN eleves e ON pe.eleve_id = e.id WHERE e.classe_id = ?)`;
        params.push(cid);
      }
      
      const rows = all(query, params);
      const parents = rows.map(r => ({ ...r, eleves: JSON.parse(r.eleves_json || '[]') }));

      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `fiches_parents_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (savePath.canceled) return { canceled: true };
      
      const win = getMainWindow();
      await genererFichesParentsPDF(parents, savePath.filePath, printLink, (current, total) => {
        if (win) {
          win.webContents.send('parents:export-progress', { current, total, percent: Math.round((current / total) * 100) });
        }
      }, lang);
      
      await logAudit(getCurrentUserId(), 'PARENTS_EXPORT_FICHES', `Export fiches parents classe ID ${classeId}`);
      return { success: true };
    } catch (error) {
      logger.error('Erreur parents:exporterFiches:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Liste des parents ──────────────────────────────────────────────────────

  ipcMain.handle('parents:getListe', async (event, { recherche = '', classeId = null, page = 1, limit = 20 }) => {
    if (!(await checkAccess())) return { error: 'Accès non autorisé' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      let whereClauses = ['p.ecole_id = ?'];
      let params = [ecoleId];

      if (recherche && recherche.trim()) {
        whereClauses.push(`(p.telephone LIKE ? OR p.nom_parent LIKE ? OR p.id IN (
          SELECT pe.parent_id 
          FROM parents_eleves pe 
          JOIN eleves e ON pe.eleve_id = e.id 
          WHERE e.nom LIKE ? OR e.prenom LIKE ?
        ))`);
        const term = `%${recherche.trim()}%`;
        params.push(term, term, term, term);
      }

      const cid = parseInt(classeId);
      if (!isNaN(cid) && cid > 0) {
        whereClauses.push(`p.id IN (
          SELECT pe.parent_id 
          FROM parents_eleves pe 
          JOIN eleves e ON pe.eleve_id = e.id 
          WHERE e.classe_id = ?
        )`);
        params.push(cid);
      }

      const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
      
      const countResult = get(`SELECT COUNT(*) as total FROM parents p ${whereSql}`, params);
      const total = countResult?.total || 0;

      const pNum = parseInt(page) || 1;
      const lNum = parseInt(limit) || 20;
      const offset = (pNum - 1) * lNum;
      
      let sql = `
        SELECT p.id, p.nom_parent, p.telephone, p.mot_de_passe,
               (SELECT JSON_GROUP_ARRAY(
                 JSON_OBJECT(
                   'id', e.id, 
                   'nom', e.nom, 
                   'prenom', e.prenom, 
                   'classe_nom', c.nom_classe
                 )
               )
               FROM parents_eleves pe
               JOIN eleves e ON pe.eleve_id = e.id
               JOIN classes c ON e.classe_id = c.id
               WHERE pe.parent_id = p.id) as eleves_json
        FROM parents p
        ${whereSql}
        ORDER BY p.date_creation DESC
        LIMIT ? OFFSET ?
      `;
      
      const rows = all(sql, [...params, lNum, offset]);
      return {
        parents: rows.map(r => ({ ...r, eleves: JSON.parse(r.eleves_json || '[]') })),
        total,
        page: pNum,
        limit: lNum
      };
    } catch (error) {
      logger.error('Erreur parents:getListe:', error);
      return { error: error.message };
    }
  });

  // ── Génération de mot de passe ─────────────────────────────────────────────

  ipcMain.handle('parents:genererMdp', async (event, parentId) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const id = parseInt(parentId);
      if (isNaN(id)) return { success: false, error: 'ID parent invalide' };
      
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const parent = get('SELECT telephone FROM parents WHERE id = ? AND ecole_id = ?', [id, ecoleId]);
      if (!parent) return { success: false, error: 'Parent non trouvé' };

      const rawPassword = generateSecurePassword();
      const hash = await hashPasswordScrypt(rawPassword);

      // SÉCURITÉ : On ne stocke plus le mot de passe en clair (Option 2)
      run('UPDATE parents SET mot_de_passe_hash = ?, mot_de_passe = NULL WHERE id = ?', [hash, id]);

      await logAudit(getCurrentUserId(), 'PARENTS_GEN_MDP', `Mot de passe RÉINITIALISÉ pour parent ID ${id}`);
      logger.info(`Accès régénéré pour le parent ID: ${id}`);
      
      // On retourne le mot de passe en clair UNIQUEMENT cette fois-ci pour affichage immédiat
      return { success: true, password: rawPassword, phone: parent.telephone };
    } catch (error) {
      logger.error('Erreur parents:genererMdp:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('parents:genererTousMdp', async (event) => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const parentsRaw = all('SELECT id, telephone, nom_parent FROM parents WHERE ecole_id = ?', [ecoleId]);
      const parents = JSON.parse(JSON.stringify(parentsRaw));
      const total = parents.length;
      logger.info(`🚀 Démarrage génération pour ${total} parents...`);
      if (total > 0) {
        logger.info(`📝 Premier parent à traiter : ID=${parents[0].id}, Tel=${parents[0].telephone}`);
      }
      if (total === 0) return { success: true, count: 0 };

      const win = getMainWindow();
      
      const results = [];
      for (let i = 0; i < total; i++) {
        const p = parents[i];
        const rawPassword = generateSecurePassword();
        const hash = await hashPasswordScrypt(rawPassword);
        
        results.push({
          id: p.id,
          hash,
          password: rawPassword,
          telephone: p.telephone,
          nom_parent: p.nom_parent
        });

        // Mise à jour de la progression tous les 20 parents pour plus de fluidité
        if ((i + 1) % 20 === 0 || (i + 1) === total) {
          if (win) {
            win.webContents.send('parents:generation-progress', {
              current: i + 1,
              total: total,
              percent: Math.round(((i + 1) / total) * 100)
            });
          }
          // Laisser respirer le thread principal
          await yieldToMain();
        }
      }

      const count = results.length;
      run('BEGIN TRANSACTION');
      try {
        for (const res of results) {
          // SÉCURITÉ : mot_de_passe = NULL (Option 2)
          run('UPDATE parents SET mot_de_passe_hash = ?, mot_de_passe = NULL WHERE id = ?', [res.hash, res.id]);
        }
        run('COMMIT');
      } catch (err) {
        run('ROLLBACK');
        throw err;
      }

      await logAudit(getCurrentUserId(), 'PARENTS_GEN_ALL_MDP', `${count} accès régénérés (Scrypt)`);
      logger.info(`${count} mots de passe régénérés avec succès.`);
      
      // OPTION 2 : Puisque les mots de passe ne sont pas stockés, on DOIT proposer l'export PDF immédiatement
      const savePath = await dialog.showSaveDialog(win, {
        title: 'Enregistrer les fiches d\'accès (INDISPENSABLE)',
        defaultPath: `fiches_acces_parents_complet_${getLocalTimestampForFile()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (!savePath.canceled) {
        const rowsParam = all('SELECT valeur FROM parametres WHERE cle = ?', ['portail_url']);
        const printLink = rowsParam[0]?.valeur || '[Lien portail non configuré]';
        
        // Préparer les données pour le PDF (incluant le mot de passe en clair qui est encore en mémoire)
        const pdfData = results.map(r => ({
          telephone: r.telephone,
          nom_parent: r.nom_parent,
          mot_de_passe_clair: r.password,
            eleves: all(`
              SELECT e.nom, e.prenom, c.nom_classe as classe_nom 
              FROM parents_eleves pe
              JOIN eleves e ON pe.eleve_id = e.id
              JOIN classes c ON e.classe_id = c.id
              WHERE pe.parent_id = ? AND e.ecole_id = ?
            `, [r.id, ecoleId])
        }));

        await genererFichesParentsPDF(pdfData, savePath.filePath, printLink, null, 'fr'); // Langue par défaut FR pour le bulk
        return { success: true, count, pdfGenerated: true };
      }

      return { success: true, count, pdfGenerated: false };
    } catch (error) {
      logger.error('Erreur parents:genererTousMdp:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Synchronisation Portail ────────────────────────────────────────────────

  ipcMain.handle('portal:testConnection', async (event, { url, apiKey }) => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!url || !apiKey) return { success: false, error: 'URL ou clé API manquante' };
      
      let baseUrl = url.trim().replace(/\/$/, '');
      if (baseUrl.endsWith('/api/sync')) {
        baseUrl = baseUrl.replace(/\/api\/sync$/, '');
      }
      
      const targetUrl = `${baseUrl}/api/sync/test`; // Endpoint de test dédié sur le portail
      
      logger.info(`🔍 Test de connexion vers ${targetUrl}...`);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'X-API-KEY': apiKey }
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, error: errorData.error || `Erreur serveur (${response.status})` };
      }
    } catch (error) {
      logger.error('Erreur portal:testConnection:', error);
      return { success: false, error: "Impossible de joindre le serveur. Vérifiez l'URL et votre connexion internet." };
    }
  });

  ipcMain.handle('portal:export', async (event, { url, apiKey }) => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!url || !apiKey) return { success: false, error: 'URL ou clé API manquante' };
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      
      let baseUrl = url.trim().replace(/\/$/, '');
      if (baseUrl.endsWith('/api/sync')) {
        baseUrl = baseUrl.replace(/\/api\/sync$/, '');
      }
      if (!/^https?:\/\//i.test(baseUrl)) {
        baseUrl = 'https://' + baseUrl;
      }
      
      const targetUrl = `${baseUrl}/api/sync`;
      
      const rows = all('SELECT cle, valeur FROM parametres');
      const ecoleInfo = {};
      rows.forEach(r => { ecoleInfo[r.cle] = r.valeur; });
      
      // 1. Collecte de la télémétrie (v1.4.0)
      const os = require('os');
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');

      let dbSize = 0;
      try {
        const dbPath = path.join(process.cwd(), 'database/elimu.db');
        const stats = fs.statSync(dbPath);
        dbSize = stats.size;
      } catch (e) {
        // En prod, la base peut être ailleurs
        try {
          const prodDbPath = path.join(app.getPath('userData'), 'database/elimu.db');
          dbSize = fs.statSync(prodDbPath).size;
        } catch(e2) {}
      }

      const telemetry = {
        platform: process.platform,
        arch: process.arch,
        total_mem: Math.round(os.totalmem() / (1024 * 1024)),
        free_mem: Math.round(os.freemem() / (1024 * 1024)),
        cpu: os.cpus()[0]?.model || 'Inconnu',
        db_size_kb: Math.round(dbSize / 1024),
        uptime_hr: Math.round(process.uptime() / 3600)
      };

      const payload = {
        version: app.getVersion(),
        telemetry: telemetry,
        ecole: {
          nom: ecoleInfo.nom_ecole || ecoleInfo.nom_etablissement,
          logo_base64: ecoleInfo.logo_bulletin, 
          config: { theme: 'dark' }
        },
        parents: all('SELECT telephone, mot_de_passe_hash, nom_parent FROM parents WHERE ecole_id = ?', [ecoleId]),
        ecole_id: ecoleId,
        liaisons: all(`
          SELECT p.telephone, e.id as eleve_external_id 
          FROM parents_eleves pe
          JOIN parents p ON pe.parent_id = p.id
          JOIN eleves e ON pe.eleve_id = e.id
          WHERE p.ecole_id = ? AND e.ecole_id = ?
        `, [ecoleId, ecoleId]),
        eleves: all(`
          SELECT e.id, e.nom, e.prenom, c.nom_classe as classe_nom 
          FROM eleves e
          LEFT JOIN classes c ON e.classe_id = c.id
          WHERE e.ecole_id = ?
        `, [ecoleId]),
        classes: all('SELECT id, nom_classe, niveau FROM classes WHERE ecole_id = ?', [ecoleId]),
        notes: (() => {
          const rawNotes = all(`
            SELECT n.*, m.nom_matiere as matiere_nom 
            FROM notes n
            LEFT JOIN matieres m ON n.matiere_id = m.id
            WHERE n.ecole_id = ?
          `, [ecoleId]);
          return rawNotes.map(n => {
            // N3 classique: garder tel quel
            if (n.matiere_id != null) {
              return { eleve_id: n.eleve_id, matiere_nom: n.matiere_nom || '', note: n.note, periode: n.periode || '', sequence: n.sequence || 1 };
            }
            // N1/N2: envoyer toutes les lignes (agrégats + sous-notes)
            if (n.sous_competence_code) {
              const compName = _buildPortalNoteName(n.sous_competence_code);
              const periode = getPeriodeForUA(n.ua);
              return {
                eleve_id: n.eleve_id,
                matiere_nom: compName || 'Competence ' + n.sous_competence_code,
                note: n.note,
                periode: periode || n.periode || '',
                sequence: 1,
                sous_competence_code: n.sous_competence_code,
                ua: n.ua || '',
                type_eval: n.type_eval || null
              };
            }
            return null;
          }).filter(Boolean);
        })(),
        absences: all(`
          SELECT eleve_id, periode, heures 
          FROM heures_absence WHERE ecole_id = ?
        `, [ecoleId]),
        paiements: all(`
          SELECT eleve_id, montant, date, 'payé' as statut, recu_numero, COALESCE(notes, 'Paiement scolarité') as libelle
          FROM paiements WHERE ecole_id = ?
          UNION ALL
          SELECT t.eleve_id, t.montant, t.date_echeance as date, 'non payé' as statut, NULL as recu_numero, ft.nom as libelle
          FROM tranches t
          JOIN frais_types ft ON t.frais_type_id = ft.id
          WHERE t.statut != 'paye' AND t.ecole_id = ?
        `, [ecoleId, ecoleId]),
        backup: {
          annees_scolaires: all('SELECT * FROM annees_scolaires'),
          classes: all('SELECT * FROM classes'),
          matieres: all('SELECT * FROM matieres'),
          professeurs: all('SELECT * FROM professeurs WHERE ecole_id = ?', [ecoleId]),
          utilisateurs: all('SELECT * FROM utilisateurs WHERE ecole_id = ?', [ecoleId]),
          parametres: all('SELECT * FROM parametres'),
          bulletin_config: all('SELECT * FROM bulletin_config'),
          frais_types: all('SELECT * FROM frais_types WHERE ecole_id = ?', [ecoleId]),
          tranches: all('SELECT * FROM tranches WHERE ecole_id = ?', [ecoleId]),
          paiement_tranches: all('SELECT * FROM paiement_tranches WHERE ecole_id = ?', [ecoleId]),
          sanctions: all('SELECT * FROM sanctions WHERE ecole_id = ?', [ecoleId]),
          imports: all('SELECT * FROM imports WHERE ecole_id = ?', [ecoleId])
          // Les notes, élèves, parents et paiements sont déjà dans le payload principal
        },
        timestamp: getLocalTimestampForFile()
      };

      const zlib = require('zlib');
      const util = require('util');
      const gzip = util.promisify(zlib.gzip);
      const compressedBody = await gzip(Buffer.from(JSON.stringify(payload)));

      const response = await fetch(`${targetUrl}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'gzip',
          'X-API-KEY': apiKey 
        },
        body: compressedBody
      });

      if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status})`);
      }

      const syncParams = {
        'derniere_synchro_portail': payload.timestamp,
        'portail_url': url,
        'portail_api_key': apiKey
      };

      for (const [cle, valeur] of Object.entries(syncParams)) {
        run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', [cle, String(valeur)]);
      }

      await logAudit(getCurrentUserId(), 'PORTAL_EXPORT', `Exportation réussie vers ${url}`);
      return { success: true, timestamp: payload.timestamp };
    } catch (error) {
      logger.error('Erreur portal:export:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('portal:restore', async (event, { url, apiKey }) => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!url || !apiKey) return { success: false, error: 'URL ou clé API manquante' };
      
      event.sender.send('export-progress', { type: 'portalRestore', step: 'downloading', message: 'Téléchargement des données depuis le cloud...', percent: 20 });

      let baseUrl = url.trim().replace(/\/$/, '');
      if (baseUrl.endsWith('/api/sync/restore')) {
        baseUrl = baseUrl.replace(/\/api\/sync\/restore$/, '');
      } else if (baseUrl.endsWith('/api/sync')) {
        baseUrl = baseUrl.replace(/\/api\/sync$/, '');
      }
      
      const targetUrl = `${baseUrl}/api/sync/restore`;
      logger.info(`🔄 Tentative de restauration depuis ${targetUrl}...`);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'X-API-KEY': apiKey }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur serveur (${response.status})`);
      }

      const { backup } = await response.json();
      if (!backup) throw new Error('Le backup récupéré est vide.');

      event.sender.send('export-progress', { type: 'portalRestore', step: 'processing', message: 'Analyse et préparation de la restauration...', percent: 40 });

      // --- PROCESSUS DE RESTAURATION CRITIQUE ---
      const db = getDatabase();
      
      try {
        // 1. Désactiver les contraintes AVANT la transaction
        db.exec('PRAGMA foreign_keys = OFF');

        db.transaction(() => {
          // 2. Liste des tables à vider (ordre inverse des dépendances)
          const tables = [
            'paiement_tranches', 'paiements', 'tranches', 'frais_types',
            'notes', 'absences', 'sanctions', 'heures_absence', 'imports',
            'parents_eleves', 'parents', 'eleves', 'classes', 'professeurs',
            'matieres', 'bulletin_config', 'annees_scolaires', 'utilisateurs'
          ];

          let tableIndex = 0;
          for (const table of tables) {
            tableIndex++;
            const progress = 40 + Math.round((tableIndex / tables.length) * 50);
            event.sender.send('export-progress', { type: 'portalRestore', step: 'restoring', message: `Restauration de la table : ${table}...`, percent: progress });

            if (backup[table]) {
              db.prepare(`DELETE FROM ${table}`).run();
              
              if (backup[table].length > 0) {
                const columns = Object.keys(backup[table][0]);
                const placeholders = columns.map(() => '?').join(',');
                const insertStmt = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
                
                for (const row of backup[table]) {
                  const values = columns.map(col => {
                     if (typeof row[col] === 'object' && row[col] !== null) {
                       return JSON.stringify(row[col]);
                     }
                     return row[col];
                  });
                  insertStmt.run(...values);
                }
              }
            }
          }

          event.sender.send('export-progress', { type: 'portalRestore', step: 'finalizing', message: 'Finalisation de la base de données...', percent: 95 });

          // 3. Restaurer les paramètres (en gardant les clés actuelles)
          if (backup.parametres) {
            const skipKeys = ['portail_url', 'portail_api_key', 'derniere_synchro_portail'];
            const insertParam = db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)');
            
            for (const p of backup.parametres) {
              if (!skipKeys.includes(p.cle)) {
                insertParam.run(p.cle, p.valeur);
              }
            }
          }
        })();
      } finally {
        // 4. Réactiver les contraintes APRÈS la transaction
        db.exec('PRAGMA foreign_keys = ON');
      }

      event.sender.send('export-progress', { type: 'portalRestore', step: 'completed', message: 'Restauration terminée avec succès !', percent: 100 });

      await logAudit(getCurrentUserId(), 'PORTAL_RESTORE', `Restauration réussie depuis ${url}`);
      return { success: true };
    } catch (error) {
      logger.error('Erreur portal:restore:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Impression fiche parent ────────────────────────────────────────────────

  ipcMain.handle('parents:imprimerFiche', async (event, parentId, lang = 'fr', passwordOverride = null) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const id = parseInt(parentId);
      if (isNaN(id)) return { success: false, error: 'ID parent invalide' };
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';

      const rowsParam = all('SELECT valeur FROM parametres WHERE cle = ?', ['portail_url']);
      const printLink = rowsParam[0]?.valeur || '[Lien portail non configuré]';

      const parentRow = get(`
        SELECT p.id, p.telephone, p.nom_parent, p.mot_de_passe as mot_de_passe_clair,
               (SELECT JSON_GROUP_ARRAY(
                 JSON_OBJECT('id', e.id, 'nom', e.nom, 'prenom', e.prenom, 'classe_nom', c.nom_classe)
               )
               FROM parents_eleves pe
               JOIN eleves e ON pe.eleve_id = e.id
               JOIN classes c ON e.classe_id = c.id
               WHERE pe.parent_id = p.id) as eleves_json
        FROM parents p
        WHERE p.id = ? AND p.ecole_id = ?
      `, [id, ecoleId]);

      if (!parentRow) return { success: false, error: 'Parent non trouvé' };
      const parent = { 
        ...parentRow, 
        mot_de_passe_clair: passwordOverride || parentRow.mot_de_passe_clair,
        eleves: JSON.parse(parentRow.eleves_json || '[]') 
      };

      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `fiche_parent_${parent.telephone}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (savePath.canceled) return { canceled: true };

      await genererFichesParentsPDF([parent], savePath.filePath, printLink, null, lang);

      await logAudit(getCurrentUserId(), 'PARENT_PRINT_CARD', `Impression fiche parent ID ${id}`);
      return { success: true };
    } catch (error) {
      logger.error('Erreur parents:imprimerFiche:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
