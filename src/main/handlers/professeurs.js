/**
 * handlers/professeurs.js — Gestion des comptes enseignants PWA
 * V2 : Transformé en gestionnaire de comptes (création, suspension, MDP)
 */

const bcrypt = require('bcryptjs');
const { run, get, all } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { dialog, app } = require('electron');
const crypto = require('crypto');

const BCRYPT_ROUNDS = 10;
const PASS_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASS_LENGTH = 6;

function generateSecurePassword() {
  let pwd = '';
  for (let i = 0; i < PASS_LENGTH; i++) {
    pwd += PASS_CHARSET[crypto.randomInt(0, PASS_CHARSET.length)];
  }
  return pwd;
}

function generateUsername(nom, prenom) {
  const base = (prenom || '')[0] + (nom || '').toLowerCase();
  const clean = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  let username = clean;
  let suffix = 1;
  while (get('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', [username])) {
    username = clean + suffix;
    suffix++;
  }
  return username;
}

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, getMainWindow: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getMainWindow, getCurrentAnneeId, getCurrentEcoleId } = deps;

  const checkAccess = async (roles = ['admin']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  // ── Liste paginée (avec infos du compte) ──────────────────────────────────

  ipcMain.handle('db:getProfesseurs', async (event, filtres = {}) => {
    if (!getCurrentUserId()) return { professeurs: [], total: 0 };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const { recherche = '', actifSeulement = false, page = 1, limit = 50 } = filtres;
      const params = [ecoleId];
      let where = 'WHERE p.ecole_id = ?';

      if (actifSeulement) {
        where += ' AND p.actif = 1';
      }
      if (recherche && recherche.trim()) {
        where += ' AND (p.nom LIKE ? OR p.prenom LIKE ? OR u.nom_utilisateur LIKE ?)';
        const q = '%' + recherche.trim() + '%';
        params.push(q, q, q);
      }

      const countRow = get(
        'SELECT COUNT(*) as total FROM professeurs p LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id ' + where,
        params
      );
      const total = countRow?.total || 0;

      const pNum = parseInt(page) || 1;
      const lNum = parseInt(limit) || 50;
      const offset = (pNum - 1) * lNum;

      const profs = all(`
        SELECT p.id, p.nom, p.prenom, p.telephone, p.email,
               p.matiere_principale, p.actif, p.utilisateur_id,
               p.derniere_connexion, p.created_at,
               u.nom_utilisateur, u.actif AS compte_actif,
               COUNT(DISTINCT pc.classe_id) AS nb_classes
        FROM professeurs p
        LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
        LEFT JOIN professeurs_classes pc ON pc.professeur_id = p.id
        ${where}
        GROUP BY p.id
        ORDER BY p.nom, p.prenom
        LIMIT ? OFFSET ?
      `, [...params, lNum, offset]);

      const totalCount = get("SELECT COUNT(*) as count FROM professeurs WHERE actif = 1 AND ecole_id = ?", [ecoleId])?.count || 0;
      const nbActifs = get(`SELECT COUNT(*) as count FROM professeurs p
        INNER JOIN utilisateurs u ON p.utilisateur_id = u.id
        WHERE p.actif = 1 AND u.actif = 1 AND p.ecole_id = ?`, [ecoleId])?.count || 0;
      const nbSuspendus = get(`SELECT COUNT(*) as count FROM professeurs p
        LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
        WHERE p.actif = 1 AND (u.actif IS NULL OR u.actif = 0) AND p.ecole_id = ?`, [ecoleId])?.count || 0;

      return {
        professeurs: profs,
        total,
        page: pNum,
        limit: lNum,
        stats: { nbActifs, nbSuspendus, nbTotal: totalCount }
      };
    } catch (e) {
      logger.error('Erreur db:getProfesseurs:', e);
      return { professeurs: [], total: 0, page: 1, limit: 50, stats: { nbActifs: 0, nbSuspendus: 0, nbTotal: 0 } };
    }
  });

  // ── Liste simplifiée (sélecteur) ──────────────────────────────────────────

  ipcMain.handle('db:getProfesseursList', async (event, classeId) => {
    if (!getCurrentUserId()) return [];
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      let sql = 'SELECT p.id, p.nom, p.prenom, p.matiere_principale FROM professeurs p WHERE p.actif = 1 AND p.ecole_id = ?';
      const params = [ecoleId];
      const cid = parseInt(classeId);
      if (!isNaN(cid) && cid > 0) {
        sql += ' AND EXISTS (SELECT 1 FROM professeurs_classes pc WHERE pc.professeur_id = p.id AND pc.classe_id = ?)';
        params.push(cid);
      }
      sql += ' ORDER BY p.nom, p.prenom';
      return all(sql, params);
    } catch (e) {
      logger.error('Erreur db:getProfesseursList:', e);
      return [];
    }
  });

  // ── Détail (avec infos du compte + journal) ────────────────────────────────

  ipcMain.handle('db:getProfesseurDetail', async (event, id) => {
    if (!getCurrentUserId()) return { error: 'Non authentifie' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(id);
      if (isNaN(pid)) return { error: 'ID invalide' };

      const prof = get(`
        SELECT p.*, u.nom_utilisateur, u.actif AS compte_actif, u.date_creation AS compte_cree_le
        FROM professeurs p
        LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
        WHERE p.id = ? AND p.ecole_id = ?
      `, [pid, ecoleId]);
      if (!prof) return { error: 'Enseignant introuvable' };

      const classes = all(`
        SELECT c.id, c.nom_classe, c.niveau,
               (SELECT COUNT(*) FROM eleves WHERE classe_id = c.id AND ecole_id = ?) as nb_eleves
        FROM classes c
        JOIN professeurs_classes pc ON pc.classe_id = c.id
        WHERE pc.professeur_id = ? AND c.ecole_id = ?
        ORDER BY c.nom_classe
      `, [ecoleId, pid, ecoleId]);

      const totalEleves = classes.reduce((acc, c) => acc + (c.nb_eleves || 0), 0);

      // Historique des connexions
      const loginHistory = prof.utilisateur_id
        ? all(`
            SELECT timestamp, details
            FROM audit_log
            WHERE utilisateur_id = ? AND action = 'CONNEXION'
            ORDER BY timestamp DESC
            LIMIT 20
          `, [prof.utilisateur_id])
        : [];

      return { professeur: prof, classes, totalEleves, loginHistory };
    } catch (e) {
      logger.error('Erreur db:getProfesseurDetail:', e);
      return { error: e.message };
    }
  });

  // ── Création d'un compte enseignant (prof + utilisateur) ─────────────────

  ipcMain.handle('db:createTeacherAccount', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Acces non autorise' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const { nom, prenom, telephone, email, matiere_principale, classeIds } = data;

      if (!nom || !prenom) return { success: false, error: 'Nom et prenom requis' };

      const username = generateUsername(nom, prenom);
      const rawPassword = generateSecurePassword();
      const hash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

      const result = run('BEGIN TRANSACTION');
      try {
        const userResult = run(
          `INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe_hash, role, nom_complet, classes_ids, actif, ecole_id)
           VALUES (?, ?, 'enseignant', ?, ?, 1, ?)`,
          [username, hash, (prenom + ' ' + nom).trim(), JSON.stringify(classeIds || []), ecoleId]
        );

        const profResult = run(
          `INSERT INTO professeurs (nom, prenom, telephone, email, matiere_principale, actif, utilisateur_id, ecole_id)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          [nom.trim(), prenom.trim(), telephone || null, email || null, matiere_principale || null, userResult.lastID, ecoleId]
        );

        const profId = profResult.lastID;

        if (Array.isArray(classeIds) && classeIds.length) {
          for (const cid of classeIds) {
            const classIdNum = parseInt(cid);
            if (!isNaN(classIdNum)) {
              run('INSERT OR IGNORE INTO professeurs_classes (professeur_id, classe_id) VALUES (?, ?)', [profId, classIdNum]);
            }
          }
        }

        run('COMMIT');

        await logAudit(getCurrentUserId(), 'CREATE_TEACHER_ACCOUNT',
          'Compte enseignant cree: ' + username + ' (' + prenom + ' ' + nom + ')');

        // Auto-sync vers PWA (fire-and-forget)
        try {
          const syncUrl = get("SELECT valeur FROM parametres WHERE cle = 'pwa_sync_url'")?.valeur;
          const apiKey = get("SELECT valeur FROM parametres WHERE cle = 'pwa_sync_api_key'")?.valeur;
          if (syncUrl && apiKey) {
              makeRequest(
                syncUrl.replace(/\/$/, '') + '/api/sync/push-from-desktop',
                  'POST',
                  {
                    ecole_id: ecoleId,
                    code_ecole: (get("SELECT valeur FROM parametres WHERE cle = 'code_ecole'")?.valeur || ''),
                    teachers: [{ username, password: rawPassword, nom_complet: (prenom + ' ' + nom).trim(), actif: 1, ecole_id: ecoleId, classes_ids: classeIds || [], telephone: telephone || '' }],
                    classes: [],
                    students: [],
                  },
                  { 'x-api-key': apiKey }
              ).then((r) => {
              if (r.status === 200) {
                logger.info('Auto-sync PWA reussi pour ' + username);
                if (r.data?.cle_pwa_sync) {
                  run("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('pwa_sync_api_key', ?)", [r.data.cle_pwa_sync]);
                  logger.info('Auto-bootstrap PWA : cle API sauvegardee');
                }
              } else logger.warn('Auto-sync PWA: status ' + r.status);
            }).catch((e) => logger.warn('Auto-sync PWA non disponible:', e.message));
          }
        } catch (syncErr) {
          logger.warn('Auto-sync PWA ignoré (non configure):', syncErr.message);
        }

        // ── Auto-générer la fiche PDF dans Téléchargements/ELIMU/ ──
        let pdfPath = null;
        try {
          const downloadDir = app.getPath('downloads');
          const pdfDir = path.join(downloadDir, 'ELIMU');
          if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
          }
          pdfPath = path.join(pdfDir, `fiche_acces_${username}.pdf`);

          const doc = new PDFDocument({ size: 'A5', margin: 18 });
          const stream = fs.createWriteStream(pdfPath);
          doc.pipe(stream);

          // En-tête
          doc.fontSize(16).font('Helvetica-Bold')
             .text('ELIMU - Acces Enseignant', { align: 'center' });
          doc.moveDown(0.5);

          // Encadré code école
          const codeEcole = get("SELECT valeur FROM parametres WHERE cle = 'code_ecole'")?.valeur || ecoleId || '---';
          const boxY = doc.y;
          doc.roundedRect(18, boxY, 174, 36, 6).fillAndStroke('#e8f4fd', '#2d6ef8');
          doc.fillColor('#1a1a2e').fontSize(9).font('Helvetica').text('Code ecole', 28, boxY + 4, { width: 154, align: 'center' });
          doc.font('Helvetica-Bold').fontSize(22).fillColor('#2d6ef8')
             .text(codeEcole, 28, boxY + 14, { width: 154, align: 'center' });
          doc.fillColor('#000000');
          doc.moveDown(2.2);

          // Informations
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Nom complet : ');
          doc.font('Helvetica').fillColor('#000000').text((prenom || '') + ' ' + (nom || ''));
          doc.moveDown(0.3);

          doc.font('Helvetica-Bold').fillColor('#333333').text('Identifiant : ');
          doc.font('Helvetica').fillColor('#000000').text(username);
          doc.moveDown(0.3);

          doc.font('Helvetica-Bold').fillColor('#333333').text('Mot de passe : ');
          doc.font('Helvetica').fillColor('#000000').text(rawPassword);
          doc.moveDown(0.3);

          if (data.matiere_principale) {
            doc.font('Helvetica-Bold').fillColor('#333333').text('Matiere : ');
            doc.font('Helvetica').fillColor('#000000').text(data.matiere_principale);
            doc.moveDown(0.3);
          }

          // Séparateur + note
          doc.moveTo(18, doc.y).lineTo(192, doc.y).stroke('#dddddd');
          doc.moveDown(0.4);
          doc.fontSize(7).font('Helvetica-Oblique').fillColor('#999999')
             .text('Ce mot de passe ne sera plus affiche apres fermeture de cette fenetre. Conservez ce document en lieu sur.', { align: 'center' });

          doc.end();
          await new Promise(resolve => stream.on('finish', resolve));
          logger.info('Fiche PDF auto-generee: ' + pdfPath);
        } catch (pdfErr) {
          logger.warn('Auto-generation PDF echouee:', pdfErr.message);
        }

        return { success: true, id: profId, username, password: rawPassword, pdfPath };

      } catch (err) {
        run('ROLLBACK');
        throw err;
      }
    } catch (e) {
      logger.error('Erreur createTeacherAccount:', e);
      if (e.message?.includes('UNIQUE')) {
        return { success: false, error: 'Ce nom d\'utilisateur existe deja' };
      }
      return { success: false, error: e.message };
    }
  });

  // ── Mise à jour du profil (sans login/MDP) ──────────────────────────────

  ipcMain.handle('db:updateProfesseur', async (event, id, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Acces non autorise' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const { nom, prenom, telephone, email, matiere_principale, classeIds } = data;

      run(
        'UPDATE professeurs SET nom=?, prenom=?, telephone=?, email=?, matiere_principale=? WHERE id=? AND ecole_id=?',
        [nom.trim(), prenom.trim(), telephone || null, email || null, matiere_principale || null, pid, ecoleId]
      );

      // Mise à jour du nom dans utilisateurs
      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);
      if (prof?.utilisateur_id) {
        run('UPDATE utilisateurs SET nom_complet = ? WHERE id = ?',
          [(prenom.trim() + ' ' + nom.trim()), prof.utilisateur_id]);
      }

      // Classes enseignées
      run('DELETE FROM professeurs_classes WHERE professeur_id = ?', [pid]);
      if (Array.isArray(classeIds) && classeIds.length) {
        for (const cid of classeIds) {
          const classIdNum = parseInt(cid);
          if (!isNaN(classIdNum)) {
            run('INSERT OR IGNORE INTO professeurs_classes (professeur_id, classe_id) VALUES (?, ?)', [pid, classIdNum]);
          }
        }
        // Sync dans utilisateurs.classes_ids
        if (prof?.utilisateur_id) {
          run('UPDATE utilisateurs SET classes_ids = ? WHERE id = ?',
            [JSON.stringify(classeIds), prof.utilisateur_id]);
        }
      }

      await logAudit(getCurrentUserId(), 'UPDATE_PROFESSEUR', 'Professeur ID ' + pid + ' mis a jour');
      return { success: true };
    } catch (e) {
      logger.error('Erreur updateProfesseur:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Suspension du compte ──────────────────────────────────────────────────

  ipcMain.handle('db:suspendTeacherAccount', async (event, id) => {
    if (!(await checkAccess())) return { success: false, error: 'Acces non autorise' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);
      if (!prof) return { success: false, error: 'Enseignant introuvable' };

      if (prof.utilisateur_id) {
        run('UPDATE utilisateurs SET actif = 0 WHERE id = ?', [prof.utilisateur_id]);
      }

      const nom = get('SELECT nom, prenom FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);
      await logAudit(getCurrentUserId(), 'SUSPEND_TEACHER',
        'Compte enseignant suspendu: ' + (nom?.prenom || '') + ' ' + (nom?.nom || ''));
      return { success: true };
    } catch (e) {
      logger.error('Erreur suspendTeacherAccount:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Réactivation du compte ────────────────────────────────────────────────

  ipcMain.handle('db:reactivateTeacherAccount', async (event, id) => {
    if (!(await checkAccess())) return { success: false, error: 'Acces non autorise' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);
      if (!prof) return { success: false, error: 'Enseignant introuvable' };

      if (prof.utilisateur_id) {
        run('UPDATE utilisateurs SET actif = 1 WHERE id = ?', [prof.utilisateur_id]);
      }

      const nom = get('SELECT nom, prenom FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);
      await logAudit(getCurrentUserId(), 'REACTIVATE_TEACHER',
        'Compte enseignant reactive: ' + (nom?.prenom || '') + ' ' + (nom?.nom || ''));
      return { success: true };
    } catch (e) {
      logger.error('Erreur reactivateTeacherAccount:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Réinitialisation du mot de passe ──────────────────────────────────────

  ipcMain.handle('db:resetTeacherPassword', async (event, id) => {
    if (!(await checkAccess())) return { success: false, error: 'Acces non autorise' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get(`
        SELECT p.id, p.nom, p.prenom, p.utilisateur_id, u.nom_utilisateur
        FROM professeurs p
        LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
        WHERE p.id = ? AND p.ecole_id = ?
      `, [pid, ecoleId]);

      if (!prof) return { success: false, error: 'Enseignant introuvable' };
      if (!prof.utilisateur_id) return { success: false, error: 'Aucun compte lie' };

      const rawPassword = generateSecurePassword();
      const hash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

      run('UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE id = ?', [hash, prof.utilisateur_id]);

      await logAudit(getCurrentUserId(), 'RESET_TEACHER_PASSWORD',
        'Mot de passe reinitialise pour ' + prof.nom_utilisateur);
      return { success: true, password: rawPassword, username: prof.nom_utilisateur };
    } catch (e) {
      logger.error('Erreur resetTeacherPassword:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Historique des connexions ─────────────────────────────────────────────

  ipcMain.handle('db:getTeacherLoginHistory', async (event, id) => {
    if (!getCurrentUserId()) return [];
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(id);
      if (isNaN(pid)) return [];

      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);
      if (!prof?.utilisateur_id) return [];

      return all(`
        SELECT date_connexion, details FROM pwa_login_history WHERE professeur_id = ? AND ecole_id = ?
        UNION ALL
        SELECT timestamp AS date_connexion, details FROM audit_log WHERE utilisateur_id = ? AND action IN ('CONNEXION', 'DECONNEXION')
        ORDER BY date_connexion DESC
        LIMIT 50
      `, [pid, ecoleId, prof.utilisateur_id]);
    } catch (e) {
      logger.error('Erreur getTeacherLoginHistory:', e);
      return [];
    }
  });

  // ── Impression fiche d'accès ─────────────────────────────────────────────

  ipcMain.handle('db:printTeacherAccessCard', async (event, id, lang = 'fr', passwordOverride = null) => {
    if (!(await checkAccess())) return { success: false, error: 'Acces non autorise' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const codeEcole = get("SELECT valeur FROM parametres WHERE cle = 'code_ecole'")?.valeur || ecoleId;
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get(`
        SELECT p.id, p.nom, p.prenom, p.telephone, p.email,
               p.matiere_principale, p.utilisateur_id,
               u.nom_utilisateur
        FROM professeurs p
        LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
        WHERE p.id = ? AND p.ecole_id = ?
      `, [pid, ecoleId]);

      if (!prof) return { success: false, error: 'Enseignant introuvable' };

      const classes = all(`
        SELECT c.nom_classe
        FROM classes c
        JOIN professeurs_classes pc ON pc.classe_id = c.id
        WHERE pc.professeur_id = ? AND c.ecole_id = ?
        ORDER BY c.nom_classe
      `, [pid, ecoleId]);

      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: 'fiche_acces_' + (prof.nom_utilisateur || 'enseignant') + '.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (savePath.canceled) return { canceled: true };

      const doc = new PDFDocument({ size: 'A5', margin: 20 });
      const stream = fs.createWriteStream(savePath.filePath);
      doc.pipe(stream);

      // En-tête
      doc.fontSize(16).font('Helvetica-Bold')
         .text('ELIMU - Acces Enseignant', { align: 'center' });
      doc.moveDown(0.5);

      // Séparateur
      doc.moveTo(20, doc.y).lineTo(175, doc.y).stroke('#cccccc');
      doc.moveDown(0.8);

      // Informations
      doc.fontSize(11).font('Helvetica-Bold').text('Nom complet : ');
      doc.font('Helvetica').text((prof.prenom || '') + ' ' + (prof.nom || ''));
      doc.moveDown(0.4);

      doc.font('Helvetica-Bold').text('Identifiant : ');
      doc.font('Helvetica').text(prof.nom_utilisateur || '—');
      doc.moveDown(0.4);

      doc.font('Helvetica-Bold').text('Code ecole : ');
      doc.font('Helvetica').text(codeEcole || '—');
      doc.moveDown(0.4);

      doc.font('Helvetica-Bold').text('Mot de passe : ');
      doc.font('Helvetica').text(passwordOverride || '—');
      doc.moveDown(0.4);

      if (prof.matiere_principale) {
        doc.font('Helvetica-Bold').text('Matiere : ');
        doc.font('Helvetica').text(prof.matiere_principale);
        doc.moveDown(0.4);
      }

      if (classes.length) {
        doc.font('Helvetica-Bold').text('Classes : ');
        doc.font('Helvetica').text(classes.map(c => c.nom_classe).join(', '));
        doc.moveDown(0.6);
      }

      // Note de sécurité
      doc.moveTo(20, doc.y).lineTo(175, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica-Oblique')
         .fillColor('#666666')
         .text('Ce mot de passe ne sera plus affiche. Conservez ce document en lieu sur.', { align: 'center' });

      doc.end();

      await new Promise(resolve => stream.on('finish', resolve));

      await logAudit(getCurrentUserId(), 'PRINT_TEACHER_CARD',
        'Fiche acces imprimee pour ID ' + pid);
      return { success: true };
    } catch (e) {
      logger.error('Erreur printTeacherAccessCard:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Désactivation (soft delete) ──────────────────────────────────────────

  ipcMain.handle('db:deleteProfesseur', async (event, id) => {
    if (!(await checkAccess(['admin']))) return { success: false, error: 'Acces non autorise' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get('SELECT nom, prenom, utilisateur_id FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);
      if (!prof) return { success: false, error: 'Enseignant introuvable' };

      run('UPDATE classes SET professeur_principal_id = NULL WHERE professeur_principal_id = ? AND ecole_id = ?', [pid, ecoleId]);

      if (prof.utilisateur_id) {
        run('DELETE FROM utilisateurs WHERE id = ?', [prof.utilisateur_id]);
      }
      run('DELETE FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);

      await logAudit(getCurrentUserId(), 'DELETE_PROFESSEUR',
        'Professeur supprime: ' + (prof.prenom || '') + ' ' + (prof.nom || ''));
      return { success: true };
    } catch (e) {
      logger.error('Erreur deleteProfesseur:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Classes enseignées ────────────────────────────────────────────────────

  ipcMain.handle('db:updateClassesEnseignees', async (event, professeurId, classeIds) => {
    if (!(await checkAccess())) return { success: false, error: 'Acces non autorise' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(professeurId);
      if (isNaN(pid)) return { success: false, error: 'ID professeur invalide' };

      run('DELETE FROM professeurs_classes WHERE professeur_id = ?', [pid]);
      if (Array.isArray(classeIds) && classeIds.length) {
        for (const cid of classeIds) {
          const classIdNum = parseInt(cid);
          if (isNaN(classIdNum)) continue;
          run('INSERT OR IGNORE INTO professeurs_classes (professeur_id, classe_id) VALUES (?, ?)', [pid, classIdNum]);
        }
      }
      // Cohérence : miroir dans utilisateurs.classes_ids (source fallback du push PWA)
      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ? AND ecole_id = ?', [pid, ecoleId]);
      if (prof?.utilisateur_id) {
        const userClasses = (Array.isArray(classeIds) ? classeIds : []).map(Number).filter(n => !isNaN(n));
        run('UPDATE utilisateurs SET classes_ids = ? WHERE id = ?',
          [JSON.stringify(Array.from(new Set(userClasses))), prof.utilisateur_id]);
      }
      return { success: true };
    } catch (e) {
      logger.error('Erreur updateClassesEnseignees:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:getClassesByProfesseur', async (event, professeurId) => {
    if (!getCurrentUserId()) return [];
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const pid = parseInt(professeurId);
      if (isNaN(pid)) return [];
      return all(`
        SELECT c.id, c.nom_classe, c.niveau
        FROM classes c
        JOIN professeurs_classes pc ON pc.classe_id = c.id
        WHERE pc.professeur_id = ? AND c.ecole_id = ?
        ORDER BY c.nom_classe
      `, [pid, ecoleId]);
    } catch (e) {
      logger.error('Erreur getClassesByProfesseur:', e);
      return [];
    }
  });

  // ── Sync PWA ──────────────────────────────────────────────────────────
  // Pont Desktop → PWA : pousse les donnees (enseignants, classes, eleves)
  // vers le serveur PWA via POST /api/sync/push-from-desktop

  ipcMain.handle('db:syncToPwa', async () => {
    try {
      const syncUrl = get("SELECT valeur FROM parametres WHERE cle = 'pwa_sync_url'")?.valeur;
      const apiKey = get("SELECT valeur FROM parametres WHERE cle = 'pwa_sync_api_key'")?.valeur;

      if (!syncUrl || !apiKey) {
        return { success: false, error: 'Configuration PWA manquante. Configurez pwa_sync_url et pwa_sync_api_key dans Parametres.' };
      }

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const anneeId = getCurrentAnneeId ? getCurrentAnneeId() : null;
      const anneeLibelle = anneeId
        ? (get("SELECT libelle FROM annees_scolaires WHERE id = ?", [anneeId])?.libelle || '')
        : '';

      const teachers = all(`
        SELECT u.nom_utilisateur AS username, u.mot_de_passe_hash AS password_hash,
               u.nom_complet, u.actif, u.classes_ids,
               p.telephone
        FROM utilisateurs u
        LEFT JOIN professeurs p ON p.utilisateur_id = u.id
        WHERE u.role = 'enseignant' AND u.ecole_id = ?
      `, [ecoleId]).map((t) => ({
        username: t.username,
        password_hash: t.password_hash,
        nom_complet: t.nom_complet || '',
        actif: t.actif,
        ecole_id: ecoleId,
        classes_ids: JSON.parse(t.classes_ids || '[]'),
        telephone: t.telephone || '',
      }));

      // ══ Classes → associations classe ↔ enseignant ══
      // Deux sources superposées : professeurs_classes (lien direct) + utilisateurs.classes_ids
      // (fallback, mis à jour via la section Professeurs). Une classe sans enseignant n'est pas poussée.
      const classesList = all(`
        SELECT c.id, c.nom_classe, c.niveau_v2,
               (SELECT COUNT(*) FROM eleves WHERE classe_id = c.id AND ecole_id = ? AND annee_scolaire_id = ?) AS eleves_count
        FROM classes c
        WHERE c.ecole_id = ?
      `, [ecoleId, anneeId, ecoleId]);

      const classTeacherRows = all(`
        SELECT pc.classe_id, u.nom_utilisateur
        FROM professeurs_classes pc
        INNER JOIN professeurs p ON p.id = pc.professeur_id
        INNER JOIN utilisateurs u ON u.id = p.utilisateur_id
        WHERE u.role = 'enseignant' AND u.ecole_id = ?
          AND pc.classe_id IN (SELECT id FROM classes WHERE ecole_id = ?)
      `, [ecoleId, ecoleId]);

      const usernamesByClass = new Map();
      for (const row of classTeacherRows) {
        if (!row.nom_utilisateur) continue;
        if (!usernamesByClass.has(row.classe_id)) usernamesByClass.set(row.classe_id, new Set());
        usernamesByClass.get(row.classe_id).add(row.nom_utilisateur);
      }
      // Fallback : classes_ids déclarés sur les comptes enseignants
      for (const t of teachers) {
        for (const cid of (t.classes_ids || [])) {
          const classIdNum = parseInt(cid);
          if (isNaN(classIdNum)) continue;
          if (!usernamesByClass.has(classIdNum)) usernamesByClass.set(classIdNum, new Set());
          usernamesByClass.get(classIdNum).add(t.username);
        }
      }

      const classes = [];
      const linkedClassIds = new Set();
      for (const c of classesList) {
        const usernames = usernamesByClass.get(c.id);
        if (!usernames || usernames.size === 0) {
          if ((c.eleves_count || 0) > 0) {
            logger.warn('Sync PWA: classe "' + c.nom_classe + '" sans enseignant, non poussee');
          }
          continue;
        }
        linkedClassIds.add(c.id);
        for (const username of usernames) {
          classes.push({
            classe_nom: c.nom_classe,
            niveau_v2: c.niveau_v2 || 'N1',
            eleves_count: c.eleves_count || 0,
            teacher_username: username,
            ecole_id: ecoleId,
          });
        }
      }

      const placeholders = Array.from(linkedClassIds).length
        ? linkedClassIds.size - 1
        : 0;
      const students = all(`
        SELECT e.id, e.nom, e.prenom, e.matricule, c.nom_classe
        FROM eleves e
        JOIN classes c ON c.id = e.classe_id
        WHERE e.ecole_id = ? AND e.annee_scolaire_id = ?
        ${placeholders ? `AND e.classe_id IN (${Array.from(linkedClassIds).map(() => '?').join(',')})` : ''}
      `, placeholders
        ? [ecoleId, anneeId, ...Array.from(linkedClassIds)]
        : [ecoleId, anneeId]).map((s) => ({
        external_id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        matricule: s.matricule || null,
        classe_nom: s.nom_classe,
        ecole_id: ecoleId,
      }));

      const codeEcole = get("SELECT valeur FROM parametres WHERE cle = 'code_ecole'")?.valeur || '';
      const payload = {
        annee_scolaire: anneeLibelle,
        ecole_id: ecoleId,
        code_ecole: codeEcole,
        full_sync: true,
        teachers, classes, students
      };

      logger.info('Sync PWA payload:', JSON.stringify({ annee_scolaire: anneeLibelle, teachers: teachers.length, classes: classes.length, students: students.length }));

      const result = await makeRequest(
        syncUrl.replace(/\/$/, '') + '/api/sync/push-from-desktop',
        'POST',
        payload,
        { 'x-api-key': apiKey }
      );

      // Auto-bootstrap : si la PWA a genere une cle dediee, la sauvegarder
      const responseData = result.data || {};
      if (responseData.cle_pwa_sync) {
        run("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('pwa_sync_api_key', ?)", [responseData.cle_pwa_sync]);
        logger.info('Auto-bootstrap PWA : nouvelle cle API sauvegardee pour cette ecole');
      }

      if (result.status !== 200) {
        const errMsg = responseData.error || 'HTTP ' + result.status;
        return { success: false, error: translatePwaError(new Error(errMsg)) };
      }

      logger.info('Sync PWA termine:', result.status, JSON.stringify(responseData));
      await logAudit(getCurrentUserId(), 'SYNC_TO_PWA',
        'Synchronisation vers PWA: ' + (responseData.teachers || 0) + ' enseignants, ' +
        (responseData.classes || 0) + ' classes, ' + (responseData.students || 0) + ' eleves');

      return responseData;
    } catch (e) {
      logger.error('Erreur sync PWA:', e);
      return { success: false, error: translatePwaError(e) };
    }
  });

  ipcMain.handle('db:getPwaSyncConfig', async () => {
    try {
      return {
        url: get("SELECT valeur FROM parametres WHERE cle = 'pwa_sync_url'")?.valeur || '',
        apiKey: get("SELECT valeur FROM parametres WHERE cle = 'pwa_sync_api_key'")?.valeur || '',
      };
    } catch (e) {
      logger.error('Erreur getPwaSyncConfig:', e);
      return { url: '', apiKey: '' };
    }
  });

  ipcMain.handle('db:savePwaSyncConfig', async (event, data) => {
    try {
      if (data.url !== undefined) run("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('pwa_sync_url', ?)", [data.url || '']);
      if (data.apiKey !== undefined) run("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('pwa_sync_api_key', ?)", [data.apiKey || '']);
      await logAudit(getCurrentUserId(), 'UPDATE_PWA_SYNC_CONFIG', 'Configuration synchro PWA mise a jour');
      return { success: true };
    } catch (e) {
      logger.error('Erreur savePwaSyncConfig:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Pull depuis PWA ─────────────────────────────────────────────────────────
  // Pont PWA → Desktop : recupere les notes/absences depuis le serveur PWA
  // via GET /api/sync/pull-from-pwa et les importe dans la base locale

  ipcMain.handle('db:pullFromPwa', async () => {
    try {
      const syncUrl = get("SELECT valeur FROM parametres WHERE cle = 'pwa_sync_url'")?.valeur;
      const apiKey = get("SELECT valeur FROM parametres WHERE cle = 'pwa_sync_api_key'")?.valeur;

      if (!syncUrl || !apiKey) {
        return { success: false, error: 'Configuration PWA manquante. Configurez pwa_sync_url et pwa_sync_api_key dans Parametres.' };
      }

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const anneeId = getCurrentAnneeId ? getCurrentAnneeId() : null;

      if (!ecoleId) return { success: false, error: 'ecole_id non disponible' };

      const response = await makeRequest(
        syncUrl.replace(/\/$/, '') + '/api/sync/pull-from-pwa',
        'GET',
        null,
        { 'x-api-key': apiKey, 'x-ecole-id': ecoleId }
      );

      // Auto-bootstrap : si la PWA a genere une cle dediee, la sauvegarder
      const responseData = response.data || {};
      if (responseData.cle_pwa_sync) {
        run("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('pwa_sync_api_key', ?)", [responseData.cle_pwa_sync]);
        logger.info('Auto-bootstrap PWA : nouvelle cle API sauvegardee pour cette ecole (pull)');
      }

      if (response.status !== 200) {
        const errMsg = responseData.error || 'HTTP ' + response.status;
        return { success: false, error: translatePwaError(new Error(errMsg)) };
      }

      const payload = responseData;
      if (!payload?.success || !payload?.data) {
        return { success: false, error: 'Format de reponse PWA invalide' };
      }

      const { notes, notesN3, absences } = payload.data;
      const result = { notesImportees: 0, notesN3Importees: 0, absencesImportees: 0, erreurs: [] };

      const periodeMap = { 1: 'Trimestre 1', 2: 'Trimestre 2', 3: 'Trimestre 3' };
      const { getWeightsForSousCompetence, calcAggregateFromSubNotes, getPeriodeForUA, CURRICULUM_TEMPLATES } = require('../../shared/constants/curriculum');

      run('BEGIN');
      try {
        // ══ N1/N2 Notes ══════════════════════════════════════
        const subNotesByGroup = {};

        for (const n of notes) {
          if (n.note === null || n.note === undefined || typeof n.note !== 'number' || isNaN(n.note) || n.note < 0) {
            result.erreurs.push('Note invalide (NULL/NaN) pour eleve ' + n.eleve_external_id + ' (UA ' + n.ua + ', ' + n.sous_competence_code + ')');
            continue;
          }

          const eleve = get('SELECT id, classe_id FROM eleves WHERE id = ? AND ecole_id = ?', [n.eleve_external_id, ecoleId]);
          if (!eleve) {
            result.erreurs.push('Eleve ID ' + n.eleve_external_id + ' introuvable');
            continue;
          }

          const classe = get('SELECT niveau_v2 FROM classes WHERE id = ? AND ecole_id = ?', [eleve.classe_id, ecoleId]);

          const periode = periodeMap[n.trimestre] || getPeriodeForUA(n.ua) || 'Trimestre 1';

          run(
            "DELETE FROM notes WHERE eleve_id=? AND sous_competence_code=? AND (sous_type=? OR type_eval=?) AND ua=? AND annee_scolaire_id=? AND ecole_id=?",
            [eleve.id, n.sous_competence_code, n.type_eval, n.type_eval, n.ua, anneeId, ecoleId]
          );
          run(
            "INSERT INTO notes (eleve_id, note, ua, sous_competence_code, type_eval, sous_type, source, annee_scolaire_id, periode, ecole_id) VALUES (?,?,?,?,?,?,'PWA',?,?,?)",
            [eleve.id, n.note, n.ua, n.sous_competence_code, n.type_eval, n.type_eval, anneeId, periode, ecoleId]
          );
          result.notesImportees++;

          const key = eleve.id + '|' + n.sous_competence_code + '|' + n.ua;
          if (!subNotesByGroup[key]) {
            subNotesByGroup[key] = { eleveId: eleve.id, sousCode: n.sous_competence_code, ua: n.ua, lvl: classe?.niveau_v2, subNotes: {} };
          }
          subNotesByGroup[key].subNotes[n.type_eval] = n.note;
        }

        // Aggregate notes (sous_type IS NULL)
        for (const key of Object.keys(subNotesByGroup)) {
          const g = subNotesByGroup[key];
          if (g.lvl !== 'N1' && g.lvl !== 'N2') continue;
          const weights = getWeightsForSousCompetence(g.lvl, g.sousCode);
          if (!weights) continue;
          const agg = calcAggregateFromSubNotes(g.subNotes, weights);
          if (agg === null) continue;

          const periode = getPeriodeForUA(g.ua) || 'Trimestre 1';

          run(
            "DELETE FROM notes WHERE eleve_id=? AND sous_competence_code=? AND sous_type IS NULL AND ua=? AND annee_scolaire_id=? AND ecole_id=?",
            [g.eleveId, g.sousCode, g.ua, anneeId, ecoleId]
          );
          run(
            "INSERT INTO notes (eleve_id, note, ua, sous_competence_code, type_eval, sous_type, source, annee_scolaire_id, periode, ecole_id) VALUES (?,?,?,?,NULL,NULL,'PWA',?,?,?)",
            [g.eleveId, Math.round(agg * 100) / 100, g.ua, g.sousCode, anneeId, periode, ecoleId]
          );
          result.notesImportees++;
        }

        // ══ N3 Notes ════════════════════════════════════════
        for (const n of notesN3) {
          if (n.note === null || n.note === undefined || typeof n.note !== 'number' || isNaN(n.note) || n.note < 0) {
            result.erreurs.push('Note N3 invalide (NULL/NaN) pour eleve ' + n.eleve_external_id);
            continue;
          }

          const eleve = get('SELECT id FROM eleves WHERE id = ? AND ecole_id = ?', [n.eleve_external_id, ecoleId]);
          if (!eleve) {
            result.erreurs.push('Eleve ID ' + n.eleve_external_id + ' introuvable (N3)');
            continue;
          }

          // Map PWA matiere_code → Desktop matiere name via curriculum
          let matiereName = n.matiere_code;
          const matFixes = CURRICULUM_TEMPLATES?.N3?.matieresFixes;
          if (matFixes?.[n.matiere_code]) {
            matiereName = matFixes[n.matiere_code];
          }

          let matiere = get('SELECT id FROM matieres WHERE nom_matiere = ?', [matiereName]);
          if (!matiere) {
            run('INSERT INTO matieres (nom_matiere) VALUES (?)', [matiereName]);
            matiere = get('SELECT id FROM matieres WHERE nom_matiere = ?', [matiereName]);
          }

          const periode = periodeMap[n.trimestre] || 'Trimestre 1';

          run(
            "DELETE FROM notes WHERE eleve_id=? AND matiere_id=? AND periode=? AND sequence=? AND annee_scolaire_id=? AND ecole_id=?",
            [eleve.id, matiere.id, periode, n.sequence, anneeId, ecoleId]
          );
          run(
            "INSERT INTO notes (eleve_id, matiere_id, note, periode, sequence, source, annee_scolaire_id, ecole_id) VALUES (?,?,?,?,?,'PWA',?,?)",
            [eleve.id, matiere.id, n.note, periode, n.sequence, anneeId, ecoleId]
          );
          result.notesN3Importees++;
        }

        // ══ Absences ════════════════════════════════════════
        for (const a of absences) {
          const eleve = get('SELECT id FROM eleves WHERE id = ? AND ecole_id = ?', [a.eleve_external_id, ecoleId]);
          if (!eleve) {
            result.erreurs.push('Eleve ID ' + a.eleve_external_id + ' introuvable (absence)');
            continue;
          }

          const periode = periodeMap[a.trimestre] || 'Trimestre 1';

          run(
            "INSERT OR REPLACE INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id, ecole_id) VALUES (?,?,?,?,?)",
            [eleve.id, periode, a.heures, anneeId, ecoleId]
          );
          result.absencesImportees++;
        }

        // ══ Teacher last login (derniere_connexion) ════════
        const teacherLogins = payload.data.teacher_last_logins || [];
        for (const tl of teacherLogins) {
          if (!tl.last_login) continue;
          const u = get('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? AND ecole_id = ?', [tl.username, ecoleId]);
          if (!u) continue;
          const p = get('SELECT id FROM professeurs WHERE utilisateur_id = ? AND ecole_id = ?', [u.id, ecoleId]);
          if (!p) continue;
          run("UPDATE professeurs SET derniere_connexion = ? WHERE id = ?", [tl.last_login, p.id]);
        }

        // ══ Login history (Journal) ════════════════════════
        const loginHistory = payload.data.login_history || [];
        if (loginHistory.length > 0) {
          run("DELETE FROM pwa_login_history WHERE ecole_id = ?", [ecoleId]);
          for (const lh of loginHistory) {
            const u = get('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? AND ecole_id = ?', [lh.username, ecoleId]);
            if (!u) continue;
            const p = get('SELECT id FROM professeurs WHERE utilisateur_id = ? AND ecole_id = ?', [u.id, ecoleId]);
            if (!p) continue;
            run(
              "INSERT INTO pwa_login_history (professeur_id, date_connexion, details, ecole_id) VALUES (?,?,?,?)",
              [p.id, lh.login_at, lh.ip_address ? 'IP: ' + lh.ip_address : '', ecoleId]
            );
          }
        }

        run('COMMIT');

        await logAudit(getCurrentUserId(), 'PULL_FROM_PWA',
          result.notesImportees + ' notes N1/N2, ' + result.notesN3Importees + ' notes N3, ' +
          result.absencesImportees + ' absences');

        logger.info('Pull PWA termine:', JSON.stringify(result));
        return { success: true, ...result };
      } catch (err) {
        run('ROLLBACK');
        throw err;
      }
    } catch (e) {
      logger.error('Erreur pull PWA:', e);
      return { success: false, error: translatePwaError(e) };
    }
  });
}

// ── Traduction erreurs PWA ─────────────────────────────────────────────

function translatePwaError(err) {
  const msg = (err && err.message) || String(err || '');
  if (msg.includes('TIMEOUT')) return 'Le serveur PWA ne repond pas. Verifiez votre connexion internet et que le serveur PWA est en marche.';
  if (msg.includes('ECONNREFUSED')) return 'Connexion refusee par le serveur PWA. Verifiez que l\'adresse du serveur est correcte et que le serveur est bien lance.';
  if (msg.includes('ECONNRESET') || msg.includes('socket hang up')) return 'Connexion interrompue. Verifiez votre reseau et reessayez.';
  if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')) return 'Impossible de joindre le serveur PWA. Verifiez l\'URL et votre connexion internet.';
  if (msg.includes('EHOSTUNREACH') || msg.includes('ENETUNREACH')) return 'Le serveur PWA est inaccessible. Verifiez votre reseau.';
  if (msg.includes('ETIMEDOUT')) return 'Delai d\'attente depasse. Le serveur PWA met trop de temps a repondre. Reessayez plus tard.';
  if (msg.includes('getaddrinfo')) return 'Nom d\'hote introuvable. Verifiez l\'URL du serveur PWA dans Parametres.';
  if (msg.includes('415') || msg.includes('Unsupported Media Type')) return 'Le serveur PWA a rejete la requete. Mettez a jour le serveur PWA.';
  if (msg.includes('401') || msg.includes('Unauthorized')) return 'Cle API PWA invalide. Verifiez la cle dans Parametres et regenerez-la si necessaire.';
  if (msg.includes('403') || msg.includes('Forbidden')) return 'Acces refuse par le serveur PWA. Verifiez les droits de votre cle API.';
  if (msg.includes('500') || msg.includes('Internal Server Error')) return 'Erreur interne du serveur PWA. Contactez votre administrateur.';
  if (msg.includes('502') || msg.includes('Bad Gateway')) return 'Le serveur PWA a rencontre une erreur de passerelle. Reessayez plus tard.';
  if (msg.includes('503') || msg.includes('Service Unavailable')) return 'Le serveur PWA est temporairement indisponible. Reessayez plus tard.';
  return 'Erreur de synchronisation PWA: ' + msg + '. Verifiez votre connexion internet et la configuration dans Parametres.';
}

// ── Sync PWA ────────────────────────────────────────────────────────────
// Pont Desktop → PWA : pousse les donnees (enseignants, classes, eleves)
// vers le serveur PWA via POST /api/sync/push-from-desktop

const http = require('http');
const https = require('https');

function makeRequest(url, method, body, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + (urlObj.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = client.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error('TIMEOUT'));
    }, 30000);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = { register };
