#!/usr/bin/env node
/**
 * seed_test_data.js — Génère des données fictives pour ELIMU V2
 * Utilise les vrais codes MINEDUB du curriculum national camerounais.
 *
 * Usage: node seed_test_data.js [chemin_db] [clean]
 *   clean : supprime les anciennes données test avant de regénérer
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

// ── Chemin DB ─────────────────────────────────────────────────────
const knownDbPaths = [
  path.join(__dirname, 'database', 'elimu.db'),
  path.join(process.env.HOME || '', '.config', 'elimu', 'elimu.db'),
];
let dbPath;
if (process.argv[2] && !process.argv[2].startsWith('--') && process.argv[2] !== 'clean') {
  dbPath = path.resolve(process.argv[2]);
} else {
  for (const c of [
    path.join(__dirname, 'database', 'elimu.db'),
    path.join(process.env.HOME || '', '.config', 'elimu', 'elimu.db'),
  ]) { if (fs.existsSync(c)) { dbPath = c; break; } }
}
if (!dbPath) { console.error('❌ DB introuvable'); process.exit(1); }
console.log(`📁 ${dbPath}`);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA foreign_keys=ON');

const cleanMode = process.argv.includes('clean');

// ── Helpers (node:sqlite veut des params individuels, pas d'array) ─
const _p = v => (Array.isArray(v) && v.length === 1 && Array.isArray(v[0])) ? v[0] : v;
const get = (sql, ...p) => db.prepare(sql).get(..._p(p));
const all = (sql, ...p) => db.prepare(sql).all(..._p(p));
const run = (sql, ...p) => db.prepare(sql).run(..._p(p));
const rand = (mn, mx) => Math.round((Math.random() * (mx - mn) + mn) * 10) / 10;
const rnd = (mn, mx) => Math.floor(Math.random() * (mx - mn + 1)) + mn;
const pick = a => a[rnd(0, a.length - 1)];
const NOMS = ['Nkono','Mvondo','Essomba','Eyanga','Belinga','Mengue','Oyono','Atangana','Biyogo','Mba','Ndong','Obam','Emane','Bindzi','Akono','Engamba','Nnomo','Beyala','Zang','Mballa','Assiga','Nkoulou','Etoa','Messa','Bikoi','Ekoto','Onana','Tsimi','Mboe','Nga','Bikono','Meyo','Abega','Mendouga','Nkili','Bidou','Mvet'];
const PM = ['Jean','Paul','Joseph','Simon','André','Michel','François','Charles','Philippe','Alexis','Emmanuel','Gabriel','David','Daniel','Raphaël','Blaise','Alain','Pascal','Marcel','Grégoire','Mathurin','Rémy','Célestin','Benoît','Cyprien'];
const PF = ['Marie','Jeanne','Catherine','Thérèse','Rose','Monique','Suzanne','Brigitte','Joséphine','Marguerite','Claire','Louise','Martine','Françoise','Odile','Véronique','Julienne','Solange','Béatrice','Élisabeth','Germaine','Angèle','Yvette','Colette','Esther','Ruth','Anne','Noëlle','Paulette'];

// ── VRAI CURRICULUM MINEDUB ───────────────────────────────────────
const CURRICULUM = {
  N1: {
    competences: [
      { code: 'C1', nom: 'Communiquer en Français, Anglais et langue nationale',
        sous: [
          { code: '1A', nom: 'Communiquer en Français', type_eval: 'TI' },
          { code: '1B', nom: 'Communicate in English', type_eval: 'TI' },
          { code: '1C', nom: 'Pratiquer une langue nationale', type_eval: 'EE' },
        ]},
      { code: 'C2', nom: 'Utiliser les notions de base en Mathématiques, Science et Technologies',
        sous: [
          { code: '2A', nom: 'Mathématiques', type_eval: 'DI' },
          { code: '2B', nom: 'Science et Technologies', type_eval: 'PE' },
        ]},
      { code: 'C3', nom: 'Pratiquer les valeurs sociales et citoyennes',
        sous: [
          { code: '3A', nom: 'Valeurs sociales', type_eval: 'EE' },
          { code: '3B', nom: 'Valeurs citoyennes', type_eval: 'EE' },
        ]},
      { code: 'C4', nom: "Démontrer l'autonomie, l'esprit d'initiative, de créativité",
        sous: [
          { code: '4', nom: 'Autonomie, créativité et entrepreneuriat', type_eval: 'PE' },
        ]},
      { code: 'C5', nom: 'Utiliser les concepts de base et les outils des TIC',
        sous: [
          { code: '5', nom: 'Concepts et outils TIC', type_eval: 'PE' },
        ]},
      { code: 'C6', nom: 'Pratiquer les activités physiques, sportives et artistiques',
        sous: [
          { code: '6A1', nom: 'Activités physiques/sportives (aptes)', type_eval: 'EE' },
          { code: '6A2', nom: 'Activités physiques/sportives (inaptes)', type_eval: 'EE' },
          { code: '6B', nom: 'Activités artistiques', type_eval: 'EE' },
        ]},
    ],
  },
  N2: {
    competences: [
      { code: 'C1', nom: 'Communiquer en Français, Anglais et langue nationale',
        sous: [
          { code: '1A', nom: 'Communiquer en Français', type_eval: 'TI' },
          { code: '1B', nom: 'Communicate in English', type_eval: 'TI' },
          { code: '1C', nom: 'Pratiquer une langue nationale', type_eval: 'EE' },
        ]},
      { code: 'C2', nom: 'Utiliser les notions de base en Mathématiques, Science et Technologies',
        sous: [
          { code: '2A', nom: 'Mathématiques', type_eval: 'DI' },
          { code: '2B', nom: 'Science et Technologies', type_eval: 'PE' },
        ]},
      { code: 'C3', nom: 'Pratiquer les valeurs sociales et citoyennes',
        sous: [
          { code: '3A', nom: 'Valeurs sociales', type_eval: 'EE' },
          { code: '3B', nom: 'Valeurs citoyennes', type_eval: 'EE' },
        ]},
      { code: 'C4', nom: "Démontrer l'autonomie, l'esprit d'initiative",
        sous: [
          { code: '4', nom: 'Autonomie, créativité et entrepreneuriat', type_eval: 'PE' },
        ]},
      { code: 'C5', nom: 'Utiliser les concepts de base et les outils des TIC',
        sous: [
          { code: '5', nom: 'Concepts et outils TIC', type_eval: 'PE' },
        ]},
      { code: 'C6', nom: 'Pratiquer les activités physiques, sportives et artistiques',
        sous: [
          { code: '6A1', nom: 'Activités physiques/sportives (aptes)', type_eval: 'EE' },
          { code: '6A2', nom: 'Activités physiques/sportives (inaptes)', type_eval: 'EE' },
          { code: '6B', nom: 'Activités artistiques', type_eval: 'EE' },
        ]},
    ],
  },
};

const MATIERES_N3 = ['Mathématiques','Français','SVT','Histoire-Géographie','Anglais','EPS'];
const TYPE_EVALS = ['DI','TI','PE','EE'];

// Mapping UA → Trimestre (identique à curriculum.js)
const UA_TRIMESTRE_MAP = {
  'Trimestre 1': ['UA1', 'UA2', 'UA3'],
  'Trimestre 2': ['UA4', 'UA5', 'UA6'],
  'Trimestre 3': ['UA7', 'UA8'],
};
const PERIODES = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
const SOUS_TYPES = ['orale', 'ecrite', 'pratique', 'savoirEtre'];

// Poids des sous-types par sous-compétence (extrait de curriculum.js N1)
const N1_POIDS = {
  '1A': { orale:20, ecrite:15, pratique:0, savoirEtre:5 },
  '1B': { orale:20, ecrite:15, pratique:0, savoirEtre:5 },
  '1C': { orale:10, ecrite:5, pratique:3, savoirEtre:2 },
  '2A': { orale:5, ecrite:20, pratique:0, savoirEtre:5 },
  '2B': { orale:5, ecrite:15, pratique:5, savoirEtre:5 },
  '3A': { orale:3, ecrite:3, pratique:10, savoirEtre:4 },
  '3B': { orale:5, ecrite:5, pratique:8, savoirEtre:2 },
  '4':  { orale:5, ecrite:3, pratique:10, savoirEtre:2 },
  '5':  { orale:4, ecrite:10, pratique:20, savoirEtre:6 },
  '6A1':{ orale:2, ecrite:2, pratique:12, savoirEtre:4 },
  '6A2':{ orale:3, ecrite:15, pratique:0, savoirEtre:2 },
  '6B': { orale:2, ecrite:4, pratique:12, savoirEtre:2 },
};
// N2 a des poids différents
const N2_POIDS = {
  '1A': { orale:12, ecrite:15, pratique:0, savoirEtre:3 },
  '1B': { orale:12, ecrite:15, pratique:0, savoirEtre:3 },
  '1C': { orale:10, ecrite:8, pratique:2, savoirEtre:0 },
  '2A': { orale:8, ecrite:28, pratique:0, savoirEtre:4 },
  '2B': { orale:6, ecrite:7, pratique:20, savoirEtre:7 },
  '3A': { orale:3, ecrite:8, pratique:5, savoirEtre:4 },
  '3B': { orale:3, ecrite:9, pratique:5, savoirEtre:3 },
  '4':  { orale:5, ecrite:2, pratique:11, savoirEtre:2 },
  '5':  { orale:4, ecrite:10, pratique:20, savoirEtre:6 },
  '6A1':{ orale:2, ecrite:2, pratique:12, savoirEtre:4 },
  '6A2':{ orale:3, ecrite:15, pratique:0, savoirEtre:2 },
  '6B': { orale:2, ecrite:4, pratique:12, savoirEtre:2 },
};

function calcAggregate(subNotes, weights) {
  let total = 0, totalPoids = 0;
  for (const t of SOUS_TYPES) {
    if (weights[t] > 0 && subNotes[t] != null) { total += subNotes[t]; totalPoids += weights[t]; }
  }
  return totalPoids > 0 ? parseFloat(((total / totalPoids) * 20).toFixed(2)) : null;
}

// S'assurer que la colonne sous_type existe
try {
  const cols = db.prepare("PRAGMA table_info(notes)").all().map(c => c.name);
  if (!cols.includes('sous_type')) {
    db.exec("ALTER TABLE notes ADD COLUMN sous_type TEXT CHECK(sous_type IN ('orale','ecrite','pratique','savoirEtre'))");
    console.log('  + Colonne sous_type ajoutée à notes');
  }
} catch(e) { console.warn('  Note: sous_type:', e.message); }

try {
  db.exec('BEGIN');

  // ── Clean si demandé ────────────────────────────────────────────
  if (cleanMode) {
    // Trouver les IDs des élèves/classes générés par seed
    const seedEleves = all("SELECT id FROM eleves WHERE nom IN (" + NOMS.map(_ => '?').join(',') + ")", NOMS);
    const eids = seedEleves.map(r => r.id);
    if (eids.length > 0) {
      run("DELETE FROM notes WHERE eleve_id IN (" + eids.map(_ => '?').join(',') + ")", ...eids);
      run("DELETE FROM heures_absence WHERE eleve_id IN (" + eids.map(_ => '?').join(',') + ")", ...eids);
      run("DELETE FROM stats_eleves");
      run("DELETE FROM eleves WHERE id IN (" + eids.map(_ => '?').join(',') + ")", ...eids);
      console.log('  🧹 Anciennes données nettoyées');
    }
    // Supprimer enseignants seed
    for (const nom of ['sil.a','ce1.a','cm1.a']) {
      const u = get("SELECT id FROM utilisateurs WHERE nom_utilisateur=?", [nom]);
      if (u) {
        run("DELETE FROM professeurs WHERE utilisateur_id=?", [u.id]);
        run("DELETE FROM utilisateurs WHERE id=?", [u.id]);
      }
    }
    console.log('  🧹 Enseignants seed supprimés');

    // Supprimer classes seed
    for (const nom of ['SIL-A','CE1-A','CM1-A']) {
      const c = get("SELECT id FROM classes WHERE nom_classe=?", [nom]);
      if (c) run("DELETE FROM classes WHERE id=?", [c.id]);
    }
    console.log('  🧹 Classes seed supprimées');
  }

  // ── 1. Année scolaire ───────────────────────────────────────────
  let annee = get("SELECT id FROM annees_scolaires WHERE libelle=?", ['2025-2026']);
  if (!annee) {
    run("INSERT INTO annees_scolaires (libelle,date_debut,date_fin,active) VALUES (?,?,?,?)",
        ['2025-2026','2025-09-01','2026-06-30',1]);
    annee = get("SELECT id FROM annees_scolaires WHERE libelle=?", ['2025-2026']);
  }
  const anneeId = annee.id;
  console.log('  ✅ Année 2025-2026');

  // ── 2. Matières N3 ──────────────────────────────────────────────
  const matieresMap = {};
  for (const nom of MATIERES_N3) {
    let m = get("SELECT id FROM matieres WHERE nom_matiere=?", [nom]);
    if (!m) { run("INSERT INTO matieres (nom_matiere,coefficient) VALUES (?,?)", [nom, 1.0]); m = get("SELECT id FROM matieres WHERE nom_matiere=?", [nom]); }
    matieresMap[nom] = m.id;
  }

  // ── 3. Classes ──────────────────────────────────────────────────
  const classesData = [
    { nom: 'SIL-A', niveau_v2: 'N1', systeme: 'francophone' },
    { nom: 'CE1-A', niveau_v2: 'N2', systeme: 'francophone' },
    { nom: 'CM1-A', niveau_v2: 'N3', systeme: 'francophone' },
  ];
  const classIds = {};
  for (const cd of classesData) {
    let c = get("SELECT id FROM classes WHERE nom_classe=? AND niveau_v2=?", [cd.nom, cd.niveau_v2]);
    if (!c) {
      run("INSERT INTO classes (nom_classe,niveau,systeme_educatif,niveau_v2,matieres_json) VALUES (?,?,?,?,?)",
          [cd.nom, 'Primaire', cd.systeme, cd.niveau_v2, '[]']);
      c = get("SELECT id FROM classes WHERE nom_classe=? AND niveau_v2=?", [cd.nom, cd.niveau_v2]);
    }
    classIds[cd.niveau_v2] = c.id;
  }
  console.log('  ✅ Classes SIL(N1), CE1(N2), CM1(N3)');

  // ── 4. Comptes enseignants ───────────────────────────────────────
  const ecoleId = get("SELECT valeur FROM parametres WHERE cle='ecole_id'")?.valeur || 'ECOLE001';
  const PWD_HASH = bcrypt.hashSync('teacher123', 10);
  const teacherData = [
    { username: 'sil.a',  nom: 'Nkono',   prenom: 'Jean',  classe_nom: 'SIL-A', niveau: 'N1', classe_id: classIds['N1'], tel: '600000001' },
    { username: 'ce1.a',  nom: 'Mvondo',  prenom: 'Paul',  classe_nom: 'CE1-A', niveau: 'N2', classe_id: classIds['N2'], tel: '600000002' },
    { username: 'cm1.a',  nom: 'Essomba', prenom: 'Marie', classe_nom: 'CM1-A', niveau: 'N3', classe_id: classIds['N3'], tel: '600000003' },
  ];
  let teacherCount = 0;
  for (const td of teacherData) {
    let u = get("SELECT id FROM utilisateurs WHERE nom_utilisateur=? AND ecole_id=?", [td.username, ecoleId]);
    if (!u) {
      const r = run(
        "INSERT INTO utilisateurs (nom_utilisateur, telephone, mot_de_passe_hash, role, nom_complet, classes_ids, actif, ecole_id) VALUES (?,?,?,?,?,?,?,?)",
        [td.username, td.tel, PWD_HASH, 'enseignant', td.nom + ' ' + td.prenom, JSON.stringify([td.classe_id]), 1, ecoleId]
      );
      const uid = Number(r.lastInsertRowid);
      run(
        "INSERT INTO professeurs (nom, prenom, telephone, actif, utilisateur_id, ecole_id) VALUES (?,?,?,?,?,?)",
        [td.nom, td.prenom, td.tel, 1, uid, ecoleId]
      );
      teacherCount++;
    }
  }
  if (teacherCount > 0) console.log(`  ✅ ${teacherCount} comptes enseignants créés (mdp: teacher123)`);

  // ── 5. Élèves ───────────────────────────────────────────────────
  let eleveCount = 0;
  function createEleves(classeId, count) {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const nom = pick(NOMS);
      const sexe = i % 2 === 0 ? 'M' : 'F';
      const prenom = sexe === 'M' ? pick(PM) : pick(PF);
      const naiss = `${rnd(2012,2018)}-${String(rnd(1,12)).padStart(2,'0')}-${String(rnd(1,28)).padStart(2,'0')}`;
      const tel = `6${rnd(50,99)}${rnd(100000,999999)}`;
      const r = run(
        "INSERT INTO eleves (nom,prenom,date_naissance,sexe,classe_id,nom_parent,telephone_parent,annee_scolaire_id) VALUES (?,?,?,?,?,?,?,?)",
        [nom,prenom,naiss,sexe,classeId,`M./Mme ${nom}`,tel,anneeId]
      );
      ids.push(Number(r.lastInsertRowid));
      eleveCount++;
    }
    return ids;
  }

  const silIds = createEleves(classIds['N1'], 12);
  const ce1Ids = createEleves(classIds['N2'], 12);
  const cm1Ids = createEleves(classIds['N3'], 12);
  console.log(`  ✅ ${eleveCount} élèves`);

  // ── 6. Notes N1/N2 avec VRAIS codes MINEDUB ─────────────────────
  // Chaque sous-compétence a 4 sous-types (orale, ecrite, pratique, savoirEtre).
  // La note agrégée = moyenne pondérée des sous-types selon le curriculum.
  function generateNotesN1N2(eleveIds, poidsMap, curriculum, niveauLabel) {
    let count = 0;
    for (const eid of eleveIds) {
      for (const periode of PERIODES) {
        const uas = UA_TRIMESTRE_MAP[periode];
        for (const ua of uas) {
          for (const comp of curriculum.competences) {
            for (const sc of comp.sous) {
              const codeComp = sc.code;
              const weights = poidsMap[sc.code];
              if (!weights) continue;
               // Générer sous-notes sur l'echelle reelle (max = poids de la sous-competence)
              const subNotes = {};
              for (const t of SOUS_TYPES) {
                if (weights[t] <= 0) continue;
                subNotes[t] = rand(1, weights[t]);
                run(
                  "INSERT INTO notes (eleve_id,note,periode,annee_scolaire_id,ua,sous_competence_code,type_eval,source,sous_type) VALUES (?,?,?,?,?,?,?,?,?)",
                  [eid, subNotes[t], periode, anneeId, ua, codeComp, sc.type_eval, 'SEED', t]
                );
                count++;
              }
              // Calculer la note agrégée /20 (pondérée par les poids curriculum)
              const aggregate = calcAggregate(subNotes, weights);
              run(
                "INSERT INTO notes (eleve_id,note,periode,annee_scolaire_id,ua,sous_competence_code,type_eval,source,sous_type) VALUES (?,?,?,?,?,?,?,?,?)",
                [eid, aggregate, periode, anneeId, ua, codeComp, sc.type_eval, 'SEED', null]
              );
              count++;
            }
          }
        }
      }
    }
    return count;
  }

  const n1Count = generateNotesN1N2(silIds, N1_POIDS, CURRICULUM.N1, 'N1');
  const n2Count = generateNotesN1N2(ce1Ids, N2_POIDS, CURRICULUM.N2, 'N2');
  console.log(`  ✅ ${n1Count} notes N1 (SIL) — 4 sous-types + 1 agrégée par sc`);
  console.log(`  ✅ ${n2Count} notes N2 (CE1) — 4 sous-types + 1 agrégée par sc`);

  // ── 7. Notes N3 (3 trimestres × 2 séquences) ─────────────────────
  let n3Count = 0;
  for (const periode of PERIODES) {
    for (const seq of [1, 2]) {
      for (const eid of cm1Ids) {
        for (const matId of Object.values(matieresMap)) {
          run(
            "INSERT INTO notes (eleve_id,matiere_id,note,periode,sequence,annee_scolaire_id,source) VALUES (?,?,?,?,?,?,?)",
            [eid, matId, rand(3, 19), periode, seq, anneeId, 'SEED']
          );
          n3Count++;
        }
      }
    }
  }
  console.log(`  ✅ ${n3Count} notes N3 (CM1) — 3 trimestres × 2 séquences`);

  // ── 8. Absences (3 trimestres) ──────────────────────────────────
  let absCount = 0;
  for (const ids of [silIds, ce1Ids, cm1Ids]) {
    for (const eid of ids) {
      for (const periode of PERIODES) {
        if (Math.random() < 0.6) {
          run("INSERT INTO heures_absence (eleve_id,periode,heures,annee_scolaire_id) VALUES (?,?,?,?)",
              [eid, periode, rand(0, 15), anneeId]);
          absCount++;
        }
      }
    }
  }
  console.log(`  ✅ ${absCount} absences`);

  // ── 9. Paramètres + triggers stats_eleves ───────────────────────
  run("INSERT OR IGNORE INTO parametres (cle,valeur) VALUES (?,?)", ['schema_version','110']);
  run("INSERT OR IGNORE INTO parametres (cle,valeur) VALUES (?,?)", ['seuil_alerte','10']);
  run("INSERT OR IGNORE INTO parametres (cle,valeur) VALUES (?,?)", ['nom_etablissement','École Primaire Test']);
  run("INSERT OR IGNORE INTO parametres (cle,valeur) VALUES (?,?)", ['periode_active','Trimestre 1']);
  run("INSERT OR IGNORE INTO parametres (cle,valeur) VALUES (?,?)", ['note_max','20']);

  // Créer triggers manquants (filtrer les sous-types)
  for (const sql of [
    `CREATE TRIGGER IF NOT EXISTS trg_update_stats_after_insert AFTER INSERT ON notes BEGIN
      INSERT INTO stats_eleves (eleve_id,annee_scolaire_id,periode,sequence,moyenne,total_notes,last_updated)
      VALUES (NEW.eleve_id,NEW.annee_scolaire_id,NEW.periode,NEW.sequence,NEW.note,1,CURRENT_TIMESTAMP)
      ON CONFLICT(eleve_id,annee_scolaire_id,periode,sequence) DO UPDATE SET
        moyenne=(SELECT ROUND(AVG(note),2) FROM notes WHERE eleve_id=NEW.eleve_id AND annee_scolaire_id=NEW.annee_scolaire_id AND periode=NEW.periode AND sequence=NEW.sequence AND sous_type IS NULL),
        total_notes=(SELECT COUNT(*) FROM notes WHERE eleve_id=NEW.eleve_id AND annee_scolaire_id=NEW.annee_scolaire_id AND periode=NEW.periode AND sequence=NEW.sequence AND sous_type IS NULL),
        last_updated=CURRENT_TIMESTAMP;
      UPDATE stats_eleves SET moyenne_generale=(SELECT ROUND(SUM(n.note*COALESCE(m.coefficient,1.0))/SUM(COALESCE(m.coefficient,1.0)),2) FROM notes n LEFT JOIN matieres m ON n.matiere_id=m.id WHERE n.eleve_id=NEW.eleve_id AND n.annee_scolaire_id=NEW.annee_scolaire_id AND n.sous_type IS NULL)
      WHERE eleve_id=NEW.eleve_id AND annee_scolaire_id=NEW.annee_scolaire_id;
    END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_update_stats_after_update AFTER UPDATE ON notes BEGIN
      INSERT INTO stats_eleves (eleve_id,annee_scolaire_id,periode,sequence,moyenne,total_notes,last_updated)
      VALUES (NEW.eleve_id,NEW.annee_scolaire_id,NEW.periode,NEW.sequence,NEW.note,1,CURRENT_TIMESTAMP)
      ON CONFLICT(eleve_id,annee_scolaire_id,periode,sequence) DO UPDATE SET
        moyenne=(SELECT ROUND(AVG(note),2) FROM notes WHERE eleve_id=NEW.eleve_id AND annee_scolaire_id=NEW.annee_scolaire_id AND periode=NEW.periode AND sequence=NEW.sequence AND sous_type IS NULL),
        total_notes=(SELECT COUNT(*) FROM notes WHERE eleve_id=NEW.eleve_id AND annee_scolaire_id=NEW.annee_scolaire_id AND periode=NEW.periode AND sequence=NEW.sequence AND sous_type IS NULL),
        last_updated=CURRENT_TIMESTAMP;
      UPDATE stats_eleves SET moyenne_generale=(SELECT ROUND(SUM(n.note*COALESCE(m.coefficient,1.0))/SUM(COALESCE(m.coefficient,1.0)),2) FROM notes n LEFT JOIN matieres m ON n.matiere_id=m.id WHERE n.eleve_id=NEW.eleve_id AND n.annee_scolaire_id=NEW.annee_scolaire_id AND n.sous_type IS NULL)
      WHERE eleve_id=NEW.eleve_id AND annee_scolaire_id=NEW.annee_scolaire_id;
    END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_update_stats_after_delete AFTER DELETE ON notes BEGIN
      INSERT INTO stats_eleves (eleve_id,annee_scolaire_id,periode,sequence,moyenne,total_notes,last_updated)
      VALUES (OLD.eleve_id,OLD.annee_scolaire_id,OLD.periode,OLD.sequence,0,0,CURRENT_TIMESTAMP)
      ON CONFLICT(eleve_id,annee_scolaire_id,periode,sequence) DO UPDATE SET
        moyenne=COALESCE((SELECT ROUND(AVG(note),2) FROM notes WHERE eleve_id=OLD.eleve_id AND annee_scolaire_id=OLD.annee_scolaire_id AND periode=OLD.periode AND sequence=OLD.sequence AND sous_type IS NULL),0),
        total_notes=(SELECT COUNT(*) FROM notes WHERE eleve_id=OLD.eleve_id AND annee_scolaire_id=OLD.annee_scolaire_id AND periode=OLD.periode AND sequence=OLD.sequence AND sous_type IS NULL),
        last_updated=CURRENT_TIMESTAMP;
      UPDATE stats_eleves SET moyenne_generale=COALESCE((SELECT ROUND(SUM(n.note*COALESCE(m.coefficient,1.0))/SUM(COALESCE(m.coefficient,1.0)),2) FROM notes n LEFT JOIN matieres m ON n.matiere_id=m.id WHERE n.eleve_id=OLD.eleve_id AND n.annee_scolaire_id=OLD.annee_scolaire_id AND n.sous_type IS NULL),0)
      WHERE eleve_id=OLD.eleve_id AND annee_scolaire_id=OLD.annee_scolaire_id;
    END;`,
  ]) { try { db.exec(sql); } catch(e) {} }

  // Re-populer stats_eleves (uniquement les lignes agrégées)
  db.exec('DELETE FROM stats_eleves');
  db.exec(`INSERT INTO stats_eleves (eleve_id,annee_scolaire_id,periode,sequence,moyenne,total_notes,last_updated)
    SELECT eleve_id,annee_scolaire_id,periode,sequence,ROUND(AVG(note),2),COUNT(*),CURRENT_TIMESTAMP FROM notes WHERE sous_type IS NULL GROUP BY eleve_id,annee_scolaire_id,periode,sequence`);
  db.exec(`UPDATE stats_eleves SET moyenne_generale=(SELECT ROUND(SUM(n2.note*COALESCE(m.coefficient,1.0))/SUM(COALESCE(m.coefficient,1.0)),2)
    FROM notes n2 LEFT JOIN matieres m ON m.id=n2.matiere_id WHERE n2.eleve_id=stats_eleves.eleve_id AND n2.annee_scolaire_id=stats_eleves.annee_scolaire_id AND n2.sous_type IS NULL)`);
  const statsCount = get("SELECT COUNT(*) as c FROM stats_eleves").c;
  console.log(`  ✅ stats_eleves : ${statsCount} lignes`);

  db.exec('COMMIT');

  // ── Résumé ──────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('   📊 RÉSUMÉ');
  console.log('═══════════════════════════════════════════');
  for (const [niveau, cid] of Object.entries(classIds)) {
    const nE = get("SELECT COUNT(*) as c FROM eleves WHERE classe_id=?", [cid]).c;
    const nN = get("SELECT COUNT(*) as c FROM notes n JOIN eleves e ON n.eleve_id=e.id WHERE e.classe_id=?", [cid]).c;
    const av = get("SELECT ROUND(AVG(note),2) as a FROM notes n JOIN eleves e ON n.eleve_id=e.id WHERE e.classe_id=?", [cid]).a;
    if (niveau !== 'N3') {
      const codes = all("SELECT DISTINCT sous_competence_code FROM notes n JOIN eleves e ON n.eleve_id=e.id WHERE e.classe_id=? AND sous_competence_code IS NOT NULL ORDER BY sous_competence_code", [cid]);
      console.log(`   ${niveau} : ${nE} élèves · ${nN} notes · moy ${av} · codes: ${codes.map(r => r.sous_competence_code).join(', ')}`);
    } else {
      console.log(`   ${niveau} : ${nE} élèves · ${nN} notes · moy ${av} · matières: ${MATIERES_N3.join(', ')}`);
    }
  }
  console.log('═══════════════════════════════════════════\n');
  console.log('✅ Données MINEDUB générées ! Lancez : npx electron .');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('\n❌ Erreur:', err.message);
  process.exit(1);
} finally {
  db.close();
}
