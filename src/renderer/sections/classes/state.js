import { t } from '../../locales/index.js';
import { CLASS_TEMPLATES } from './templates.js';

export { t };
export { CLASS_TEMPLATES };

export const state = {
  _state: null,
  toutesLesClasses: [],
  toutesLesMatieres: [],
  classeEnCoursId: null,
  matieresPersonnalisees: [],
  configClasseId: null,
  configMatieres: [],
  configGroupes: [],
  configGroupeSelIdx: null
};

export const LISTE_FRANCOPHONE = [
  { groupe: 'Langues & Littérature', matieres: ['Français', 'Anglais', 'Littérature', 'Langues Nationales', 'Latin', 'Grec', 'Allemand', 'Espagnol', 'Chinois', 'Italien'] },
  { groupe: 'Sciences', matieres: ['Mathématiques', 'Maths Techniques', 'Physique', 'Chimie', 'SVT', 'Sciences de la Vie et de la Terre', 'Sciences Physiques', 'Informatique', 'TIC', 'Biologie', 'Géologie'] },
  { groupe: 'Sciences Humaines', matieres: ['Histoire', 'Géographie', 'Éducation à la Citoyenneté (ECM)', 'Philosophie', 'Éducation Civique', 'Droit', 'Économie', 'Comptabilité', 'Sociologie'] },
  { groupe: 'Arts, Sport & Vie', matieres: ['Arts Plastiques', 'Musique', 'EPS (Sport)', 'Travail Manuel', 'Économie Sociale et Familiale', 'Cuisine', 'Couture', 'Éducation à la Santé', 'Morale'] }
];

export const LISTE_ANGLOPHONE = [
  { groupe: 'Languages & Arts', matieres: ['English Language', 'English Literature', 'French', 'Latin', 'Fine Arts', 'Music', 'German', 'Spanish', 'Language Arts'] },
  { groupe: 'Sciences & Math', matieres: ['Mathematics', 'Further Mathematics', 'Biology', 'Chemistry', 'Physics', 'Computer Science', 'Integrated Science', 'ICT', 'Technical Drawing', 'Anatomy'] },
  { groupe: 'Humanities', matieres: ['History', 'Geography', 'Religious Studies', 'Civics', 'Citizenship', 'Philosophy', 'Economics', 'Commerce', 'Social Studies', 'Logic'] },
  { groupe: 'Vocational & Life', matieres: ['Physical Education', 'Manual Labor', 'Home Economics', 'Accounting', 'Office Practice', 'Food and Nutrition', 'Textiles', 'Health Education', 'Woodwork'] }
];
