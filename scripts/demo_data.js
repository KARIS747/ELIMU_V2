#!/usr/bin/env node
/**
 * scripts/demo_data.js
 * ======================================================================
 * GÉNÉRATEUR DE BASE DE DÉMONSTRATION — ÉLIMU V2
 * ======================================================================
 * Produit une base réaliste « comme si l'école était en usage depuis la
 * rentrée 2025 » :
 *   - 250 élèves répartis en 6 classes (SIL → CM2)
 *   - Parents (comptes Portail) + liens parents-élèves (frères/sœurs)
 *   - Notes N1/N2 (compétences, UA1→UA8, sous-notes + agrégats) et N3 (CM2)
 *   - Absences, heures d'absence, sanctions
 *   - Finance : frais, tranches, paiements, reçus
 *   - Comptes utilisateurs (admin, comptable) + comptes enseignants PWA
 *   - Paramètres école, année scolaire active, audit log
 *
 * Usage :
 *   node scripts/demo_data.js                       # base par défaut
 *   ELIMU_DB_PATH=/tmp/x.db node scripts/demo_data.js
 *   ELIMU_SEED=42 node scripts/demo_data.js         # données déterministes
 * ======================================================================
 */
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH =
  process.env.ELIMU_DB_PATH ||
  path.join(os.homedir(), '.config', 'elimu', 'elimu.db');

// ============================================================================
// PRNG DÉTERMINISTE (mulberry32)
// ============================================================================
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.ELIMU_SEED || '20260818', 10);
const rng = mulberry32(SEED);
const rand = () => rng();
const rint = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p) => rand() < p;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ============================================================================
// NOMS RÉALISTES (Cameroun — francophone)
// ============================================================================
const NOMS = `ATANGANA MBALLA NGONO ETOUNDI TCHOUA FOTSO KAMDEM NGANKOU MBOCK NDJOMO ESSOMBA NANA SIMO TALLA KENFACK NJOYA FOKOU MOUTNGUI NGOUFO DJOUMESSI TCHATCHOUA KAMGA MBOU NYAMSI TSOBENG NTOH DONFACK WAMBA BEKONO ENJEMA NKOULOU MEBENGA MVONDO ABENA AKONO BITJOCK EYENGA MAGA MBEDA NKEN ONANA ABANDA MAPOKO SANGWA ZEBAZE KOUAM NGUEKAM TELGA YEMBE BOMBA EBOGO MFOUMOU NTEDA OWONA TCHINDA AMBASSA BAYEMI NDZANA EBOA ETOGO KINI LONGA MBAH NJOCK OGOU YOUMBI MBARGA NTSAMA ETOA BILOA NJIKAM TCHOMBA MOULIOM AYISSI NKOUM NKOLO MBANDJOUM ELEGBA TSANGA ONGBENE BELLO BOUBA HAMADOU MOUSSA SANDJO BAKERI NDJOYA ANGUESSOM FOTABONG AWONO`.split(/\s+/);

const NOMS_F = `ABIGAEL ADELE AGNES ALINE ALPHONSINE AMINA ANGELINE ANNE ANTOINETTE AURELIE BEATRICE BERTHE BLANDINE BRIGITTE CATHERINE CELESTINE CHANTAL CHARLENE CHRISTELLE CLAIRE CLAUDINE CLEMENCE CORINE DANIELLE DELPHINE DIEUDONNEE DORIANE EDITH ELISE ELISABETH EMILIE ESTELLE EUGENIE FABIOLA FATIMA FLORENCE FRANCINE FRANCOISE GAELLE GERALDINE GISELE GRACE HELENE HERMINE HONORINE IRENE ISABELLE JACQUELINE JEANNE JOSIANE JUDITH JULIETTE KARINE LAETITIA LAURE LILIANE LOUISE MADELEINE MARCELLE MARIE MARLENE MARTINE MONIQUE NADEGE NICOLINE NICOLE NOELLIE ODETTE OLIVIA PASCALINE PATRICIA PAULE PAULINE PRISCA RACHEL REBECCA REGINE ROLANDE ROSALIE ROSE ROSINE SALOME SANDRINE SAPHIA SARAH SIMONE SOLANGE SOPHIE SYLVIE THERESE URSULE VALERIE VICTORINE VIVIANE YVETTE YVONNE ZITA`.split(/\s+/);

const NOMS_M = `ABEL ABDOU ADAMOU ADRIEN ALAIN ALBERT ALEXIS ALFRED ARMAND ATHANASE AUGUSTIN AURELIEN BAKARY BAZILE BENOIT BLAISE BRUNO CEDRIC CHARLES CHRISTIAN CHRISTOPHE CLEMENT CYRILLE DAMIEN DANIEL DAVID DEMBA DESIRE DIEUDONNE DOMINIQUE EDOUARD ELLIOT EMMANUEL ERIC ERNEST ETIENNE EUGENE FABRICE FELIX FERNAND FIDELE FRANCK FRANCOIS FREDERIC GABRIEL GASTON GAUTHIER GEORGES GERARD GERVAIS GILBERT GREGOIRE GUY HENRI HERVE HONORE HUBERT HUGUES IBRAHIM IDRISSE ISAAK JACQUES JEAN JEREMIE JOCELYN JOEL JONAS JOSEPH JULES JUSTIN LANDRY LAZARE LEON LEOPOLD LUC LUCAS LUCIEN MARCEL MARTIN MATHIEU MAURICE MICHEL MOISE AIME NARCISSE NESTOR NOEL NORBERT OMAR PASCAL PATRICE PATRICK PAUL PIERRE PROSPER RAPHAEL RAYMOND RENE RICHARD ROBERT RODRIGUE ROGER ROMAIN SAMUEL SERGE SIDOINE SIMON STEPHANE SYLVAIN TEDDY THEODORE THIERRY THOMAS VICTOR VINCENT VITAL WILLIAM YAOUBA YVES ZACHARIE`.split(/\s+/);

// ============================================================================
// RÉFÉRENCES CURRICULUM
// ============================================================================
const N1_CODES = ['1A', '1B', '1C', '2A', '2B', '3A', '3B', '4', '5', '6A1', '6B'];
const N2_CODES = ['1A', '1B', '1C', '2A', '2B', '3A', '3B', '4', '5', '6A1', '6B'];

const UA_PERIODE = {
  UA1: 'Trimestre 1', UA2: 'Trimestre 1', UA3: 'Trimestre 1',
  UA4: 'Trimestre 2', UA5: 'Trimestre 2', UA6: 'Trimestre 2',
  UA7: 'Trimestre 3', UA8: 'Trimestre 3',
};
const UA_ORDER = ['UA1', 'UA2', 'UA3', 'UA4', 'UA5', 'UA6', 'UA7', 'UA8'];

const PERIODE_WINDOW = {
  'Trimestre 1': ['2025-10-01', '2025-12-05'],
  'Trimestre 2': ['2026-01-05', '2026-03-25'],
  'Trimestre 3': ['2026-04-06', '2026-06-10'],
};

const N3_MATIERES = {
  DICT: 'Dictée',
  ETXT: 'Etude de Texte',
  PROD: "Production d'écrits",
  ECRI: 'Ecriture et Présentation',
  CONN: 'Connaissance du Français',
  CALC: 'Calcul rapide',
  EXER: 'Exercices / Mathématiques',
  PROB: 'Problèmes',
  LECT: 'Lecture',
  CGEN: 'Connaissances Gén. / Ed. Civique',
  SENV: "Science éduc. à l'environnement",
  ACTP: 'Activités Pratiques / Dessin',
};

// ============================================================================
// HELPERS DATES
// ============================================================================
const pad = (n) => String(n).padStart(2, '0');
function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function randDateIn(a, b) {
  const da = parseIso(a).getTime();
  const db = parseIso(b).getTime();
  return new Date(da + rand() * (db - da));
}
function formatTel(n) {
  const s = String(n).padStart(9, '0');
  return `+237 6${s[0]} ${s.slice(1, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
}
const slug = (str) => str
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z]/g, '')
  .toLowerCase();

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('==========================================================');
  console.log('  ÉLIMU — Génération des données de démonstration');
  console.log(`  Base : ${DB_PATH}`);
  console.log(`  Graine : ${SEED}`);
  console.log('==========================================================\n');

  // ── Préserver la licence et l'ecole_id existants ──
  let licenceKey = null;
  let licenceLastUsage = null;
  let ecoleId = null;
  if (fs.existsSync(DB_PATH)) {
    try {
      const sqlite = require('better-sqlite3');
      const old = new sqlite(DB_PATH, { readonly: true });
      const q = (k) => old.prepare('SELECT valeur FROM parametres WHERE cle=?').get(k)?.valeur;
      licenceKey = q('licence_key');
      licenceLastUsage = q('licence_last_usage');
      ecoleId = q('ecole_id');
      old.close();
      console.log('→ Licence existante préservée.');
      if (ecoleId) console.log(`→ ecole_id préservé : ${ecoleId}`);
    } catch (e) {
      console.log('→ Licence/ecole_id non préservés :', e.message);
    }
  }

  // ── Suppression de l'ancienne base ──
  for (const suf of ['', '-wal', '-shm']) {
    const f = DB_PATH + suf;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  const { initializeDatabase, getDatabase, closeDatabase } = require('../src/shared/database/db');
  await initializeDatabase(DB_PATH);
  const db = getDatabase();
  db.pragma('foreign_keys = OFF');
  db.pragma('synchronous = OFF');

  const hashParent = await bcrypt.hash('parent2025', 10);
  const hashDemo = await bcrypt.hash('demonstration', 10);

  let classeId = {}; // partagé (transaction + récapitulatif)

  // ── Tout le remplissage dans UNE transaction (rapide) ──
  const seed = db.transaction(() => {

  // ==========================================================================
  // ÉCOLE / ANNÉES / PARAMÈTRES
  // ==========================================================================
  const ECOLE_ID = ecoleId || '6b3e9d2a-4c1f-4b8e-9a5c-1d2e3f4a5b6c';
  const ANNEE = '2025/2026';

  const insAnnee = db.prepare(
    'INSERT INTO annees_scolaires (libelle, date_debut, date_fin, active, archived) VALUES (?,?,?,?,?)'
  );
  const ANNEE_ID = Number(insAnnee.run(ANNEE, '2025-09-01', '2026-07-31', 1, 0).lastInsertRowid);
  insAnnee.run('2026/2027', '2026-09-01', '2027-07-31', 0, 0);
  console.log(`→ Année active : ${ANNEE} (id=${ANNEE_ID})`);

  db.prepare('INSERT OR REPLACE INTO ecoles (ecole_id, nom, date_creation) VALUES (?,?,datetime(\'now\'))')
    .run(ECOLE_ID, 'École Publique de Nkolbisson');

  const insParam = db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?,?)');
  for (const [k, v] of Object.entries({
    ecole_id: ECOLE_ID,
    code_ecole: '7KMQXT',
    nom_etablissement: 'École Publique de Nkolbisson',
    telephone: '+237 691 234 567',
    email: 'ep.nkolbisson@elimu.cm',
    adresse: 'Nkolbisson, Yaoundé — Cameroun',
    periode_active: 'Trimestre 3',
    seuil_alerte: '10',
    note_max: '20',
    theme: 'dark',
    langue_interface: 'fr',
    nom_directeur: 'M. Jean-Paul MBALLA',
    schema_version: '123',
  })) insParam.run(k, v);
  if (licenceKey) insParam.run('licence_key', licenceKey);
  if (licenceLastUsage) insParam.run('licence_last_usage', licenceLastUsage);

  const bc = db.prepare('INSERT OR REPLACE INTO bulletin_config (cle, valeur) VALUES (?,?)');
  for (const [k, v] of Object.entries({
    etab_nom: 'École Publique de Nkolbisson',
    etab_devise: 'Travail — Discipline — Progrès',
    etab_adresse: 'Nkolbisson, Yaoundé',
    etab_telephone: '+237 691 234 567',
    etab_email: 'ep.nkolbisson@elimu.cm',
    directeur_nom: 'M. Jean-Paul MBALLA',
    annee_scolaire: ANNEE,
    delegation_regionale: 'DÉLÉGATION RÉGIONALE DU CENTRE',
    delegation_departementale: 'DÉLÉGATION DÉPARTEMENTALE DE MFOUNDI',
  })) bc.run(k, v);

  // ==========================================================================
  // MATIÈRES
  // ==========================================================================
  const insertMatiere = db.prepare('INSERT OR IGNORE INTO matieres (nom_matiere) VALUES (?)');
  for (const nom of Object.values(N3_MATIERES)) insertMatiere.run(nom);
  for (const nom of ['Français', 'Mathématiques', 'Anglais', 'EPS (Education Physique et Sportive)', 'Histoire-Géographie']) insertMatiere.run(nom);
  const matiereId = {};
  for (const row of db.prepare('SELECT id, nom_matiere FROM matieres').all()) matiereId[row.nom_matiere] = row.id;

  // ==========================================================================
  // UTILISATEURS (bureau)
  // ==========================================================================
  const insUser = db.prepare(`INSERT INTO utilisateurs
    (nom_utilisateur, telephone, mot_de_passe_hash, role, nom_complet, actif, ecole_id)
    VALUES (?,?,?,?,?,1,?)`);
  const DIRECTOR_ID = Number(insUser.run('directeur', '+237 677 000 001', hashDemo, 'admin', 'Jean-Paul MBALLA', ECOLE_ID).lastInsertRowid);
  const COMPTABLE_ID = Number(insUser.run('comptable', '+237 677 000 002', hashDemo, 'comptable', 'Claire FOTSO', ECOLE_ID).lastInsertRowid);

  // ==========================================================================
  // CLASSES
  // ==========================================================================
  const CLASS_DEFS = [
    { nom: 'SIL', niveau_v2: 'N1', matieres: ['Français', 'Mathématiques', 'Anglais', 'Science et Technologies', 'Éducation Civique et Morale', 'Langue nationale', 'Activités artistiques', 'EPS'] },
    { nom: 'CP', niveau_v2: 'N1', matieres: ['Français', 'Mathématiques', 'Anglais', 'Science et Technologies', 'Éducation Civique et Morale', 'Langue nationale', 'Activités artistiques', 'EPS'] },
    { nom: 'CE1', niveau_v2: 'N2', matieres: ['Français', 'Mathématiques', 'Anglais', 'Science et Technologies', 'Éducation Civique et Morale', 'Histoire-Géographie', 'Éducation artistique', 'EPS'] },
    { nom: 'CE2', niveau_v2: 'N2', matieres: ['Français', 'Mathématiques', 'Anglais', 'Science et Technologies', 'Éducation Civique et Morale', 'Histoire-Géographie', 'Éducation artistique', 'EPS'] },
    { nom: 'CM1', niveau_v2: 'N2', matieres: ['Français', 'Mathématiques', 'Anglais', 'Science et Technologies', 'Éducation Civique et Morale', 'Histoire-Géographie', 'Éducation artistique', 'EPS'] },
    { nom: 'CM2', niveau_v2: 'N3', matieres: Object.values(N3_MATIERES).concat(['EPS (Education Physique et Sportive)', 'Français', 'Mathématiques']) },
  ];
  const EFFECTIFS = { SIL: 42, CP: 43, CE1: 43, CE2: 42, CM1: 41, CM2: 39 };

  const insClasse = db.prepare(`INSERT INTO classes
    (nom_classe, niveau, systeme_educatif, matieres_json, niveau_v2, ecole_id)
    VALUES (?,?,?,?,?,?)`);
  classeId = {};
  for (const cd of CLASS_DEFS) {
    classeId[cd.nom] = Number(insClasse.run(cd.nom, 'Primaire', 'francophone', JSON.stringify(cd.matieres), cd.niveau_v2, ECOLE_ID).lastInsertRowid);
  }

  // ==========================================================================
  // ENSEIGNANTS (comptes PWA)
  // ==========================================================================
  const TEACHERS = [
    { nom: 'ETOUNDI', prenom: 'Pascal', tel: '+237 677 100 001', matiere: 'Français', classe: 'SIL' },
    { nom: 'NANA', prenom: 'Solange', tel: '+237 677 100 002', matiere: 'Français', classe: 'CP' },
    { nom: 'KAMDEM', prenom: 'Jean-Baptiste', tel: '+237 677 100 003', matiere: 'Mathématiques', classe: 'CE1' },
    { nom: 'FOTSO', prenom: 'Claire', tel: '+237 677 100 004', matiere: 'Mathématiques', classe: 'CE2' },
    { nom: 'TCHOUA', prenom: 'Éric', tel: '+237 677 100 005', matiere: 'Français', classe: 'CM1' },
    { nom: 'NDJOMO', prenom: 'Marie-Laure', tel: '+237 677 100 006', matiere: 'Français', classe: 'CM2' },
    { nom: 'MBARGA', prenom: 'Serge', tel: '+237 677 100 007', matiere: 'Anglais', classe: null },
    { nom: 'ESSOMBA', prenom: 'Viviane', tel: '+237 677 100 008', matiere: 'EPS', classe: null },
  ];
  const insProf = db.prepare(`INSERT INTO professeurs
    (nom, prenom, telephone, matiere_principale, actif, utilisateur_id, ecole_id, derniere_connexion)
    VALUES (?,?,?,?,1,?,?,?)`);
  const insProfUser = db.prepare(`INSERT INTO utilisateurs
    (nom_utilisateur, telephone, mot_de_passe_hash, role, nom_complet, matieres_ids, classes_ids, actif, ecole_id)
    VALUES (?,?,?, 'enseignant',?,?,?,1,?)`);

  const professeurId = {};
  for (const t of TEACHERS) {
    const username = slug(t.prenom[0] + '.' + t.nom);
    const classesTitre = t.classe ? [classeId[t.classe]] : Object.values(classeId);
    const userR = insProfUser.run(
      username, t.tel, hashDemo, (t.prenom + ' ' + t.nom).trim(),
      JSON.stringify([]), JSON.stringify(classesTitre), ECOLE_ID
    );
    const pR = insProf.run(t.nom, t.prenom, t.tel, t.matiere, userR.lastInsertRowid, ECOLE_ID, iso(randDateIn('2026-06-05', '2026-06-30')));
    professeurId[t.nom] = Number(pR.lastInsertRowid);
    if (t.classe) {
      db.prepare('INSERT OR IGNORE INTO professeurs_classes (professeur_id, classe_id) VALUES (?,?)')
        .run(pR.lastInsertRowid, classeId[t.classe]);
    }
  }
  db.prepare('INSERT OR IGNORE INTO professeurs_classes (professeur_id, classe_id) VALUES (?,?),(?,?),(?,?)')
    .run(professeurId.MBARGA, classeId.CE2, professeurId.MBARGA, classeId.CM1, professeurId.MBARGA, classeId.CM2);
  db.prepare('INSERT OR IGNORE INTO professeurs_classes (professeur_id, classe_id) SELECT ?, id FROM classes WHERE ecole_id=?')
    .run(professeurId.ESSOMBA, ECOLE_ID);

  const setPP = db.prepare('UPDATE classes SET professeur_principal_id = ? WHERE id = ?');
  setPP.run(professeurId.ETOUNDI, classeId.SIL);
  setPP.run(professeurId.NANA, classeId.CP);
  setPP.run(professeurId.KAMDEM, classeId.CE1);
  setPP.run(professeurId.FOTSO, classeId.CE2);
  setPP.run(professeurId.TCHOUA, classeId.CM1);
  setPP.run(professeurId.NDJOMO, classeId.CM2);

  // ==========================================================================
  // FINANCE — TYPES DE FRAIS
  // ==========================================================================
  const FRAIS = [
    { nom: 'Inscription', montant: 10000, nb: 1, period: 1, echeance: '2025-09-15' },
    { nom: 'Frais de scolarité', montant: 8000, nb: 3, period: 3, echeance: '2025-10-05' },
    { nom: 'APEE', montant: 3000, nb: 1, period: 1, echeance: '2025-10-10' },
    { nom: 'Assurance scolaire', montant: 2000, nb: 1, period: 1, echeance: '2025-10-10' },
  ];
  const insFrais = db.prepare(`INSERT INTO frais_types
    (nom, montant_par_tranche, nombre_tranches, periodicite_mois, date_premiere_echeance, actif, annee_scolaire_id, ecole_id)
    VALUES (?,?,?,?,?,1,?,?)`);
  const fraisId = {};
  for (const f of FRAIS) {
    fraisId[f.nom] = Number(insFrais.run(f.nom, f.montant, f.nb, f.period, f.echeance, ANNEE_ID, ECOLE_ID).lastInsertRowid);
  }

  // ==========================================================================
  // ÉLÈVES + PARENTS + TRANCHES (250 élèves)
  // ==========================================================================
  const insEleve = db.prepare(`INSERT INTO eleves
    (nom, prenom, matricule, date_naissance, sexe, classe_id, nom_parent, telephone_parent, date_inscription, annee_scolaire_id, ecole_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insParent = db.prepare(`INSERT OR IGNORE INTO parents
    (telephone, mot_de_passe_hash, mot_de_passe, nom_parent, ecole_id)
    VALUES (?,?,?,?,?)`);
  const insPE = db.prepare('INSERT OR IGNORE INTO parents_eleves (parent_id, eleve_id, ecole_id) VALUES (?,?,?)');
  const insTranche = db.prepare(`INSERT INTO tranches
    (frais_type_id, eleve_id, numero_tranche, montant, date_echeance, statut, annee_scolaire_id, ecole_id)
    VALUES (?,?,?,?,?,?,?,?)`);
  const getParentByTel = db.prepare('SELECT id FROM parents WHERE telephone = ? AND ecole_id = ?');

  const EFFECTIFS_TOTAL = Object.values(EFFECTIFS).reduce((a, b) => a + b, 0);
  const repartition = [];
  for (const [classe, effectif] of Object.entries(EFFECTIFS)) {
    for (let i = 0; i < effectif; i++) repartition.push(classe);
  }
  for (let i = repartition.length - 1; i > 0; i--) {
    const j = rint(0, i);
    [repartition[i], repartition[j]] = [repartition[j], repartition[i]];
  }

  const RANGES_AGE = { SIL: [5, 6], CP: [6, 7], CE1: [7, 8], CE2: [8, 9], CM1: [9, 10], CM2: [10, 11] };

  const eleves = [];
  const tranchesByEleve = {};
  const niveauByClasse = CLASS_DEFS.reduce((m, c) => { m[c.nom] = c.niveau_v2; return m; }, {});

  let parentSeq = 1;
  let eleveSeq = 0;
  for (const classe of repartition) {
    const sexe = chance(0.52) ? 'M' : 'F';
    const famille = pick(NOMS);
    const prenom = sexe === 'M' ? pick(NOMS_M) : pick(NOMS_F);

    // date de naissance alignée sur la classe
    const [minA, maxA] = RANGES_AGE[classe];
    const dNais = new Date(2025 - rint(minA, maxA), rint(0, 11), rint(1, 28));

    const inscrit = chance(0.12)
      ? randDateIn('2025-10-05', '2025-10-25')
      : randDateIn('2025-09-01', '2025-09-20');

    // parent — 12 % de frères/sœurs (même téléphone)
    let telParent = null;
    let parentLabel = '';
    if (chance(0.12) && parentSeq > 1) {
      const existing = eleves.filter((x) => x.telParent).slice(-Math.min(eleves.length, 60));
      if (existing.length) {
        const sib = pick(existing);
        telParent = sib.telParent;
        parentLabel = sib.parentLabel;
      }
    }
    if (!telParent) {
      telParent = formatTel(69000000 + parentSeq++);
      parentLabel = `${sexe === 'M' ? 'M.' : 'Mme'} ${pick(NOMS_F)} ${famille}`;
      insParent.run(telParent, hashParent, 'parent2025', parentLabel, ECOLE_ID);
    }
    const parentRow = getParentByTel.get(telParent, ECOLE_ID);

    eleveSeq++;
    const rE = insEleve.run(
      famille, prenom, `2025/${String(eleveSeq).padStart(4, '0')}`,
      iso(dNais), sexe, classeId[classe], parentLabel, telParent,
      iso(inscrit), ANNEE_ID, ECOLE_ID
    );
    const eleveId = Number(rE.lastInsertRowid);
    insPE.run(parentRow.id, eleveId, ECOLE_ID);

    eleves.push({ id: eleveId, classe, niveau: niveauByClasse[classe], sexe, telParent, parentLabel });

    // tranches de frais
    tranchesByEleve[eleveId] = [];
    for (const f of FRAIS) {
      for (let t = 1; t <= f.nb; t++) {
        const echeance = new Date(parseIso(f.echeance));
        echeance.setMonth(echeance.getMonth() + (t - 1) * f.period);
        const rT = insTranche.run(fraisId[f.nom], eleveId, t, f.montant, iso(echeance), 'en_attente', ANNEE_ID, ECOLE_ID);
        tranchesByEleve[eleveId].push({ id: Number(rT.lastInsertRowid), montant: f.montant, echeance: iso(echeance) });
      }
    }
  }
  console.log(`→ ${eleves.length} élèves, ${parentSeq - 1} parents (dont frères/sœurs partagés)`);

  // ==========================================================================
  // NOTES
  // ==========================================================================
  const { getWeightsForSousCompetence, calcAggregateFromSubNotes } = require('../src/shared/constants/curriculum');
  const insNote = db.prepare(`INSERT INTO notes
    (eleve_id, matiere_id, note, periode, sequence, date_import, annee_scolaire_id, ua, sous_competence_code, type_eval, sous_type, source, ecole_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const notesCount = { sub: 0, agg: 0, n3: 0 };

  for (const e of eleves) {
    if (e.classe === 'CM2') {
      // ════ N3 (quantitatif) : 12 matières × 3 trimestres × 2 séquences ════
      const niveauC = 6 + 13 * rand(); // base /20
      for (const [periode, win] of Object.entries(PERIODE_WINDOW)) {
        for (const seqNo of [1, 2]) {
          for (const [code, nomMatiere] of Object.entries(N3_MATIERES)) {
            const matId = matiereId[nomMatiere];
            const biais = matId % 3 - 1;
            let note = niveauC + biais - 0.5 + (rand() * 2.5 - 1.2);
            note = Math.min(20, Math.max(0, Math.round(note * 10) / 10));
            insNote.run(e.id, matId, note, periode, seqNo, iso(randDateIn(win[0], win[1])), ANNEE_ID, null, null, null, null, 'PWA', ECOLE_ID);
            notesCount.n3++;
          }
        }
      }
      continue;
    }

    // ════ N1 / N2 (compétences) ════
    const codes = e.niveau === 'N1' ? N1_CODES : N2_CODES;
    const niveauC = 0.25 + rand() * 0.75;
    const offset = rint(0, codes.length - 1);

    for (let u = 0; u < UA_ORDER.length; u++) {
      const ua = UA_ORDER[u];
      const periode = UA_PERIODE[ua];
      const win = PERIODE_WINDOW[periode];
      const chosen = [];
      for (let c = 0; c < 4; c++) {
        chosen.push(codes[(offset + u * 3 + c) % codes.length]);
      }

      for (const code of chosen) {
        const weights = getWeightsForSousCompetence(e.niveau, code);
        if (!weights) continue;
        const subNotes = {};
        const types = ['orale', 'ecrite', 'pratique', 'savoirEtre'].filter((t) => (weights[t] || 0) > 0);
        for (const t of types) {
          const maxP = weights[t];
          const coef = (e.niveau === 'N1' && t === 'orale') ? niveauC + 0.15 : niveauC;
          let val = maxP * Math.min(1, coef + (rand() * 0.3 - 0.15));
          val = Math.min(maxP, Math.max(0, Math.round(val * 100) / 100));
          subNotes[t] = val;
        }
        const agg = calcAggregateFromSubNotes(subNotes, weights);
        if (agg === null) continue;
        const dateImp = iso(randDateIn(win[0], win[1]));

        for (const [t, v] of Object.entries(subNotes)) {
          insNote.run(e.id, null, v, periode, null, dateImp, ANNEE_ID, ua, code, t, t, 'PWA', ECOLE_ID);
          notesCount.sub++;
        }
        insNote.run(e.id, null, Math.round(agg * 100) / 100, periode, null, dateImp, ANNEE_ID, ua, code, null, null, 'PWA', ECOLE_ID);
        notesCount.agg++;
      }
    }
  }
  console.log(`→ Notes : ${notesCount.sub} sous-notes N1/N2, ${notesCount.agg} agrégats, ${notesCount.n3} N3`);

  // ==========================================================================
  // ABSENCES / HEURES / SANCTIONS
  // ==========================================================================
  const insAbs = db.prepare(`INSERT INTO absences
    (eleve_id, date, justifie, motif, periode, annee_scolaire_id, ecole_id) VALUES (?,?,?,?,?,?,?)`);
  const insHeures = db.prepare(`INSERT OR REPLACE INTO heures_absence
    (eleve_id, periode, heures, annee_scolaire_id, ecole_id) VALUES (?,?,?,?,?)`);
  const insSanction = db.prepare(`INSERT INTO sanctions
    (eleve_id, type, date, description, periode, annee_scolaire_id, ecole_id) VALUES (?,?,?,?,?,?,?)`);

  const MOTIFS = ['Maladie', 'Raison familiale', 'Voyage', 'Rendez-vous médical', null];
  const TYPES_SANCTIONS = ['Observation', 'Avertissement', 'Blâme', 'Exclusion temporaire'];

  const dateFor = (periode, dayNum) => {
    const start = parseIso(PERIODE_WINDOW[periode][0]);
    return iso(new Date(start.getFullYear(), start.getMonth(), 1 + dayNum + rint(0, 3)));
  };

  for (const e of eleves) {
    if (!chance(0.62)) continue;
    const heavy = chance(0.15);
    const heuresParPeriode = {
      'Trimestre 1': heavy ? rint(8, 22) : rint(0, 14),
      'Trimestre 2': heavy ? rint(6, 18) : rint(0, 16),
      'Trimestre 3': rint(0, 12),
    };
    for (const [periode, heures] of Object.entries(heuresParPeriode)) {
      if (heures === 0) continue;
      insHeures.run(e.id, periode, heures, ANNEE_ID, ECOLE_ID);
      const nbJours = Math.min(6, Math.max(1, Math.round(heures / 5)));
      for (let j = 0; j < nbJours; j++) {
        if (chance(0.55)) continue;
        const d = dateFor(periode, rint(0, 28));
        if (d > '2026-07-31') continue;
        insAbs.run(e.id, d, chance(0.45) ? 1 : 0, pick(MOTIFS), periode, ANNEE_ID, ECOLE_ID);
      }
    }
  }

  for (let i = 0; i < 24; i++) {
    const e = pick(eleves);
    const periode = pick(['Trimestre 1', 'Trimestre 2', 'Trimestre 3']);
    insSanction.run(
      e.id, pick(TYPES_SANCTIONS),
      iso(randDateIn(PERIODE_WINDOW[periode][0], PERIODE_WINDOW[periode][1])),
      'Retard répété à l\'école',
      periode, ANNEE_ID, ECOLE_ID
    );
  }

  // ==========================================================================
  // PAIEMENTS
  // ==========================================================================
  const insPaiement = db.prepare(`INSERT INTO paiements
    (eleve_id, montant, date, mode, reference, recu_numero, notes, utilisateur_id, annee_scolaire_id, ecole_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insPT = db.prepare('INSERT OR IGNORE INTO paiement_tranches (paiement_id, tranche_id, montant_applique, annee_scolaire_id, ecole_id) VALUES (?,?,?,?,?)');
  const updTranche = db.prepare('UPDATE tranches SET statut=? WHERE id=?');

  const MODES = ['especes', 'especes', 'especes', 'mobile_money', 'mobile_money', 'cheque', 'virement'];
  let recuCounter = 0;

  for (const e of eleves) {
    const tris = tranchesByEleve[e.id];
    if (!tris || !tris.length) continue;
    const profil = rand();

    if (profil < 0.75) {
      // régulier : 3 paiements échelonnés couvrant tout
      pay(e.id, {
        tranches: tris.slice(0, 2), date: randDateIn('2025-09-15', '2025-10-15'),
      });
      pay(e.id, {
        tranches: tris.slice(2, 4), date: randDateIn('2025-11-05', '2025-12-20'),
      });
      pay(e.id, {
        tranches: tris.slice(4), date: randDateIn('2026-01-10', '2026-02-28'),
      });
    } else if (profil < 0.93) {
      // partiel : inscription + 1re tranche de scolarité
      pay(e.id, {
        tranches: tris.slice(0, 2), date: randDateIn('2025-09-15', '2025-10-20'),
      });
    } else if (chance(0.5)) {
      // impayé : inscription seulement
      pay(e.id, {
        tranches: tris.slice(0, 1), date: randDateIn('2025-09-20', '2025-10-10'),
      });
    }

    // tranches échues non réglées → en_retard
    for (const t of tris) {
      if (t.echeance < '2026-06-30') {
        const st = db.prepare('SELECT statut FROM tranches WHERE id=?').get(t.id).statut;
        if (st === 'en_attente') updTranche.run('en_retard', t.id);
      }
    }
  }

  function pay(eleveId, { tranches, date }) {
    if (!tranches.length) return;
    const montant = tranches.reduce((s, t) => s + t.montant, 0);
    recuCounter++;
    const khi = iso(date);
    const [y, m, dd] = khi.split('-');
    const recu = `REC-${y}${m}${dd}-${String(recuCounter).padStart(5, '0')}`;
    const user = chance(0.7) ? COMPTABLE_ID : DIRECTOR_ID;
    const r = insPaiement.run(
      eleveId, montant, khi, pick(MODES),
      montant > 15000 ? `VRMT/DEMO/${rint(1000, 9999)}` : null,
      recu, chance(0.2) ? 'Paiement échelonné' : null, user, ANNEE_ID, ECOLE_ID
    );
    const paiementId = Number(r.lastInsertRowid);
    for (const t of tranches) {
      insPT.run(paiementId, t.id, t.montant, ANNEE_ID, ECOLE_ID);
      updTranche.run('paye', t.id);
    }
  }

  // ==========================================================================
  // IMPORTS / AUDIT / CONNEXIONS PWA
  // ==========================================================================
  const insImport = db.prepare(`INSERT INTO imports
    (utilisateur_id, classe_id, matiere_id, fichier_nom, date_import, statut, nb_importes, nb_erreurs, annee_scolaire_id, ecole_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  insImport.run(DIRECTOR_ID, classeId.CM2, matiereId['Calcul rapide'], 'notes_CM2_seq1_trim1.xlsx', '2025-10-20 09:12:00', 'Succès', 39, 0, ANNEE_ID, ECOLE_ID);
  insImport.run(DIRECTOR_ID, classeId.CM2, matiereId['Dictée'], 'notes_CM2_seq2_trim1.xlsx', '2025-12-02 14:05:00', 'Succès', 39, 0, ANNEE_ID, ECOLE_ID);

  const insAudit = db.prepare(`INSERT INTO audit_log (utilisateur_id, action, details, adresse_ip_locale, ecole_id) VALUES (?,?,?,?,?)`);
  const AUDIT = [
    [DIRECTOR_ID, 'LOGIN', 'Connexion administrateur', '192.168.1.10'],
    [DIRECTOR_ID, 'ADD_ELEVE', 'Ajout des élèves de la rentrée', '192.168.1.10'],
    [COMPTABLE_ID, 'LOGIN', 'Connexion comptable', '192.168.1.12'],
    [COMPTABLE_ID, 'ENCAISSEMENT', 'Encaissements frais de scolarité', '192.168.1.12'],
    [DIRECTOR_ID, 'SYNCHRONISATION_PWA', 'Poussée des comptes enseignants vers la PWA', '192.168.1.10'],
    [DIRECTOR_ID, 'GENERER_BULLETINS', 'Génération des bulletins du trimestre 2', '192.168.1.10'],
    [COMPTABLE_ID, 'IMPRESSION_RECU', 'Impression des reçus de paiement', '192.168.1.12'],
    [DIRECTOR_ID, 'BACKUP', 'Sauvegarde manuelle de la base', '192.168.1.10'],
  ];
  for (const [uid, action, details, ip] of AUDIT) {
    insAudit.run(uid, action, details, ip, ECOLE_ID);
  }

  const insPwaLogin = db.prepare(`INSERT INTO pwa_login_history (professeur_id, date_connexion, details, ecole_id) VALUES (?,?,?,?)`);
  for (const pid of Object.values(professeurId)) {
    insPwaLogin.run(pid, iso(randDateIn('2026-05-20', '2026-06-30')), 'Connexion via application mobile', ECOLE_ID);
  }

  }); // ── fin de la transaction unique ──

  seed();
  db.pragma('foreign_keys = ON');
  closeDatabase();

  // ==========================================================================
  // RÉCAPITULATIF (relecture directe de la base générée)
  // ==========================================================================
  const sqlite = require('better-sqlite3');
  const check = new sqlite(DB_PATH, { readonly: true });
  const c = (t, w = '') => check.prepare(`SELECT COUNT(*) n FROM ${t} ${w}`).get().n;
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' GÉNÉRATION TERMINÉE — RÉCAPITULATIF');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`• Élèves          : ${c('eleves')}`);
  for (const nom of Object.keys(classeId)) {
    console.log(`    - ${nom.padEnd(4)} : ${c('eleves', 'WHERE classe_id=' + classeId[nom])} élèves`);
  }
  console.log(`• Parents         : ${c('parents')}`);
  console.log(`• Liens parents   : ${c('parents_eleves')}`);
  console.log(`• Notes N1/N2 sub : ${c('notes', 'WHERE sous_type IS NOT NULL')}`);
  console.log(`• Notes N1/N2 agg : ${c('notes', 'WHERE sous_type IS NULL AND ua IS NOT NULL')}`);
  console.log(`• Notes N3        : ${c('notes', 'WHERE matiere_id IS NOT NULL')}`);
  console.log(`• Absences        : ${c('absences')}`);
  console.log(`• heures_absence  : ${c('heures_absence')}`);
  console.log(`• Tranches        : ${c('tranches')}  payées=${c('tranches', "WHERE statut='paye'")} en_retard=${c('tranches', "WHERE statut='en_retard'")}`);
  console.log(`• Paiements       : ${c('paiements')}`);
  console.log(`• Enseignants     : ${c('professeurs')}  connexions PWA=${c('pwa_login_history')}`);
  check.close();
  console.log('──────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('❌ Erreur pendant la génération :', err);
  process.exit(1);
});