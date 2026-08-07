/**
 * anneesScolaires.js - Handlers IPC pour la gestion des années scolaires
 * Élimu — src/main/handlers/anneesScolaires.js
 */

const { run, get, all } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');

// ============================================================
// REGISTRATION
// ============================================================

function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getCurrentAnneeId, setCurrentAnneeId, getMainWindow, getCurrentEcoleId } = deps;

  // Helper pour vérifier l'accès admin
  const checkAdmin = async () => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, 'admin');
  };

  // ----------------------------------------------------------
  // db:getAnneesScolaires
  // Retourne la liste de toutes les années (actives + archivées)
  // ----------------------------------------------------------
  ipcMain.handle('db:getAnneesScolaires', async (_event, { includeArchived = true } = {}) => {
    if (!getCurrentUserId()) return [];
    try {
      const query = includeArchived
        ? `SELECT * FROM annees_scolaires ORDER BY active DESC, date_debut DESC, id DESC`
        : `SELECT * FROM annees_scolaires WHERE archived = 0 ORDER BY active DESC, date_debut DESC, id DESC`;
      const rows = all(query);
      return rows;
    } catch (err) {
      logger.error('Erreur getAnneesScolaires:', err);
      return { error: err.message };
    }
  });

  // ----------------------------------------------------------
  // db:getAnneeActive — retourne l'année active courante
  // ----------------------------------------------------------
  ipcMain.handle('db:getAnneeActive', async () => {
    try {
      const row = get(`SELECT * FROM annees_scolaires WHERE active = 1 LIMIT 1`);
      return row || null;
    } catch (err) {
      logger.error('Erreur getAnneeActive:', err);
      return null;
    }
  });

  // ----------------------------------------------------------
  // db:addAnneeScolaire — crée une nouvelle année
  // ----------------------------------------------------------
  ipcMain.handle('db:addAnneeScolaire', async (_event, { libelle, date_debut, date_fin }) => {
    if (!(await checkAdmin())) return { error: 'Accès non autorisé' };
    try {
      if (!libelle?.trim()) return { error: 'Le libellé est obligatoire.' };

      const existing = get(
        `SELECT id FROM annees_scolaires WHERE libelle = ?`, [libelle.trim()]
      );
      if (existing) return { error: `L'année "${libelle}" existe déjà.` };

      const result = run(
        `INSERT INTO annees_scolaires (libelle, date_debut, date_fin, active, archived)
         VALUES (?, ?, ?, 0, 0)`,
        [libelle.trim(), date_debut || null, date_fin || null]
      );

      await logAudit(getCurrentUserId(), 'ADD_ANNEE_SCOLAIRE', `Année créée : ${libelle}`);
      logger.info(`Année scolaire créée : ${libelle}`);
      return { success: true, id: result.lastID };
    } catch (err) {
      logger.error('Erreur addAnneeScolaire:', err);
      return { error: err.message };
    }
  });

  // ----------------------------------------------------------
  // db:updateAnneeScolaire — modifie une année existante
  // ----------------------------------------------------------
  ipcMain.handle('db:updateAnneeScolaire', async (_event, { id, libelle, date_debut, date_fin, archived }) => {
    if (!(await checkAdmin())) return { error: 'Accès non autorisé' };
    try {
      const aid = parseInt(id);
      if (isNaN(aid))      return { error: 'ID invalide.' };
      if (!libelle?.trim()) return { error: 'Le libellé est obligatoire.' };

      const conflict = get(
        `SELECT id FROM annees_scolaires WHERE libelle = ? AND id != ?`,
        [libelle.trim(), aid]
      );
      if (conflict) return { error: `Le libellé "${libelle}" est déjà utilisé.` };

      run(
        `UPDATE annees_scolaires
         SET libelle = ?, date_debut = ?, date_fin = ?, archived = ?
         WHERE id = ?`,
        [libelle.trim(), date_debut || null, date_fin || null, archived ? 1 : 0, aid]
      );

      // Si c'est l'année active, on met aussi à jour le libellé du bulletin
      const annee = get(`SELECT active FROM annees_scolaires WHERE id = ?`, [aid]);
      if (annee && annee.active) {
        try {
          run(`UPDATE bulletin_config SET valeur = ? WHERE cle = 'annee_scolaire'`, [libelle.trim()]);
        } catch (e) {
          logger.warn('Erreur synchronisation bulletin_config (update):', e.message);
        }
      }

      await logAudit(getCurrentUserId(), 'UPDATE_ANNEE_SCOLAIRE', `Année modifiée : ${libelle}`);
      return { success: true };
    } catch (err) {
      logger.error('Erreur updateAnneeScolaire:', err);
      return { error: err.message };
    }
  });

  // ----------------------------------------------------------
  // db:deleteAnneeScolaire — suppression ou archivage
  // Refuse la suppression si l'année est active ou contient des données.
  // ----------------------------------------------------------
  ipcMain.handle('db:deleteAnneeScolaire', async (_event, { id, forceArchive = false }) => {
    if (!(await checkAdmin())) return { error: 'Accès non autorisé' };
    try {
      const aid = parseInt(id);
      if (isNaN(aid)) return { error: 'ID invalide.' };

      const annee = get(`SELECT * FROM annees_scolaires WHERE id = ?`, [aid]);
      if (!annee) return { error: 'Année introuvable.' };

      if (annee.active) {
        return { error: 'Impossible de supprimer l\'année active. Activez une autre année d\'abord.' };
      }

      // Vérifier si des données y sont liées
      const c1 = get(`SELECT COUNT(*) as n FROM eleves   WHERE annee_scolaire_id = ?`, [aid]);
      const c2 = get(`SELECT COUNT(*) as n FROM notes     WHERE annee_scolaire_id = ?`, [aid]);
      const c3 = get(`SELECT COUNT(*) as n FROM paiements WHERE annee_scolaire_id = ?`, [aid]);
      
      const hasData = (c1?.n || 0) > 0 || (c2?.n || 0) > 0 || (c3?.n || 0) > 0;

      if (hasData && !forceArchive) {
        // Des données existent → archiver plutôt que supprimer
        run(`UPDATE annees_scolaires SET archived = 1 WHERE id = ?`, [aid]);
        await logAudit(getCurrentUserId(), 'ARCHIVE_ANNEE_SCOLAIRE', `Année archivée : ${annee.libelle}`);
        return { success: true, archived: true, message: `L'année "${annee.libelle}" a été archivée (des données y sont liées).` };
      }

      // Suppression physique si aucune donnée ou si forceArchive = false (pas de données)
      run(`DELETE FROM annees_scolaires WHERE id = ?`, [aid]);
      await logAudit(getCurrentUserId(), 'DELETE_ANNEE_SCOLAIRE', `Année supprimée : ${annee.libelle}`);
      return { success: true, archived: false };
    } catch (err) {
      logger.error('Erreur deleteAnneeScolaire:', err);
      return { error: err.message };
    }
  });

  // ----------------------------------------------------------
  // db:deleteAnneeScolaireDefinitive — Suppression TOTALE
  // Supprime l'année ET toutes les données rattachées (élèves, notes, etc.)
  // ----------------------------------------------------------
  ipcMain.handle('db:deleteAnneeScolaireDefinitive', async (_event, { id }) => {
    if (!(await checkAdmin())) return { error: 'Accès non autorisé' };
    try {
      const aid = parseInt(id);
      if (isNaN(aid)) return { error: 'ID invalide.' };
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';

      const annee = get(`SELECT * FROM annees_scolaires WHERE id = ?`, [aid]);
      if (!annee) return { error: 'Année introuvable.' };

      if (annee.active) {
        return { error: 'Impossible de supprimer l\'année active.' };
      }

      run(`BEGIN TRANSACTION`);
      try {
        const tables = [
          'notes', 'absences', 'sanctions', 'paiement_tranches', 'paiements', 
          'tranches', 'heures_absence', 'eleves', 'frais_types', 'imports'
        ];
        
        let totalDeleted = 0;
        for (const table of tables) {
          try {
            if (table === 'paiement_tranches') {
              run(`DELETE FROM paiement_tranches WHERE paiement_id IN (SELECT id FROM paiements WHERE annee_scolaire_id = ? AND ecole_id = ?)`, [aid, ecoleId]);
            } else {
              const res = run(`DELETE FROM ${table} WHERE annee_scolaire_id = ? AND ecole_id = ?`, [aid, ecoleId]);
              totalDeleted += res.changes || 0;
            }
          } catch (e) {
            // Table ou colonne absente, on ignore
          }
        }

        run(`DELETE FROM annees_scolaires WHERE id = ?`, [aid]);
        run(`COMMIT`);

        await logAudit(
          getCurrentUserId(), 
          'DELETE_ANNEE_SCOLAIRE_DEFINITIVE', 
          `Année supprimée définitivement : ${annee.libelle} (Total lignes supprimées : ${totalDeleted})`
        );
        logger.warn(`ANNÉE SUPPRIMÉE DÉFINITIVEMENT : ${annee.libelle} (id=${aid})`);
        
        return { success: true, totalDeleted };
      } catch (err) {
        run(`ROLLBACK`);
        throw err;
      }
    } catch (err) {
      logger.error('Erreur deleteAnneeScolaireDefinitive:', err);
      return { error: err.message };
    }
  });

  // ----------------------------------------------------------
  // db:setAnneeActive — change l'année active
  // Met à jour currentAnneeId dans le state global.
  // ----------------------------------------------------------
  ipcMain.handle('db:setAnneeActive', async (_event, { id }) => {
    if (!(await checkAdmin())) return { error: 'Accès non autorisé' };
    try {
      const aid = parseInt(id);
      if (isNaN(aid)) return { error: 'ID invalide.' };

      const annee = get(`SELECT * FROM annees_scolaires WHERE id = ?`, [aid]);
      if (!annee) return { error: 'Année introuvable.' };

      // Désactiver toutes les années puis activer la cible
      run(`UPDATE annees_scolaires SET active = 0`);
      run(`UPDATE annees_scolaires SET active = 1 WHERE id = ?`, [aid]);

      // Mettre à jour l'état global
      setCurrentAnneeId(aid);

      // SYNCHRONISATION : Mettre à jour l'affichage sur les bulletins et reçus
      try {
        run(`UPDATE bulletin_config SET valeur = ? WHERE cle = 'annee_scolaire'`, [annee.libelle]);
        logger.info(`Synchronisation bulletin_config.annee_scolaire → ${annee.libelle}`);
      } catch (e) {
        logger.warn('Erreur synchronisation bulletin_config:', e.message);
      }

      await logAudit(
        getCurrentUserId(),
        'SET_ANNEE_ACTIVE',
        `Année active : ${annee.libelle} (id=${aid})`
      );
      logger.info(`Année active changée → ${annee.libelle}`);

      return { success: true, libelle: annee.libelle, id: aid };
    } catch (err) {
      logger.error('Erreur setAnneeActive:', err);
      return { error: err.message };
    }
  });

  // ----------------------------------------------------------
  // db:migrateAnneeData — rattache les données orphelines à l'année par défaut
  // Utile si annee_scolaire_id est NULL sur certaines lignes.
  // ----------------------------------------------------------
  ipcMain.handle('db:migrateAnneeData', async (_event, { anneeId }) => {
    if (!(await checkAdmin())) return { error: 'Accès non autorisé' };
    try {
      const activeAnnee = get(`SELECT id FROM annees_scolaires WHERE active = 1 LIMIT 1`);
      const targetId = parseInt(anneeId) || activeAnnee?.id || 1;
      const tables   = ['eleves', 'notes', 'absences', 'sanctions', 'paiements', 'tranches', 'heures_absence', 'imports', 'frais_types', 'paiement_tranches'];
      let total = 0;
      for (const table of tables) {
        try {
          const result = run(
            `UPDATE ${table} SET annee_scolaire_id = ? WHERE annee_scolaire_id IS NULL`,
            [targetId]
          );
          total += result.changes || 0;
        } catch (_) { /* colonne absente = table ignorée */ }
      }
      logger.info(`Migration annee_scolaire_id : ${total} lignes mises à jour`);
      return { success: true, updated: total };
    } catch (err) {
      logger.error('Erreur migrateAnneeData:', err);
      return { error: err.message };
    }
  });

  // ----------------------------------------------------------
  // annees:preparerNouvelleAnnee — copie les élèves d'une année vers une autre
  // avec gestion du redoublement et des correspondances de classes.
  // ----------------------------------------------------------
  ipcMain.handle('annees:preparerNouvelleAnnee', async (_event, {
    sourceAnneeId, destAnneeId, mapping, seuilRedoublement = 10, redoublementActif = false
  }) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const sAid = parseInt(sourceAnneeId);
      const dAid = parseInt(destAnneeId);
      const source = get(`SELECT id FROM annees_scolaires WHERE id = ?`, [sAid]);
      const dest   = get(`SELECT id FROM annees_scolaires WHERE id = ?`, [dAid]);
      if (!source || !dest) return { success: false, error: 'Année source ou destination invalide.' };

      run(`BEGIN TRANSACTION`);
      let copies = 0, erreurs = 0;

      for (const [classeSourceId, config] of Object.entries(mapping)) {
        if (config.type === 'archive') continue;
        const classeDestId = parseInt(config.targetId);

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const eleves = all(
        `SELECT * FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
        [parseInt(classeSourceId), sAid, ecoleId]
      );

        for (const eleve of eleves) {
          let finalClasseId = classeDestId;

          if (redoublementActif) {
            const moyRow = get(
              `SELECT AVG(note) as moy FROM notes WHERE eleve_id = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
              [eleve.id, sAid, ecoleId]
            );
            const moy = moyRow?.moy || 0;
            if (moy < parseFloat(seuilRedoublement)) finalClasseId = parseInt(classeSourceId);
          }

          try {
            const ins = run(
             `INSERT INTO eleves
                (nom, prenom, sexe, matricule, date_naissance, classe_id, nom_parent,
                 telephone_parent, email_parent, photo, date_inscription, annee_scolaire_id, ecole_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
             [
               eleve.nom, eleve.prenom, eleve.sexe, eleve.matricule, eleve.date_naissance, finalClasseId,
               eleve.nom_parent, eleve.telephone_parent, eleve.email_parent,
               eleve.photo, dAid, ecoleId
             ]
            );
            const newEleveId = ins.lastID;

            // Copier les liens parents
            const parents = all(
              `SELECT parent_id FROM parents_eleves pe
               JOIN parents p ON pe.parent_id = p.id
               WHERE pe.eleve_id = ? AND p.ecole_id = ?`, [eleve.id, ecoleId]
            );
            for (const p of parents) {
              run(
                `INSERT OR IGNORE INTO parents_eleves (parent_id, eleve_id) VALUES (?, ?)`,
                [p.parent_id, newEleveId]
              );
            }
            copies++;
          } catch (e) {
            logger.warn(`preparerNouvelleAnnee: erreur élève ${eleve.id} — ${e.message}`);
            erreurs++;
          }
        }
      }

      run(`COMMIT`);
      await logAudit(
        getCurrentUserId(),
        'PREPARE_NOUVELLE_ANNEE',
        `Source ${sAid} → Dest ${dAid} : ${copies} copiés, ${erreurs} erreurs`
      );
      logger.info(`preparerNouvelleAnnee : ${copies} élèves copiés, ${erreurs} erreurs`);
      return { success: true, nbCopies: copies, nbErreurs: erreurs };
    } catch (err) {
      try { run(`ROLLBACK`); } catch (_) {}
      logger.error('Erreur annees:preparerNouvelleAnnee:', err);
      return { success: false, error: err.message };
    }
  });

}

module.exports = { register };
