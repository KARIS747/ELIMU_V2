/**
 * db.js - Gestionnaire de base de données avec better-sqlite3
 * Version synchrone (plus simple et plus rapide)
 * OPTIMISÉE POUR LE DÉMARRAGE
 */

const path = require('path');
const fs = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
  console.log('✅ Module better-sqlite3 chargé avec succès');
} catch (err) {
  console.error('❌ Erreur de chargement du module better-sqlite3:', err.message);
  throw err;
}

let db = null;
let dbPath = null;
let lastWriteTimestamp = Date.now();

const CURRENT_SCHEMA_VERSION = 121; // Version 1.2.1 (pwa_login_history)

/**
 * Initialise la base de données et applique le schéma
 * @param {string} customPath - Chemin personnalisé pour la base (optionnel)
 */
async function initializeDatabase(customPath = null) {
  // Déterminer le chemin de la base
  if (customPath) {
    dbPath = customPath;
  } else {
    dbPath = path.join(__dirname, '../../../database/elimu.db');
  }

  // Créer le dossier si nécessaire
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`📁 Initialisation de la base de données sécurisée à : ${dbPath}`);

  // Ouvrir la base de données
  try {
    db = new Database(dbPath);
    
    // Vérifier si la base est accessible
    db.prepare('SELECT count(*) FROM sqlite_master').get();
  } catch (err) {
    console.error('❌ Erreur critique de base de données :', err.message);
    throw new Error('Impossible d\'ouvrir la base de données. Vérifiez l\'intégrité du fichier.');
  }

  // Optimisations de performance
  db.pragma('cache_size = -32000');      // 32MB de cache
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');    // 256MB memory-mapped I/O
  db.pragma('synchronous = NORMAL');
  db.pragma('journal_mode = WAL');       // Write-Ahead Logging

  // --- OPTIMISATION : Vérification de la version du schéma ---
  let installedVersion = 0;
  try {
    const row = db.prepare("SELECT valeur FROM parametres WHERE cle = 'schema_version'").get();
    if (row) installedVersion = parseInt(row.valeur);
  } catch (e) {
    // La table parametres n'existe peut-être pas encore
  }

  if (installedVersion >= CURRENT_SCHEMA_VERSION) {
    console.log(`🚀 Base de données déjà à jour (v${installedVersion}).`);
    return db;
  }

  console.log(`🔄 Mise à jour du schéma (v${installedVersion} -> v${CURRENT_SCHEMA_VERSION})...`);

  // Lire et appliquer le schéma
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Exécuter le schéma complet d'un bloc (plus rapide)
  try {
    db.exec(schema);
  } catch (err) {
    console.warn(`Note sur l'exécution du schéma: ${err.message}`);
  }

  // Migrations silencieuses (ajout de colonnes si absentes)
  const migrations = [
    "ALTER TABLE utilisateurs ADD COLUMN question_secrete TEXT",
    "ALTER TABLE utilisateurs ADD COLUMN reponse_hash TEXT",
    "ALTER TABLE absences ADD COLUMN periode TEXT DEFAULT 'Trimestre 1'",
    "ALTER TABLE sanctions ADD COLUMN periode TEXT DEFAULT 'Trimestre 1'",
    "ALTER TABLE tranches ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE paiements ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE frais_types ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE paiement_tranches ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE heures_absence ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE absences ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE sanctions ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE imports ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE eleves ADD COLUMN sexe TEXT CHECK(sexe IN ('M', 'F'))",
    "ALTER TABLE eleves ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE notes ADD COLUMN annee_scolaire_id INTEGER",
    "ALTER TABLE notes ADD COLUMN ua TEXT",
    "ALTER TABLE notes ADD COLUMN sous_competence_code TEXT",
    "ALTER TABLE notes ADD COLUMN type_eval TEXT",
    "ALTER TABLE notes ADD COLUMN source TEXT DEFAULT 'DESKTOP'",
    "UPDATE eleves SET sexe = 'M' WHERE sexe IS NULL OR sexe = ''",
    "ALTER TABLE classes ADD COLUMN systeme_educatif TEXT DEFAULT 'francophone' CHECK(systeme_educatif IN ('francophone', 'anglophone'))",
    "ALTER TABLE classes ADD COLUMN niveau_v2 TEXT",
    "UPDATE classes SET systeme_educatif = 'francophone' WHERE systeme_educatif IS NULL",
    "CREATE TABLE IF NOT EXISTS stats_eleves (eleve_id INTEGER, annee_scolaire_id INTEGER, periode TEXT, sequence INTEGER, moyenne REAL, moyenne_generale REAL, total_notes INTEGER, last_updated TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(eleve_id, annee_scolaire_id, periode, sequence), FOREIGN KEY(eleve_id) REFERENCES eleves(id) ON DELETE CASCADE)",
    "INSERT OR IGNORE INTO stats_eleves (eleve_id, annee_scolaire_id, periode, sequence, moyenne, total_notes) SELECT eleve_id, annee_scolaire_id, periode, sequence, ROUND(AVG(note), 2), COUNT(*) FROM notes WHERE sous_type IS NULL GROUP BY eleve_id, annee_scolaire_id, periode, sequence",
    `CREATE TRIGGER IF NOT EXISTS trg_update_stats_after_insert AFTER INSERT ON notes 
     BEGIN
       INSERT INTO stats_eleves (eleve_id, annee_scolaire_id, periode, sequence, moyenne, total_notes, last_updated)
       VALUES (NEW.eleve_id, NEW.annee_scolaire_id, NEW.periode, NEW.sequence, NEW.note, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(eleve_id, annee_scolaire_id, periode, sequence) DO UPDATE SET
         moyenne = (SELECT ROUND(AVG(note), 2) FROM notes WHERE eleve_id = NEW.eleve_id AND annee_scolaire_id = NEW.annee_scolaire_id AND periode = NEW.periode AND sequence = NEW.sequence AND sous_type IS NULL),
         total_notes = (SELECT COUNT(*) FROM notes WHERE eleve_id = NEW.eleve_id AND annee_scolaire_id = NEW.annee_scolaire_id AND periode = NEW.periode AND sequence = NEW.sequence AND sous_type IS NULL),
         last_updated = CURRENT_TIMESTAMP;
       
       UPDATE stats_eleves SET 
         moyenne_generale = (SELECT ROUND(SUM(n.note * COALESCE(m.coefficient, 1.0)) / SUM(COALESCE(m.coefficient, 1.0)), 2) FROM notes n LEFT JOIN matieres m ON n.matiere_id = m.id WHERE n.eleve_id = NEW.eleve_id AND n.annee_scolaire_id = NEW.annee_scolaire_id AND n.sous_type IS NULL)
       WHERE eleve_id = NEW.eleve_id AND annee_scolaire_id = NEW.annee_scolaire_id;
     END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_update_stats_after_update AFTER UPDATE ON notes 
     BEGIN
       UPDATE stats_eleves SET
         moyenne = (SELECT ROUND(AVG(note), 2) FROM notes WHERE eleve_id = NEW.eleve_id AND annee_scolaire_id = NEW.annee_scolaire_id AND periode = NEW.periode AND sequence = NEW.sequence AND sous_type IS NULL),
         total_notes = (SELECT COUNT(*) FROM notes WHERE eleve_id = NEW.eleve_id AND annee_scolaire_id = NEW.annee_scolaire_id AND periode = NEW.periode AND sequence = NEW.sequence AND sous_type IS NULL),
         last_updated = CURRENT_TIMESTAMP
       WHERE eleve_id = NEW.eleve_id AND annee_scolaire_id = NEW.annee_scolaire_id AND periode = NEW.periode AND sequence = NEW.sequence;

       UPDATE stats_eleves SET 
         moyenne_generale = (SELECT ROUND(SUM(n.note * COALESCE(m.coefficient, 1.0)) / SUM(COALESCE(m.coefficient, 1.0)), 2) FROM notes n LEFT JOIN matieres m ON n.matiere_id = m.id WHERE n.eleve_id = NEW.eleve_id AND n.annee_scolaire_id = NEW.annee_scolaire_id AND n.sous_type IS NULL)
       WHERE eleve_id = NEW.eleve_id AND annee_scolaire_id = NEW.annee_scolaire_id;
     END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_update_stats_after_delete AFTER DELETE ON notes 
     BEGIN
       UPDATE stats_eleves SET
         moyenne = (SELECT ROUND(AVG(note), 2) FROM notes WHERE eleve_id = OLD.eleve_id AND annee_scolaire_id = OLD.annee_scolaire_id AND periode = OLD.periode AND sequence = OLD.sequence AND sous_type IS NULL),
         total_notes = (SELECT COUNT(*) FROM notes WHERE eleve_id = OLD.eleve_id AND annee_scolaire_id = OLD.annee_scolaire_id AND periode = OLD.periode AND sequence = OLD.sequence AND sous_type IS NULL),
         last_updated = CURRENT_TIMESTAMP
       WHERE eleve_id = OLD.eleve_id AND annee_scolaire_id = OLD.annee_scolaire_id AND periode = OLD.periode AND sequence = OLD.sequence;

       UPDATE stats_eleves SET 
         moyenne_generale = (SELECT ROUND(SUM(n.note * COALESCE(m.coefficient, 1.0)) / SUM(COALESCE(m.coefficient, 1.0)), 2) FROM notes n LEFT JOIN matieres m ON n.matiere_id = m.id WHERE n.eleve_id = OLD.eleve_id AND n.annee_scolaire_id = OLD.annee_scolaire_id AND n.sous_type IS NULL)
       WHERE eleve_id = OLD.eleve_id AND annee_scolaire_id = OLD.annee_scolaire_id;
     END;`,
    "CREATE INDEX IF NOT EXISTS idx_eleves_nom_prenom ON eleves(nom COLLATE NOCASE, prenom COLLATE NOCASE)",
    "CREATE INDEX IF NOT EXISTS idx_parents_nom_parent ON parents(nom_parent COLLATE NOCASE)",
    "CREATE INDEX IF NOT EXISTS idx_paiements_annee_scolaire ON paiements(annee_scolaire_id)",
    "CREATE INDEX IF NOT EXISTS idx_tranches_annee_scolaire ON tranches(annee_scolaire_id)",
    "CREATE INDEX IF NOT EXISTS idx_eleves_annee_classe ON eleves(annee_scolaire_id, classe_id)",
    "CREATE INDEX IF NOT EXISTS idx_eleves_sexe ON eleves(sexe)",
    "CREATE INDEX IF NOT EXISTS idx_heures_absence_annee_periode ON heures_absence(annee_scolaire_id, periode)",
    "CREATE INDEX IF NOT EXISTS idx_notes_stats ON notes(annee_scolaire_id, periode, sequence, eleve_id)",
    "UPDATE frais_types SET annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1 LIMIT 1) WHERE annee_scolaire_id IS NULL AND (SELECT COUNT(*) FROM annees_scolaires WHERE active = 1) > 0",
    "UPDATE paiement_tranches SET annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1 LIMIT 1) WHERE annee_scolaire_id IS NULL AND (SELECT COUNT(*) FROM annees_scolaires WHERE active = 1) > 0",
    "UPDATE imports SET annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1 LIMIT 1) WHERE annee_scolaire_id IS NULL AND (SELECT COUNT(*) FROM annees_scolaires WHERE active = 1) > 0",
    // ── Migrations multi-école (ecole_id) ──
    "CREATE TABLE IF NOT EXISTS ecoles (ecole_id TEXT PRIMARY KEY, nom TEXT NOT NULL, cle_api_portail TEXT, cle_pwa_sync TEXT, config TEXT DEFAULT '{}', date_creation TEXT DEFAULT CURRENT_TIMESTAMP)",
    "ALTER TABLE utilisateurs ADD COLUMN telephone TEXT",
    "ALTER TABLE utilisateurs ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE professeurs ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE classes ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE parents ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE eleves ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE notes ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE absences ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE sanctions ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE imports ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE audit_log ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE heures_absence ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE frais_types ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE tranches ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE paiements ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE paiement_tranches ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE parents_eleves ADD COLUMN ecole_id TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_parents_eleves_ecole ON parents_eleves(ecole_id)",
    "CREATE INDEX IF NOT EXISTS idx_professeurs_ecole ON professeurs(ecole_id)",
    "CREATE INDEX IF NOT EXISTS idx_classes_ecole ON classes(ecole_id)",
    "CREATE INDEX IF NOT EXISTS idx_eleves_ecole ON eleves(ecole_id)",
    "CREATE INDEX IF NOT EXISTS idx_notes_ecole ON notes(ecole_id)",
    "CREATE INDEX IF NOT EXISTS idx_absences_ecole ON absences(ecole_id)",
    "CREATE INDEX IF NOT EXISTS idx_parents_ecole ON parents(ecole_id)",
    // ── Migration: table professeurs_classes manquante ──
    "CREATE TABLE IF NOT EXISTS professeurs_classes (professeur_id INTEGER NOT NULL, classe_id INTEGER NOT NULL, PRIMARY KEY(professeur_id,classe_id), FOREIGN KEY(professeur_id) REFERENCES professeurs(id) ON DELETE CASCADE, FOREIGN KEY(classe_id) REFERENCES classes(id) ON DELETE CASCADE)",
    // ── Migration: historique connexions PWA ──
    "CREATE TABLE IF NOT EXISTS pwa_login_history (id INTEGER PRIMARY KEY AUTOINCREMENT, professeur_id INTEGER NOT NULL REFERENCES professeurs(id) ON DELETE CASCADE, date_connexion TEXT NOT NULL, details TEXT DEFAULT '', ecole_id TEXT NOT NULL DEFAULT '')"
  ];
  for (const m of migrations) {
    try { db.exec(m); } catch(e) { /* colonne existe déjà */ }
  }

  // Migration pour rendre la table notes hybride (matiere_id et sequence optionnels pour N1/N2)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(notes)").all();
    const hasUa = tableInfo.some(c => c.name === 'ua');
    const isMatiereNotNull = tableInfo.find(c => c.name === 'matiere_id')?.notnull === 1;

    if (!hasUa || isMatiereNotNull) {
      console.log('🔄 Migration : Remplacement de la table notes par un schéma hybride...');
      db.transaction(() => {
        db.exec("ALTER TABLE notes RENAME TO notes_old");
        db.exec(`
          CREATE TABLE notes (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            eleve_id             INTEGER NOT NULL,
            matiere_id           INTEGER, -- Optionnel pour N1/N2
            note                 REAL NOT NULL CHECK(note >= 0),
            periode              TEXT DEFAULT 'Trimestre 1',
            sequence             INTEGER, -- Optionnel pour N1/N2
            date_import          TEXT DEFAULT CURRENT_TIMESTAMP,
            import_id            INTEGER,
            annee_scolaire_id    INTEGER,
            ua                   TEXT,
            sous_competence_code TEXT,
            type_eval            TEXT,
            source               TEXT DEFAULT 'DESKTOP',
            ecole_id             TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(eleve_id)   REFERENCES eleves(id)   ON DELETE CASCADE,
            FOREIGN KEY(matiere_id) REFERENCES matieres(id) ON DELETE CASCADE,
            FOREIGN KEY(import_id)  REFERENCES imports(id)  ON DELETE SET NULL,
            UNIQUE(eleve_id, matiere_id, periode, sequence, annee_scolaire_id)
          )
        `);
        
        const oldCols = db.prepare("PRAGMA table_info(notes_old)").all().map(c => c.name);
        const intersectCols = oldCols.filter(c => c !== 'id');
        const colsToCopy = ['id', ...intersectCols].join(', ');
        
        db.exec(`INSERT INTO notes (${colsToCopy}) SELECT ${colsToCopy} FROM notes_old`);
        db.exec("DROP TABLE notes_old");
        console.log('✅ Table notes migrée avec succès vers le format hybride !');
      })();
    }
  } catch (err) {
    console.warn(`Note sur la migration de la table notes: ${err.message}`);
  }

  // Migration : ajout colonnes utilisateur_id et derniere_connexion à professeurs
  try {
    const profCols = db.prepare("PRAGMA table_info(professeurs)").all().map(c => c.name);
    if (!profCols.includes('utilisateur_id')) {
      db.exec("ALTER TABLE professeurs ADD COLUMN utilisateur_id INTEGER UNIQUE REFERENCES utilisateurs(id) ON DELETE SET NULL");
    }
    if (!profCols.includes('derniere_connexion')) {
      db.exec("ALTER TABLE professeurs ADD COLUMN derniere_connexion TEXT");
    }
    // Supprimer les colonnes RH qui ne sont plus utilisées
    const oldRhCols = ['civilite', 'sexe', 'specialite', 'diplome_max', 'adresse', 'ville', 'date_embauche'];
    // Note: SQLite ne supporte pas DROP COLUMN facilement, on les ignore simplement
  } catch (e) { /* déjà présentes ou ignorées */ }

  // Migration : ajout colonne sous_type pour les sous-notes (orale/écrite/pratique/savoir-être)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(notes)").all();
    if (!tableInfo.some(c => c.name === 'sous_type')) {
      console.log('🔄 Migration : Ajout de sous_type à la table notes...');
      db.exec("ALTER TABLE notes ADD COLUMN sous_type TEXT CHECK(sous_type IN ('orale','ecrite','pratique','savoirEtre'))");
      console.log('✅ Colonne sous_type ajoutée');
    }
  } catch (err) {
    console.warn(`Note sur la migration sous_type: ${err.message}`);
  }

  // Migration spécifique pour la contrainte CHECK du rôle comptable
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='utilisateurs'").get();
    if (tableInfo && !tableInfo.sql.includes('comptable')) {
      console.log('🔄 Migration : Mise à jour de la contrainte CHECK des rôles...');
      
      const cols = db.prepare("PRAGMA table_info(utilisateurs)").all().map(c => c.name);
      let reponseCol = 'NULL';
      if (cols.includes('reponse_hash')) reponseCol = 'reponse_hash';
      else if (cols.includes('reponse_secrete_hash')) reponseCol = 'reponse_secrete_hash';

      db.transaction(() => {
        db.exec("ALTER TABLE utilisateurs RENAME TO utilisateurs_old");
        db.exec(`
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
        db.exec(`
          INSERT INTO utilisateurs (id, nom_utilisateur, mot_de_passe_hash, question_secrete, reponse_hash, role, nom_complet, matieres_ids, classes_ids, actif, date_creation)
          SELECT id, nom_utilisateur, mot_de_passe_hash, question_secrete, ${reponseCol}, role, nom_complet, matieres_ids, classes_ids, actif, date_creation 
          FROM utilisateurs_old
        `);
        db.exec("DROP TABLE utilisateurs_old");
      })();
    }
  } catch (err) {
    console.warn(`Note sur la migration: ${err.message}`);
  }

  // Migration : enlever CHECK(note<=20) sur la table notes (N1/N2 utilise l'echelle reelle)
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'").get();
    if (tableInfo && tableInfo.sql.includes('note <= 20')) {
      console.log('🔄 Migration : Mise à jour de la contrainte CHECK(note) sur notes...');
      db.transaction(() => {
        db.exec("ALTER TABLE notes RENAME TO notes_old");
        db.exec(`
          CREATE TABLE notes (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            eleve_id             INTEGER NOT NULL,
            matiere_id           INTEGER,
            note                 REAL NOT NULL CHECK(note >= 0),
            periode              TEXT DEFAULT 'Trimestre 1',
            sequence             INTEGER,
            date_import          TEXT DEFAULT CURRENT_TIMESTAMP,
            import_id            INTEGER,
            annee_scolaire_id    INTEGER,
            ua                   TEXT,
            sous_competence_code TEXT,
            type_eval            TEXT,
            sous_type            TEXT CHECK(sous_type IN ('orale','ecrite','pratique','savoirEtre')),
            source               TEXT DEFAULT 'DESKTOP',
            ecole_id             TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(eleve_id)   REFERENCES eleves(id)   ON DELETE CASCADE,
            FOREIGN KEY(matiere_id) REFERENCES matieres(id) ON DELETE CASCADE,
            FOREIGN KEY(import_id)  REFERENCES imports(id)  ON DELETE SET NULL,
            UNIQUE(eleve_id, matiere_id, periode, sequence, annee_scolaire_id)
          )
        `);
        db.exec("INSERT INTO notes SELECT * FROM notes_old");
        db.exec("DROP TABLE notes_old");
      })();
      console.log('✅ Contrainte CHECK(note) mise à jour sur notes');
    }
  } catch (err) {
    console.warn(`Note sur la migration CHECK(note): ${err.message}`);
  }

  // Enregistrer la version
  try {
    db.prepare("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('schema_version', ?)").run(CURRENT_SCHEMA_VERSION.toString());
  } catch (e) {
    console.warn("Impossible de mettre à jour la version du schéma:", e.message);
  }

  // Rattrapage : certaines colonnes ajoutees par migration peuvent manquer
  // si la base etait deja a jour au lancement (version >= CURRENT_SCHEMA_VERSION).
  try { db.exec("ALTER TABLE classes ADD COLUMN niveau_v2 TEXT"); } catch (e) { }

  console.log('✅ Schéma de base de données appliqué et à jour');
  return db;
}

/**
 * Retourne l'instance de la base de données
 */
function getDatabase() {
  if (!db) throw new Error('Base de données non initialisée');
  return db;
}

/**
 * Ferme la base de données
 */
function closeDatabase() {
  if (db) {
    db.close();
    console.log('✅ Base de données fermée');
    db = null;
  }
}

// ============================================================
// WRAPPERS SYNCHRONES (compatibilité avec l'existant)
// ============================================================

function run(sql, params = []) {
  const stmt = getDatabase().prepare(sql);
  const result = stmt.run(...params);
  lastWriteTimestamp = Date.now();
  return { lastID: result.lastInsertRowid, changes: result.changes };
}

function get(sql, params = []) {
  const stmt = getDatabase().prepare(sql);
  return stmt.get(...params);
}

function all(sql, params = []) {
  const stmt = getDatabase().prepare(sql);
  return stmt.all(...params);
}

function getLastWriteTimestamp() {
  return lastWriteTimestamp;
}

module.exports = {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  run,
  get,
  all,
  getLastWriteTimestamp
};
