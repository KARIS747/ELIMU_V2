/**
 * testData.js - Injection de données fictives pour les tests et la démo
 */

async function injecterDonneesFictives(deps) {
  const { logger } = deps;
  const { all, run, get } = require('../../shared/database/db');

  try {
    const existantes = all('SELECT COUNT(*) as n FROM classes');
    if (existantes[0]?.n > 0) {
      logger.info('Données fictives déjà présentes, skip.');
      return;
    }

    logger.info('Injection des données fictives...');

    // On récupère l'année active
    const anneeActive = get('SELECT id FROM annees_scolaires WHERE active = 1 LIMIT 1');
    const currentAnneeId = anneeActive ? anneeActive.id : 1;

    const classes = [
      { nom: '6ème A',      niveau: 'Secondaire', matieres: JSON.stringify(['Mathématiques', 'Français', 'Histoire-Géographie', 'Sciences de la Vie et de la Terre', 'Anglais', 'Éducation Physique et Sportive']) },
      { nom: '3ème B',      niveau: 'Secondaire', matieres: JSON.stringify(['Mathématiques', 'Français', 'Physique-Chimie', 'Histoire-Géographie', 'Anglais', 'Philosophie']) },
      { nom: 'Terminale S', niveau: 'Secondaire', matieres: JSON.stringify(['Mathématiques', 'Physique-Chimie', 'Sciences de la Vie et de la Terre', 'Français', 'Anglais', 'Philosophie']) },
      { nom: 'CM2',         niveau: 'Primaire',   matieres: JSON.stringify(['Mathématiques', 'Français', 'Histoire-Géographie', 'Sciences de la Vie et de la Terre', 'Éducation Physique et Sportive']) }
    ];

    const classeIds = {};
    for (const c of classes) {
      const r = run('INSERT INTO classes (nom_classe, niveau, matieres_json) VALUES (?, ?, ?)', [c.nom, c.niveau, c.matieres]);
      classeIds[c.nom] = r.lastID;
    }

    const matieresCount = get('SELECT COUNT(*) as count FROM matieres');
    if (matieresCount.count === 0) {
      const matieresParDefaut = [
        'Mathématiques', 'Français', 'Sciences de la Vie et de la Terre',
        'Physique-Chimie', 'Histoire-Géographie', 'Anglais',
        'Éducation Physique et Sportive', 'Philosophie'
      ];
      for (const m of matieresParDefaut) {
        run('INSERT OR IGNORE INTO matieres (nom_matiere) VALUES (?)', [m]);
      }
    }

    const eleves = [
      { nom: 'KAMGA',     prenom: 'Pierre',     classe: '6ème A',      parent: 'Paul Kamga',       tel: '+237 699 001 001' },
      { nom: 'MBOCK',     prenom: 'Marie',      classe: '6ème A',      parent: 'Jeanne Mbock',     tel: '+237 699 001 002' },
      { nom: 'ATANGANA',  prenom: 'Jean',       classe: '6ème A',      parent: 'Claude Atangana',  tel: '+237 699 001 003' },
      { nom: 'NDJOMO',    prenom: 'Fatima',     classe: '6ème A',      parent: 'Ibrahim Ndjomo',   tel: '+237 699 001 004' },
      { nom: 'BIYA',      prenom: 'Lucas',      classe: '6ème A',      parent: 'Henri Biya',       tel: '+237 699 001 005' },
      { nom: 'ESSOMBA',   prenom: 'Aline',      classe: '6ème A',      parent: 'Michel Essomba',   tel: '+237 699 001 006' },
      { nom: 'TCHOUA',    prenom: 'David',      classe: '3ème B',      parent: 'Roger Tchoua',     tel: '+237 699 002 001' },
      { nom: 'MANGA',     prenom: 'Sophie',     classe: '3ème B',      parent: 'Alice Manga',      tel: '+237 699 002 002' },
      { nom: 'FOUDA',     prenom: 'Kevin',      classe: '3ème B',      parent: 'Théodore Fouda',   tel: '+237 699 002 003' },
      { nom: 'ABESSOLO',  prenom: 'Christelle', classe: '3ème B',      parent: 'Martin Abessolo',  tel: '+237 699 002 004' },
      { nom: 'MVONDO',    prenom: 'Samuel',     classe: '3ème B',      parent: 'Cécile Mvondo',    tel: '+237 699 002 005' },
      { nom: 'NKODO',     prenom: 'Aurélie',   classe: 'Terminale S', parent: 'Joseph Nkodo',     tel: '+237 699 003 001' },
      { nom: 'OWONA',     prenom: 'Bertrand',  classe: 'Terminale S', parent: 'Marthe Owona',     tel: '+237 699 003 002' },
      { nom: 'MEKONGO',   prenom: 'Diane',     classe: 'Terminale S', parent: 'Pascal Mekongo',   tel: '+237 699 003 003' },
      { nom: 'BIKELE',    prenom: 'Éric',      classe: 'Terminale S', parent: 'Hélène Bikele',    tel: '+237 699 003 004' },
      { nom: 'NANGA',     prenom: 'Inès',      classe: 'CM2',         parent: 'François Nanga',   tel: '+237 699 004 001' },
      { nom: 'ONDOA',     prenom: 'Théo',      classe: 'CM2',         parent: 'Sylvie Ondoa',     tel: '+237 699 004 002' },
      { nom: 'ENAMA',     prenom: 'Grace',     classe: 'CM2',         parent: 'Daniel Enama',     tel: '+237 699 004 003' },
      { nom: 'TSANGA',    prenom: 'Noël',      classe: 'CM2',         parent: 'Brigitte Tsanga',  tel: '+237 699 004 004' }
    ];

    const eleveIds = {};
    for (const e of eleves) {
      const r = run(
        `INSERT INTO eleves (nom, prenom, classe_id, nom_parent, telephone_parent, annee_scolaire_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [e.nom, e.prenom, classeIds[e.classe], e.parent, e.tel, currentAnneeId]
      );
      eleveIds[`${e.prenom} ${e.nom}`] = r.lastID;
    }

    const matieres = all('SELECT id, nom_matiere FROM matieres');
    const matiereMap = {};
    matieres.forEach(m => { matiereMap[m.nom_matiere] = m.id; });

    const notesConfig = [
      ['Pierre KAMGA', 'Mathématiques', 15.5], ['Pierre KAMGA', 'Français', 13.0],
      ['Marie MBOCK', 'Mathématiques', 17.0], ['Marie MBOCK', 'Français', 16.5],
      ['Jean ATANGANA', 'Mathématiques', 9.0], ['Jean ATANGANA', 'Français', 8.5],
      ['Fatima NDJOMO', 'Mathématiques', 12.0], ['Fatima NDJOMO', 'Français', 14.0],
      ['Lucas BIYA', 'Mathématiques', 11.5], ['Lucas BIYA', 'Français', 7.0],
      ['Aline ESSOMBA', 'Mathématiques', 18.0], ['Aline ESSOMBA', 'Français', 17.0]
    ];

    for (const [nomEleve, matiere, note] of notesConfig) {
      const eleveId = eleveIds[nomEleve];
      const matiereId = matiereMap[matiere];
      if (!eleveId || !matiereId) continue;
      run(
        'INSERT INTO notes (eleve_id, matiere_id, note, periode, sequence, annee_scolaire_id) VALUES (?, ?, ?, ?, ?, ?)',
        [eleveId, matiereId, note, 'Trimestre 1', 1, currentAnneeId]
      );
    }

    logger.info('✅ Données fictives injectées avec succès.');
  } catch (error) {
    logger.error('Erreur injection données fictives:', error);
  }
}

module.exports = { injecterDonneesFictives };
