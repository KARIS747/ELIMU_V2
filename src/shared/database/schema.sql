-- ============================================================
-- schema.sql - Schéma de la base de données Elimu
-- v4 : Multi-école, login par téléphone, ecole_id partout
-- ============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================
-- TABLE : ecoles (multi-école)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecoles (
    ecole_id              TEXT PRIMARY KEY,
    nom                   TEXT NOT NULL,
    cle_api_portail       TEXT,
    cle_pwa_sync          TEXT,
    config                TEXT DEFAULT '{}',
    date_creation         TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS utilisateurs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_utilisateur      TEXT NOT NULL,
    telephone            TEXT,
    mot_de_passe_hash    TEXT NOT NULL,
    question_secrete     TEXT,
    reponse_hash         TEXT,
    role                 TEXT NOT NULL DEFAULT 'admin'
                         CHECK(role IN ('admin', 'enseignant', 'secretaire', 'comptable')),
    nom_complet          TEXT DEFAULT '',
    matieres_ids         TEXT DEFAULT '[]',
    classes_ids          TEXT DEFAULT '[]',
    actif                INTEGER DEFAULT 1,
    ecole_id             TEXT NOT NULL DEFAULT '',
    date_creation        TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ecole_id, nom_utilisateur),
    UNIQUE(ecole_id, telephone)
);

CREATE TRIGGER IF NOT EXISTS trg_migrate_utilisateurs
AFTER INSERT ON utilisateurs
BEGIN SELECT 1; END;

-- ============================================================
-- TABLE : professeurs
-- ============================================================
CREATE TABLE IF NOT EXISTS professeurs (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    nom                TEXT NOT NULL,
    prenom             TEXT NOT NULL,
    telephone          TEXT,
    email              TEXT,
    matiere_principale TEXT,
    actif              INTEGER DEFAULT 1,
    utilisateur_id     INTEGER UNIQUE REFERENCES utilisateurs(id) ON DELETE SET NULL,
    derniere_connexion TEXT,
    ecole_id           TEXT NOT NULL DEFAULT '',
    created_at         TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_professeurs_actif ON professeurs(actif);
CREATE INDEX IF NOT EXISTS idx_professeurs_ecole ON professeurs(ecole_id);

-- ============================================================
-- TABLE : professeurs_classes (liaison enseignants ↔ classes)
-- ============================================================
CREATE TABLE IF NOT EXISTS professeurs_classes (
    professeur_id INTEGER NOT NULL,
    classe_id     INTEGER NOT NULL,
    PRIMARY KEY(professeur_id, classe_id),
    FOREIGN KEY(professeur_id) REFERENCES professeurs(id) ON DELETE CASCADE,
    FOREIGN KEY(classe_id)     REFERENCES classes(id)     ON DELETE CASCADE
);

-- ============================================================
-- TABLE : classes  (avec professeur_principal_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_classe              TEXT NOT NULL,
    niveau                  TEXT CHECK(niveau IN ('Primaire', 'Secondaire', 'Supérieur')),
    systeme_educatif        TEXT DEFAULT 'francophone' CHECK(systeme_educatif IN ('francophone', 'anglophone')),
    matieres_json           TEXT DEFAULT '[]',
    professeur_principal_id INTEGER REFERENCES professeurs(id) ON DELETE SET NULL,
    niveau_v2               TEXT,
    ecole_id                TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_classes_ecole ON classes(ecole_id);

-- ============================================================
-- TABLE : parents
-- ============================================================
CREATE TABLE IF NOT EXISTS parents (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    telephone         TEXT NOT NULL,
    mot_de_passe_hash TEXT NOT NULL,
    mot_de_passe      TEXT,
    nom_parent        TEXT,
    ecole_id          TEXT NOT NULL DEFAULT '',
    date_creation     TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ecole_id, telephone)
);

-- Table de liaison parents-élèves (un parent peut avoir plusieurs élèves)
CREATE TABLE IF NOT EXISTS parents_eleves (
    parent_id INTEGER NOT NULL,
    eleve_id  INTEGER NOT NULL,
    ecole_id  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (parent_id, eleve_id),
    FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
    FOREIGN KEY (eleve_id)  REFERENCES eleves(id)  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_parents_eleves_ecole ON parents_eleves(ecole_id);

CREATE INDEX IF NOT EXISTS idx_parents_tel ON parents(telephone);
CREATE INDEX IF NOT EXISTS idx_parents_eleves_parent ON parents_eleves(parent_id);
CREATE INDEX IF NOT EXISTS idx_parents_eleves_eleve ON parents_eleves(eleve_id);


CREATE TABLE IF NOT EXISTS matieres (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_matiere  TEXT UNIQUE NOT NULL,
    coefficient  REAL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS eleves (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    nom              TEXT NOT NULL,
    prenom           TEXT NOT NULL,
    date_naissance   TEXT,
    classe_id        INTEGER,
    nom_parent       TEXT,
    telephone_parent TEXT,
    email_parent     TEXT,
    photo            TEXT,
    sexe             TEXT CHECK(sexe IN ('M', 'F')),
    date_inscription TEXT DEFAULT CURRENT_TIMESTAMP,
    annee_scolaire_id INTEGER,
    ecole_id         TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(classe_id) REFERENCES classes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_eleves_classe ON eleves(classe_id);
CREATE INDEX IF NOT EXISTS idx_eleves_ecole ON eleves(ecole_id);

CREATE TABLE IF NOT EXISTS notes (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    eleve_id             INTEGER NOT NULL,
    matiere_id           INTEGER,
    note                 REAL NOT NULL CHECK(note >= 0),
    periode              TEXT DEFAULT 'Trimestre 1',
    sequence             INTEGER DEFAULT 1,
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
    UNIQUE(ecole_id, eleve_id, matiere_id, periode, sequence, annee_scolaire_id)
);
CREATE INDEX IF NOT EXISTS idx_notes_eleve           ON notes(eleve_id);
CREATE INDEX IF NOT EXISTS idx_notes_matiere         ON notes(matiere_id);
CREATE INDEX IF NOT EXISTS idx_notes_periode         ON notes(periode);
CREATE INDEX IF NOT EXISTS idx_notes_sequence        ON notes(sequence);
CREATE INDEX IF NOT EXISTS idx_notes_periode_eleve   ON notes(periode, eleve_id);
CREATE INDEX IF NOT EXISTS idx_notes_matiere_periode ON notes(matiere_id, periode);
CREATE INDEX IF NOT EXISTS idx_notes_dashboard       ON notes(eleve_id, periode, sequence, matiere_id, note);

CREATE TABLE IF NOT EXISTS absences (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    eleve_id  INTEGER NOT NULL,
    date      TEXT NOT NULL,
    justifie  BOOLEAN DEFAULT 0,
    motif     TEXT,
    periode   TEXT DEFAULT 'Trimestre 1',
    annee_scolaire_id INTEGER,
    ecole_id  TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(eleve_id) REFERENCES eleves(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sanctions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    eleve_id    INTEGER NOT NULL,
    type        TEXT NOT NULL,
    date        TEXT NOT NULL,
    description TEXT,
    periode     TEXT DEFAULT 'Trimestre 1',
    annee_scolaire_id INTEGER,
    ecole_id    TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(eleve_id) REFERENCES eleves(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS imports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    utilisateur_id  INTEGER NOT NULL,
    classe_id       INTEGER NOT NULL,
    matiere_id      INTEGER NOT NULL,
    fichier_nom     TEXT NOT NULL,
    date_import     TEXT DEFAULT CURRENT_TIMESTAMP,
    statut          TEXT CHECK(statut IN ('Succès', 'Partiel', 'Échec')),
    nb_importes     INTEGER DEFAULT 0,
    nb_erreurs      INTEGER DEFAULT 0,
    message         TEXT,
    annee_scolaire_id INTEGER,
    ecole_id        TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(utilisateur_id) REFERENCES utilisateurs(id),
    FOREIGN KEY(classe_id)      REFERENCES classes(id),
    FOREIGN KEY(matiere_id)     REFERENCES matieres(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp         TEXT DEFAULT CURRENT_TIMESTAMP,
    utilisateur_id    INTEGER,
    action            TEXT NOT NULL,
    details           TEXT,
    adresse_ip_locale TEXT,
    ecole_id          TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(utilisateur_id) REFERENCES utilisateurs(id)
);

CREATE TABLE IF NOT EXISTS parametres (
    cle    TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS heures_absence (
    eleve_id INTEGER NOT NULL,
    periode  TEXT NOT NULL CHECK(periode IN ('Trimestre 1', 'Trimestre 2', 'Trimestre 3')),
    heures   REAL NOT NULL DEFAULT 0,
    annee_scolaire_id INTEGER,
    ecole_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (eleve_id, periode, annee_scolaire_id),
    FOREIGN KEY(eleve_id) REFERENCES eleves(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_heures_absence_eleve ON heures_absence(eleve_id);

CREATE TABLE IF NOT EXISTS bulletin_config (
    cle    TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
);

INSERT OR IGNORE INTO parametres (cle, valeur) VALUES
    ('seuil_alerte',    '10'),
    ('theme',           'dark'),
    ('nom_etablissement', 'Mon Établissement'),
    ('note_max',        '20'),
    ('periode_active',  'Trimestre 1');

INSERT OR IGNORE INTO matieres (nom_matiere) VALUES
    ('Mathématiques'),('Français'),('Sciences de la Vie et de la Terre'),
    ('Physique-Chimie'),('Histoire-Géographie'),('Anglais'),
    ('Éducation Physique et Sportive'),('Philosophie');

INSERT OR IGNORE INTO bulletin_config (cle, valeur) VALUES
    ('etab_nom','Mon Établissement'),('etab_devise','Excellence et Rigueur'),
    ('etab_adresse',''),('etab_telephone',''),('etab_email',''),('etab_logo',''),
    ('directeur_nom',''),('directeur_titre','Le Directeur'),
    ('couleur_primaire','#1a3c6e'),('couleur_secondaire','#c8a415'),
    ('couleur_entete','#1a3c6e'),('couleur_texte_entete','#ffffff'),
    ('style_modele','officiel'),('notation_type','numerique'),('notation_max','20'),
    ('mentions_config','[{"min":16,"max":20,"label":"Très Bien","couleur":"#00a854"},{"min":14,"max":15.99,"label":"Bien","couleur":"#52c41a"},{"min":12,"max":13.99,"label":"Assez Bien","couleur":"#faad14"},{"min":10,"max":11.99,"label":"Passable","couleur":"#fa8c16"},{"min":0,"max":9.99,"label":"Insuffisant","couleur":"#f5222d"}]'),
    ('col_coefficient','1'),('col_seq1','1'),('col_seq2','1'),('col_moyenne','1'),
    ('col_moy_classe','1'),('col_appreciation','1'),('calc_poids_seq1','50'),
    ('calc_poids_seq2','50'),('pied_texte','Fait à _____, le _____'),
    ('pied_signature','1'),('afficher_absences','1'),('afficher_rang_general','1'),
    ('afficher_appreciation_generale','1'),('appreciation_auto','1'),
    ('delegation_regionale','DÉLÉGATION RÉGIONALE DU ...'),
    ('delegation_departementale','DÉLÉGATION DÉPARTEMENTALE DE ...'),
    ('annee_scolaire',''),('titulaire_classe','');

-- ============================================================
-- TABLES FINANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS frais_types (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    nom                    TEXT NOT NULL,
    montant_par_tranche    REAL NOT NULL,
    nombre_tranches        INTEGER NOT NULL DEFAULT 1,
    periodicite_mois       INTEGER NOT NULL DEFAULT 1,
    date_premiere_echeance TEXT NOT NULL,
    destinataire           TEXT DEFAULT 'etablissement',
    actif                  INTEGER DEFAULT 1,
    annee_scolaire_id      INTEGER,
    ecole_id               TEXT NOT NULL DEFAULT '',
    date_creation          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tranches (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    frais_type_id  INTEGER NOT NULL,
    eleve_id       INTEGER NOT NULL,
    numero_tranche INTEGER NOT NULL,
    montant        REAL NOT NULL,
    date_echeance  TEXT NOT NULL,
    statut         TEXT DEFAULT 'en_attente'
                   CHECK(statut IN ('en_attente', 'paye', 'en_retard')),
    annee_scolaire_id INTEGER,
    ecole_id       TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(frais_type_id) REFERENCES frais_types(id) ON DELETE CASCADE,
    FOREIGN KEY(eleve_id)      REFERENCES eleves(id)      ON DELETE CASCADE,
    UNIQUE(ecole_id, frais_type_id, eleve_id, numero_tranche)
);

CREATE TABLE IF NOT EXISTS paiements (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    eleve_id       INTEGER NOT NULL,
    montant        REAL NOT NULL,
    date           TEXT NOT NULL,
    mode           TEXT CHECK(mode IN ('especes','cheque','virement','mobile_money','autre')),
    reference      TEXT,
    recu_numero    TEXT UNIQUE,
    notes          TEXT,
    utilisateur_id INTEGER NOT NULL,
    annee_scolaire_id INTEGER,
    ecole_id       TEXT NOT NULL DEFAULT '',
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(eleve_id)       REFERENCES eleves(id)       ON DELETE CASCADE,
    FOREIGN KEY(utilisateur_id) REFERENCES utilisateurs(id)
);

CREATE TABLE IF NOT EXISTS paiement_tranches (
    paiement_id      INTEGER NOT NULL,
    tranche_id       INTEGER NOT NULL,
    montant_applique REAL NOT NULL,
    annee_scolaire_id INTEGER,
    ecole_id         TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(paiement_id, tranche_id),
    FOREIGN KEY(paiement_id) REFERENCES paiements(id) ON DELETE CASCADE,
    FOREIGN KEY(tranche_id)  REFERENCES tranches(id)  ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tranches_eleve           ON tranches(eleve_id);
CREATE INDEX IF NOT EXISTS idx_tranches_statut          ON tranches(statut);
CREATE INDEX IF NOT EXISTS idx_tranches_echeance        ON tranches(date_echeance);
CREATE INDEX IF NOT EXISTS idx_paiements_eleve          ON paiements(eleve_id);
CREATE INDEX IF NOT EXISTS idx_paiements_date           ON paiements(date);
CREATE INDEX IF NOT EXISTS idx_tranches_statut_echeance ON tranches(statut, date_echeance);
CREATE INDEX IF NOT EXISTS idx_tranches_eleve_statut    ON tranches(eleve_id, statut);
CREATE INDEX IF NOT EXISTS idx_tranches_numero          ON tranches(numero_tranche);

-- ============================================================
-- TABLE : annees_scolaires
-- ============================================================
CREATE TABLE IF NOT EXISTS annees_scolaires (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle     TEXT NOT NULL UNIQUE,
    date_debut  TEXT,
    date_fin    TEXT,
    active      INTEGER DEFAULT 0,
    archived    INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_annees_active   ON annees_scolaires(active);
CREATE INDEX IF NOT EXISTS idx_annees_archived ON annees_scolaires(archived);
