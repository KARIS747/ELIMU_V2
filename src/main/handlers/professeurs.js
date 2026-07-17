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
const { dialog } = require('electron');
const crypto = require('crypto');

const BCRYPT_ROUNDS = 10;
const PASS_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASS_LENGTH = 10;

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
  const { logger, getCurrentUserId, getMainWindow } = deps;

  const checkAccess = async (roles = ['admin']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  // ── Liste paginée (avec infos du compte) ──────────────────────────────────

  ipcMain.handle('db:getProfesseurs', async (event, filtres = {}) => {
    if (!getCurrentUserId()) return { professeurs: [], total: 0 };
    try {
      const { recherche = '', actifSeulement = false, page = 1, limit = 50 } = filtres;
      const params = [];
      let where = 'WHERE 1=1';

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

      const nbActifs = get("SELECT COUNT(*) as count FROM professeurs WHERE actif = 1")?.count || 0;
      const totalCount = get("SELECT COUNT(*) as count FROM professeurs")?.count || 0;
      const nbSuspendus = totalCount - nbActifs;

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
      let sql = 'SELECT p.id, p.nom, p.prenom, p.matiere_principale FROM professeurs p WHERE p.actif = 1';
      const params = [];
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
      const pid = parseInt(id);
      if (isNaN(pid)) return { error: 'ID invalide' };

      const prof = get(`
        SELECT p.*, u.nom_utilisateur, u.actif AS compte_actif, u.date_creation AS compte_cree_le
        FROM professeurs p
        LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
        WHERE p.id = ?
      `, [pid]);
      if (!prof) return { error: 'Professeur introuvable' };

      const classes = all(`
        SELECT c.id, c.nom_classe, c.niveau,
               (SELECT COUNT(*) FROM eleves WHERE classe_id = c.id) as nb_eleves
        FROM classes c
        JOIN professeurs_classes pc ON pc.classe_id = c.id
        WHERE pc.professeur_id = ?
        ORDER BY c.nom_classe
      `, [pid]);

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
      const { nom, prenom, telephone, email, matiere_principale, classeIds } = data;

      if (!nom || !prenom) return { success: false, error: 'Nom et prenom requis' };

      const username = generateUsername(nom, prenom);
      const rawPassword = generateSecurePassword();
      const hash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

      const result = run('BEGIN TRANSACTION');
      try {
        const userResult = run(
          `INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe_hash, role, nom_complet, classes_ids, actif)
           VALUES (?, ?, 'enseignant', ?, ?, 1)`,
          [username, hash, (prenom + ' ' + nom).trim(), JSON.stringify(classeIds || [])]
        );

        const profResult = run(
          `INSERT INTO professeurs (nom, prenom, telephone, email, matiere_principale, actif, utilisateur_id)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
          [nom.trim(), prenom.trim(), telephone || null, email || null, matiere_principale || null, userResult.lastID]
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

        return { success: true, id: profId, username, password: rawPassword };

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
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const { nom, prenom, telephone, email, matiere_principale, classeIds } = data;

      run(
        'UPDATE professeurs SET nom=?, prenom=?, telephone=?, email=?, matiere_principale=? WHERE id=?',
        [nom.trim(), prenom.trim(), telephone || null, email || null, matiere_principale || null, pid]
      );

      // Mise à jour du nom dans utilisateurs
      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ?', [pid]);
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
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ?', [pid]);
      if (!prof) return { success: false, error: 'Professeur introuvable' };

      run('UPDATE professeurs SET actif = 0 WHERE id = ?', [pid]);
      if (prof.utilisateur_id) {
        run('UPDATE utilisateurs SET actif = 0 WHERE id = ?', [prof.utilisateur_id]);
      }

      const nom = get('SELECT nom, prenom FROM professeurs WHERE id = ?', [pid]);
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
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ?', [pid]);
      if (!prof) return { success: false, error: 'Professeur introuvable' };

      run('UPDATE professeurs SET actif = 1 WHERE id = ?', [pid]);
      if (prof.utilisateur_id) {
        run('UPDATE utilisateurs SET actif = 1 WHERE id = ?', [prof.utilisateur_id]);
      }

      const nom = get('SELECT nom, prenom FROM professeurs WHERE id = ?', [pid]);
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
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get(`
        SELECT p.id, p.nom, p.prenom, p.utilisateur_id, u.nom_utilisateur
        FROM professeurs p
        LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
        WHERE p.id = ?
      `, [pid]);

      if (!prof) return { success: false, error: 'Professeur introuvable' };
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
      const pid = parseInt(id);
      if (isNaN(pid)) return [];

      const prof = get('SELECT utilisateur_id FROM professeurs WHERE id = ?', [pid]);
      if (!prof?.utilisateur_id) return [];

      return all(`
        SELECT timestamp, details
        FROM audit_log
        WHERE utilisateur_id = ? AND action IN ('CONNEXION', 'DECONNEXION')
        ORDER BY timestamp DESC
        LIMIT 50
      `, [prof.utilisateur_id]);
    } catch (e) {
      logger.error('Erreur getTeacherLoginHistory:', e);
      return [];
    }
  });

  // ── Impression fiche d'accès ─────────────────────────────────────────────

  ipcMain.handle('db:printTeacherAccessCard', async (event, id, lang = 'fr', passwordOverride = null) => {
    if (!(await checkAccess())) return { success: false, error: 'Acces non autorise' };
    try {
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      const prof = get(`
        SELECT p.id, p.nom, p.prenom, p.telephone, p.email,
               p.matiere_principale, p.utilisateur_id,
               u.nom_utilisateur
        FROM professeurs p
        LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
        WHERE p.id = ?
      `, [pid]);

      if (!prof) return { success: false, error: 'Professeur introuvable' };

      const classes = all(`
        SELECT c.nom_classe
        FROM classes c
        JOIN professeurs_classes pc ON pc.classe_id = c.id
        WHERE pc.professeur_id = ?
        ORDER BY c.nom_classe
      `, [pid]);

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
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };
      run('UPDATE professeurs SET actif = 0 WHERE id = ?', [pid]);
      run('UPDATE classes SET professeur_principal_id = NULL WHERE professeur_principal_id = ?', [pid]);
      await logAudit(getCurrentUserId(), 'DELETE_PROFESSEUR', 'Professeur ID ' + pid + ' desactive');
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
      return { success: true };
    } catch (e) {
      logger.error('Erreur updateClassesEnseignees:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:getClassesByProfesseur', async (event, professeurId) => {
    if (!getCurrentUserId()) return [];
    try {
      const pid = parseInt(professeurId);
      if (isNaN(pid)) return [];
      return all(`
        SELECT c.id, c.nom_classe, c.niveau
        FROM classes c
        JOIN professeurs_classes pc ON pc.classe_id = c.id
        WHERE pc.professeur_id = ?
        ORDER BY c.nom_classe
      `, [pid]);
    } catch (e) {
      logger.error('Erreur getClassesByProfesseur:', e);
      return [];
    }
  });
}

module.exports = { register };
