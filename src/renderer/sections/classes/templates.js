/**
 * templates.js - Définition des modèles de classes (Templates V2)
 * Ces modèles définissent les compétences et points selon le curriculum MINEDUB Cameroun.
 */

export const CLASS_TEMPLATES = {
  template_SIL: {
    id: 'template_SIL',
    nom: 'Modèle SIL',
    niveau: 'N1',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN1()
  },
  template_CP: {
    id: 'template_CP',
    nom: 'Modèle CP',
    niveau: 'N1',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN1()
  },
  template_CE1: {
    id: 'template_CE1',
    nom: 'Modèle CE1',
    niveau: 'N2',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN2()
  },
  template_CE2: {
    id: 'template_CE2',
    nom: 'Modèle CE2',
    niveau: 'N2',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN2()
  },
  template_CM1: {
    id: 'template_CM1',
    nom: 'Modèle CM1',
    niveau: 'N3',
    systeme: 'francophone_ancien',
    total_points: 20, // Système sur 20
    competences: [] // Utilise le système de matières classiques
  },
  template_CM2: {
    id: 'template_CM2',
    nom: 'Modèle CM2',
    niveau: 'N3',
    systeme: 'francophone_ancien',
    total_points: 20,
    competences: []
  }
};

function getCompetencesN1() {
  return [
    {
      code: 'C1',
      nom: 'Communiquer en Français, Anglais et langue nationale',
      total_points: 100,
      sous_competences: [
        { code: '1A', nom: 'Communiquer en Français', total_points: 40, oral: 20, ecrit: 15, pratique: 0, savoir_etre: 5 },
        { code: '1B', nom: 'Communicate in English', total_points: 40, oral: 20, ecrit: 15, pratique: 0, savoir_etre: 5 },
        { code: '1C', nom: 'Pratiquer une langue nationale', total_points: 20, oral: 10, ecrit: 5, pratique: 3, savoir_etre: 2 }
      ]
    },
    {
      code: 'C2',
      nom: 'Utiliser les notions de base en Maths, Science et Technologies',
      total_points: 60,
      sous_competences: [
        { code: '2A', nom: 'Mathématiques', total_points: 30, oral: 5, ecrit: 20, pratique: 0, savoir_etre: 5 },
        { code: '2B', nom: 'Science et Technologies', total_points: 30, oral: 5, ecrit: 15, pratique: 5, savoir_etre: 5 }
      ]
    },
    {
      code: 'C3',
      nom: 'Pratiquer les valeurs sociales et citoyennes',
      total_points: 40,
      sous_competences: [
        { code: '3A', nom: 'Valeurs sociales', total_points: 20, oral: 3, ecrit: 3, pratique: 10, savoir_etre: 4 },
        { code: '3B', nom: 'Valeurs citoyennes', total_points: 20, oral: 5, ecrit: 5, pratique: 8, savoir_etre: 2 }
      ]
    },
    {
      code: 'C4',
      nom: 'Démontrer l\'autonomie, créativité et entrepreneuriat',
      total_points: 20,
      sous_competences: [
        { code: '4', nom: 'Autonomie, créativité, entrepreneuriat', total_points: 20, oral: 5, ecrit: 3, pratique: 10, savoir_etre: 2 }
      ]
    },
    {
      code: 'C5',
      nom: 'Utiliser les concepts de base et outils TIC',
      total_points: 40,
      sous_competences: [
        { code: '5', nom: 'Concepts TIC', total_points: 40, oral: 4, ecrit: 10, pratique: 20, savoir_etre: 6 }
      ]
    },
    {
      code: 'C6',
      nom: 'Pratiquer les activités physiques, sportives et artistiques',
      total_points: 60,
      sous_competences: [
        { code: '6A1', nom: 'Activités physiques/sportives (aptes)', total_points: 20, oral: 2, ecrit: 2, pratique: 12, savoir_etre: 4 },
        { code: '6A2', nom: 'Activités physiques/sportives (inaptes)', total_points: 20, oral: 3, ecrit: 15, pratique: 0, savoir_etre: 2 },
        { code: '6B', nom: 'Activités artistiques', total_points: 20, oral: 2, ecrit: 4, pratique: 12, savoir_etre: 2 }
      ]
    }
  ];
}

function getCompetencesN2() {
  return [
    {
      code: 'C1',
      nom: 'Communiquer en Français, Anglais et langue nationale',
      total_points: 80,
      sous_competences: [
        { code: '1A', nom: 'Communiquer en Français', total_points: 30, oral: 12, ecrit: 15, pratique: 0, savoir_etre: 3 },
        { code: '1B', nom: 'Communicate in English', total_points: 30, oral: 12, ecrit: 15, pratique: 0, savoir_etre: 3 },
        { code: '1C', nom: 'Pratiquer une langue nationale', total_points: 20, oral: 10, ecrit: 8, pratique: 2, savoir_etre: 0 }
      ]
    },
    {
      code: 'C2',
      nom: 'Utiliser les notions de base en Maths, Science et Technologies',
      total_points: 80,
      sous_competences: [
        { code: '2A', nom: 'Mathématiques', total_points: 40, oral: 8, ecrit: 28, pratique: 0, savoir_etre: 4 },
        { code: '2B', nom: 'Science et Technologies', total_points: 40, oral: 6, ecrit: 7, pratique: 20, savoir_etre: 7 }
      ]
    },
    {
      code: 'C3',
      nom: 'Pratiquer les valeurs sociales et citoyennes',
      total_points: 40,
      sous_competences: [
        { code: '3A', nom: 'Valeurs sociales', total_points: 20, oral: 3, ecrit: 8, pratique: 5, savoir_etre: 4 },
        { code: '3B', nom: 'Valeurs citoyennes', total_points: 20, oral: 3, ecrit: 9, pratique: 5, savoir_etre: 3 }
      ]
    },
    {
      code: 'C4',
      nom: 'Démontrer l\'autonomie, créativité et entrepreneuriat',
      total_points: 20,
      sous_competences: [
        { code: '4', nom: 'Autonomie, créativité, entrepreneuriat', total_points: 20, oral: 5, ecrit: 2, pratique: 11, savoir_etre: 2 }
      ]
    },
    {
      code: 'C5',
      nom: 'Utiliser les concepts de base et outils TIC',
      total_points: 40,
      sous_competences: [
        { code: '5', nom: 'Concepts TIC', total_points: 40, oral: 4, ecrit: 10, pratique: 20, savoir_etre: 6 }
      ]
    },
    {
      code: 'C6',
      nom: 'Pratiquer les activités physiques, sportives et artistiques',
      total_points: 60,
      sous_competences: [
        { code: '6A1', nom: 'Activités physiques/sportives (aptes)', total_points: 20, oral: 2, ecrit: 2, pratique: 12, savoir_etre: 4 },
        { code: '6A2', nom: 'Activités physiques/sportives (inaptes)', total_points: 20, oral: 3, ecrit: 15, pratique: 0, savoir_etre: 2 },
        { code: '6B', nom: 'Activités artistiques', total_points: 20, oral: 2, ecrit: 4, pratique: 12, savoir_etre: 2 }
      ]
    }
  ];
}
