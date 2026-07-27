/**
 * auth.js - Authentification avec bcrypt, protection brute force et rôles
 * Version adaptée pour better-sqlite3 (appels synchrones)
 */

const bcrypt = require('bcryptjs');
const { get, run, all } = require('../database/db'); // all est maintenant synchrone

const BCRYPT_ROUNDS = 10;

// ============================================================
// PROTECTION BRUTE FORCE (persistée en DB)
// ============================================================
const MAX_ATTEMPTS   = 5;
const BLOCK_DURATION = 5 * 60 * 1000;

function migrateLoginAttempts() {
  try {
    run(`CREATE TABLE IF NOT EXISTS login_attempts (
      username TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      first_attempt INTEGER NOT NULL,
      last_attempt INTEGER NOT NULL,
      PRIMARY KEY (username)
    )`);
  } catch (e) {
    /* table existe deja */
  }
}

function nettoyerAnciennesTentatives() {
  const seuil = Date.now() - BLOCK_DURATION;
  run('DELETE FROM login_attempts WHERE first_attempt < ?', [seuil]);
}

function isBlocked(username) {
  migrateLoginAttempts();
  nettoyerAnciennesTentatives();
  const row = get('SELECT count, first_attempt FROM login_attempts WHERE username = ?', [username]);
  if (!row) return false;
  return row.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(username) {
  migrateLoginAttempts();
  const now = Date.now();
  const row = get('SELECT count, first_attempt FROM login_attempts WHERE username = ?', [username]);
  if (!row) {
    run('INSERT INTO login_attempts (username, count, first_attempt, last_attempt) VALUES (?, 1, ?, ?)', [username, now, now]);
  } else {
    run('UPDATE login_attempts SET count = count + 1, last_attempt = ? WHERE username = ?', [now, username]);
  }
}

function resetAttempts(username) {
  migrateLoginAttempts();
  run('DELETE FROM login_attempts WHERE username = ?', [username]);
}

function getRemainingAttempts(username) {
  migrateLoginAttempts();
  nettoyerAnciennesTentatives();
  const row = get('SELECT count FROM login_attempts WHERE username = ?', [username]);
  if (!row) return MAX_ATTEMPTS;
  return Math.max(0, MAX_ATTEMPTS - row.count);
}

// ============================================================
// MIGRATION SILENCIEUSE — ajoute les colonnes si absentes (synchrone)
// ============================================================
function migrateUtilisateurs() {
  try {
    // Vérifier si les colonnes existent déjà
    const cols = all(`PRAGMA table_info(utilisateurs)`);
    const colNames = cols.map(c => c.name);

    if (!colNames.includes('role')) {
      run(`ALTER TABLE utilisateurs ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'`);
    }
    if (!colNames.includes('nom_complet')) {
      run(`ALTER TABLE utilisateurs ADD COLUMN nom_complet TEXT DEFAULT ''`);
    }
    if (!colNames.includes('matieres_ids')) {
      run(`ALTER TABLE utilisateurs ADD COLUMN matieres_ids TEXT DEFAULT '[]'`);
    }
    if (!colNames.includes('classes_ids')) {
      run(`ALTER TABLE utilisateurs ADD COLUMN classes_ids TEXT DEFAULT '[]'`);
    }
    if (!colNames.includes('actif')) {
      run(`ALTER TABLE utilisateurs ADD COLUMN actif INTEGER DEFAULT 1`);
    }

    // Vérifier la contrainte CHECK (SQLite Master)
    const tableInfo = get("SELECT sql FROM sqlite_master WHERE type='table' AND name='utilisateurs'");
    if (tableInfo && !tableInfo.sql.includes('comptable')) {
      console.log('🔄 Migration (Auth): Mise à jour de la contrainte CHECK des rôles...');
      // Note: better-sqlite3 handles transactions via db.transaction, but here we use direct SQL
      // On utilise une approche simplifiée car on est déjà dans une phase d'initialisation
      run("ALTER TABLE utilisateurs RENAME TO utilisateurs_old_auth");
      run(`
        CREATE TABLE utilisateurs (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          nom_utilisateur      TEXT UNIQUE NOT NULL,
          mot_de_passe_hash    TEXT NOT NULL,
          question_secrete     TEXT,
          reponse_hash         TEXT,
          role                 TEXT NOT NULL DEFAULT 'admin'
                               CHECK(role IN ('admin', 'enseignant', 'secretaire', 'comptable')),
          nom_complet          TEXT DEFAULT '',
          matieres_ids         TEXT DEFAULT '[]',
          classes_ids          TEXT DEFAULT '[]',
          actif                INTEGER DEFAULT 1,
          date_creation        TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      run(`
        INSERT INTO utilisateurs (id, nom_utilisateur, mot_de_passe_hash, question_secrete, reponse_hash, role, nom_complet, matieres_ids, classes_ids, actif, date_creation)
        SELECT id, nom_utilisateur, mot_de_passe_hash, question_secrete, reponse_hash, role, nom_complet, matieres_ids, classes_ids, actif, date_creation 
        FROM utilisateurs_old_auth
      `);
      run("DROP TABLE utilisateurs_old_auth");
      console.log('✅ Migration (Auth) terminée');
    }
  } catch (e) {
    console.warn('Migration utilisateurs:', e.message);
  }
}

// ============================================================
// FONCTIONS D'AUTHENTIFICATION
// ============================================================

async function isFirstLaunch() {
  try {
    migrateUtilisateurs();
    const row = get('SELECT COUNT(*) as count FROM utilisateurs');
    return (row?.count || 0) === 0;
  } catch {
    return true;
  }
}

async function createAdmin(username, password, questionSecrete = null, reponseSecrete = null, ecoleId = '') {
  try {
    migrateUtilisateurs();

    if (!username || username.trim().length < 3)
      return { success: false, error: "Le nom d'utilisateur doit avoir au moins 3 caractères" };
    if (!password || password.length < 6)
      return { success: false, error: 'Le mot de passe doit avoir au moins 6 caractères' };

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let reponseHash = null;
    if (questionSecrete && reponseSecrete && reponseSecrete.trim().length >= 2) {
      reponseHash = await bcrypt.hash(reponseSecrete.trim().toLowerCase(), BCRYPT_ROUNDS);
    }

    const result = run(
      `INSERT INTO utilisateurs
         (nom_utilisateur, mot_de_passe_hash, question_secrete, reponse_hash, role, nom_complet, actif, ecole_id)
       VALUES (?, ?, ?, ?, 'admin', ?, 1, ?)`,
      [username.trim(), hash, questionSecrete || null, reponseHash, username.trim(), ecoleId]
    );

    return {
      success: true,
      user: {
        id:             result.lastID,
        nom_utilisateur: username.trim(),
        nom_complet:    username.trim(),
        role:           'admin',
        matieres_ids:   [],
        classes_ids:    []
      }
    };
  } catch (error) {
    console.error('Erreur createAdmin:', error);
    if (error.message?.includes('UNIQUE'))
      return { success: false, error: "Ce nom d'utilisateur existe déjà" };
    return { success: false, error: 'Erreur : ' + error.message };
  }
}

async function login(username, password, ecoleId = '') {
  try {
    migrateUtilisateurs();

    if (!username || !password)
      return { success: false, error: 'Identifiants manquants' };

    if (isBlocked(username))
      return { success: false, error: 'Trop de tentatives. Compte bloqué 5 minutes.' };

    const user = get(
      `SELECT id, nom_utilisateur, mot_de_passe_hash,
              role, nom_complet, matieres_ids, classes_ids, actif
       FROM utilisateurs WHERE nom_utilisateur = ? AND ecole_id = ?`,
      [username.trim(), ecoleId]
    );

    if (!user) {
      await bcrypt.hash(password, BCRYPT_ROUNDS); // anti-timing
      recordFailedAttempt(username);
      return { success: false, error: 'Identifiants incorrects' };
    }

    if (!user.actif) {
      return { success: false, error: 'Ce compte est désactivé. Contactez votre administrateur.' };
    }

    if (user.role === 'enseignant' || user.role === 'secretaire') {
      return { success: false, error: "Connexion impossible : Ce rôle n'est pas autorisé sur l'application de bureau." };
    }

    const isValid = await bcrypt.compare(password, user.mot_de_passe_hash);
    if (!isValid) {
      recordFailedAttempt(username);
      return { success: false, error: 'Identifiants incorrects' };
    }

    resetAttempts(username);

    // Parser les JSON
    let matieresIds = [];
    let classesIds  = [];
    try { matieresIds = JSON.parse(user.matieres_ids || '[]'); } catch {}
    try { classesIds  = JSON.parse(user.classes_ids  || '[]'); } catch {}

    return {
      success: true,
      user: {
        id:             user.id,
        nom_utilisateur: user.nom_utilisateur,
        nom_complet:    user.nom_complet || user.nom_utilisateur,
        role:           user.role || 'admin',
        matieres_ids:   matieresIds,
        classes_ids:    classesIds
      }
    };
  } catch (error) {
    console.error('Erreur login:', error);
    return { success: false, error: 'Erreur : ' + error.message };
  }
}

async function getQuestionSecrete(username, ecoleId = '') {
  try {
    if (!username?.trim())
      return { success: false, error: "Nom d'utilisateur manquant" };
    const user = get(
      'SELECT id, question_secrete FROM utilisateurs WHERE nom_utilisateur = ? AND ecole_id = ?',
      [username.trim(), ecoleId]
    );
    if (!user || !user.question_secrete)
      return { success: false, error: "Aucune question secrète configurée" };
    return { success: true, question: user.question_secrete };
  } catch (error) {
    return { success: false, error: 'Erreur : ' + error.message };
  }
}

async function reinitialiserMotDePasse(username, reponseSecrete, nouveauMotDePasse, ecoleId = '') {
  try {
    if (!username || !reponseSecrete || !nouveauMotDePasse)
      return { success: false, error: 'Tous les champs sont requis' };
    if (nouveauMotDePasse.length < 6)
      return { success: false, error: 'Le nouveau mot de passe doit avoir au moins 6 caractères' };

    const user = get(
      'SELECT id, reponse_hash FROM utilisateurs WHERE nom_utilisateur = ? AND ecole_id = ?',
      [username.trim(), ecoleId]
    );
    if (!user || !user.reponse_hash) {
      await bcrypt.hash(reponseSecrete, BCRYPT_ROUNDS);
      return { success: false, error: 'Impossible de réinitialiser le mot de passe' };
    }

    const ok = await bcrypt.compare(reponseSecrete.trim().toLowerCase(), user.reponse_hash);
    if (!ok) return { success: false, error: 'Réponse incorrecte' };

    const hash = await bcrypt.hash(nouveauMotDePasse, BCRYPT_ROUNDS);
    run('UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE id = ?', [hash, user.id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Erreur : ' + error.message };
  }
}

// ============================================================
// GESTION DES UTILISATEURS (admin seulement)
// ============================================================

function getUtilisateurs(ecoleId = '') {
  try {
    migrateUtilisateurs();
    const rows = all(
      `SELECT id, nom_utilisateur, nom_complet, role, matieres_ids, classes_ids, actif, date_creation
       FROM utilisateurs WHERE ecole_id = ? ORDER BY role, nom_utilisateur`,
      [ecoleId]
    );
    return rows.map(r => ({
      ...r,
      matieres_ids: (() => { try { return JSON.parse(r.matieres_ids || '[]'); } catch { return []; } })(),
      classes_ids:  (() => { try { return JSON.parse(r.classes_ids  || '[]'); } catch { return []; } })()
    }));
  } catch (error) {
    console.error('Erreur getUtilisateurs:', error);
    return [];
  }
}

async function createUtilisateur(data) {
  try {
    migrateUtilisateurs();

    const { nom_utilisateur, mot_de_passe, role, nom_complet, matieres_ids, classes_ids, telephone, ecole_id } = data;

    if (!nom_utilisateur || nom_utilisateur.trim().length < 3)
      return { success: false, error: "Nom d'utilisateur trop court (min 3 caractères)" };
    if (!mot_de_passe || mot_de_passe.length < 6)
      return { success: false, error: 'Mot de passe trop court (min 6 caractères)' };
    if (!['admin', 'enseignant', 'secretaire', 'comptable'].includes(role))
      return { success: false, error: 'Rôle invalide' };

    const hash = await bcrypt.hash(mot_de_passe, BCRYPT_ROUNDS);
    const result = run(
      `INSERT INTO utilisateurs
         (nom_utilisateur, mot_de_passe_hash, role, nom_complet, matieres_ids, classes_ids, actif, telephone, ecole_id)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        nom_utilisateur.trim(),
        hash,
        role,
        (nom_complet || nom_utilisateur).trim(),
        JSON.stringify(matieres_ids || []),
        JSON.stringify(classes_ids  || []),
        telephone || null,
        ecole_id || ''
      ]
    );
    return { success: true, id: result.lastID };
  } catch (error) {
    if (error.message?.includes('UNIQUE'))
      return { success: false, error: "Ce nom d'utilisateur existe déjà" };
    return { success: false, error: 'Erreur : ' + error.message };
  }
}

async function updateUtilisateur(id, data, ecoleId = '') {
  try {
    migrateUtilisateurs();

    const { nom_complet, role, matieres_ids, classes_ids, actif, mot_de_passe } = data;

    if (!['admin', 'enseignant', 'secretaire', 'comptable'].includes(role))
      return { success: false, error: 'Rôle invalide' };

    if (mot_de_passe && mot_de_passe.trim()) {
      if (mot_de_passe.length < 6)
        return { success: false, error: 'Mot de passe trop court (min 6 caractères)' };
      const hash = await bcrypt.hash(mot_de_passe, BCRYPT_ROUNDS);
      run(
        `UPDATE utilisateurs
         SET nom_complet=?, role=?, matieres_ids=?, classes_ids=?, actif=?, mot_de_passe_hash=?
         WHERE id=? AND ecole_id=?`,
        [
          (nom_complet || '').trim(),
          role,
          JSON.stringify(matieres_ids || []),
          JSON.stringify(classes_ids  || []),
          actif ? 1 : 0,
          hash,
          id,
          ecoleId
        ]
      );
    } else {
      run(
        `UPDATE utilisateurs
         SET nom_complet=?, role=?, matieres_ids=?, classes_ids=?, actif=?
         WHERE id=? AND ecole_id=?`,
        [
          (nom_complet || '').trim(),
          role,
          JSON.stringify(matieres_ids || []),
          JSON.stringify(classes_ids  || []),
          actif ? 1 : 0,
          id,
          ecoleId
        ]
      );
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Erreur : ' + error.message };
  }
}

async function deleteUtilisateur(id, ecoleId = '') {
  try {
    const admins = all(
      `SELECT id FROM utilisateurs WHERE role = 'admin' AND actif = 1 AND id != ? AND ecole_id = ?`,
      [id, ecoleId]
    );
    const cible = get(`SELECT role FROM utilisateurs WHERE id = ? AND ecole_id = ?`, [id, ecoleId]);
    if (cible?.role === 'admin' && admins.length === 0) {
      return { success: false, error: 'Impossible de supprimer le dernier administrateur actif' };
    }
    run('DELETE FROM utilisateurs WHERE id = ? AND ecole_id = ?', [id, ecoleId]);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Erreur : ' + error.message };
  }
}

module.exports = {
  isFirstLaunch,
  createAdmin,
  login,
  getQuestionSecrete,
  reinitialiserMotDePasse,
  getUtilisateurs,
  createUtilisateur,
  updateUtilisateur,
  deleteUtilisateur,
  migrateUtilisateurs
};

