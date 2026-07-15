const path = require('path');
const { initializeDatabase, getDatabase, closeDatabase } = require('../src/shared/database/db');

async function runDiagnostic() {
  try {
    // Initialiser la DB (path par défaut dans db.js est relatif au dossier de db.js)
    // db.js -> ../../../database/elimu.db
    // Ici on est dans /home/karis/elimu/tools/
    // Donc /home/karis/elimu/database/elimu.db
    await initializeDatabase(path.join(__dirname, '../database/elimu.db'));
    const db = getDatabase();

    console.log('\n--- Diagnostic Finance Elimu ---\n');

    // 1. Total dû réel
    const totalDu = db.prepare(`
      SELECT SUM(montant) AS total_du 
      FROM tranches 
      WHERE annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1)
    `).get();
    console.log(`Total dû réel (DB) : ${totalDu.total_du?.toLocaleString()} FCFA`);

    // 2. Nombre d'élèves actifs
    const nbEleves = db.prepare(`
      SELECT COUNT(*) AS nb_eleves 
      FROM eleves 
      WHERE annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1)
    `).get();
    console.log(`Nombre d'élèves actifs : ${nbEleves.nb_eleves}`);

    // 6. Estimation manuelle
    const estimation = nbEleves.nb_eleves * 241000;
    console.log(`Estimation manuelle (241000 * ${nbEleves.nb_eleves}) : ${estimation.toLocaleString()} FCFA`);
    console.log(`Écart : ${(totalDu.total_du - estimation).toLocaleString()} FCFA\n`);

    // 3. Détail par type de frais
    console.log('--- Détail par type de frais ---');
    const details = db.prepare(`
      SELECT 
        ft.nom AS type_frais,
        ft.nombre_tranches,
        ft.montant_par_tranche,
        COUNT(DISTINCT t.eleve_id) AS nb_eleves,
        SUM(t.montant) AS total_par_type
      FROM tranches t
      JOIN frais_types ft ON ft.id = t.frais_type_id
      WHERE t.annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1)
      GROUP BY ft.id
      ORDER BY total_par_type DESC
    `).all();
    console.table(details);

    // 4. Élèves sans tranche
    const sansTranche = db.prepare(`
      SELECT COUNT(*) AS eleves_sans_tranche
      FROM eleves e
      WHERE e.annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1)
      AND NOT EXISTS (
        SELECT 1 FROM tranches t WHERE t.eleve_id = e.id
      )
    `).get();
    console.log(`Élèves sans tranche : ${sansTranche.eleves_sans_tranche}\n`);

    // 5. Années antérieures
    console.log('--- Tranches par année scolaire ---');
    const parAnnee = db.prepare(`SELECT annee_scolaire_id, COUNT(*) as count FROM tranches GROUP BY annee_scolaire_id`).all();
    console.table(parAnnee);

    // 7. Écarts individuels
    console.log('\n--- Échantillon élèves dépassant 241 000 FCFA ---');
    const depassement = db.prepare(`
      SELECT e.id, e.nom, e.prenom, SUM(t.montant) AS total_eleve
      FROM eleves e
      JOIN tranches t ON t.eleve_id = e.id
      WHERE e.annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1)
      GROUP BY e.id
      HAVING total_eleve > 241000
      LIMIT 10
    `).all();
    console.table(depassement);

    closeDatabase();
  } catch (err) {
    console.error('Erreur lors du diagnostic :', err);
  }
}

runDiagnostic();
