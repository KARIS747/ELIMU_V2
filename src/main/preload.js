/**
 * preload.js - Pont sécurisé entre le processus main et le renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('elimuAPI', {

  // ==========================================
  // AUTHENTIFICATION
  // ==========================================

  isFirstLaunch: () => ipcRenderer.invoke('auth:isFirstLaunch'),
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  createAdmin: (username, password, question, reponse) => ipcRenderer.invoke('auth:createAdmin', username, password, question, reponse),
  getQuestionSecrete: (username) => ipcRenderer.invoke('auth:getQuestionSecrete', username),
  reinitialiserMotDePasse: (username, reponse, nouveauMdp) => ipcRenderer.invoke('auth:reinitialiserMotDePasse', username, reponse, nouveauMdp),

  // ==========================================
  // CLASSES
  // ==========================================

  getClasses: () => ipcRenderer.invoke('db:getClasses'),
  addClass: (classeData) => ipcRenderer.invoke('db:addClass', classeData),
  updateClass: (id, classeData) => ipcRenderer.invoke('db:updateClass', id, classeData),
  deleteClass: (id) => ipcRenderer.invoke('db:deleteClass', id),

  // ==========================================
  // ÉLÈVES
  // ==========================================

  getEleves: (classeId = null) => ipcRenderer.invoke('db:getEleves', classeId),
  getElevesPagines: (classeId = null, recherche = '', page = 1, limit = 50, sexe = '') =>
    ipcRenderer.invoke('db:getElevesPagines', classeId, recherche, page, limit, sexe),
  getEleveDetail: (eleveId) => ipcRenderer.invoke('db:getEleveDetail', eleveId),
  addEleve: (eleveData) => ipcRenderer.invoke('db:addEleve', eleveData),
  updateEleve: (id, eleveData) => ipcRenderer.invoke('db:updateEleve', id, eleveData),
  deleteEleve: (id) => ipcRenderer.invoke('db:deleteEleve', id),

  // ==========================================
  // MATIÈRES ET NOTES
  // ==========================================

  getMatieres: () => ipcRenderer.invoke('db:getMatieres'),
  addMatiere: (nom) => ipcRenderer.invoke('db:addMatiere', nom),
  deleteMatiere: (id) => ipcRenderer.invoke('db:deleteMatiere', id),
  getNotesByClasse: (classeId, matiereId = null) => ipcRenderer.invoke('db:getNotesByClasse', classeId, matiereId),
  updateMatiereCoefficient: (id, coefficient) => ipcRenderer.invoke('db:updateMatiereCoefficient', id, coefficient),

  // ==========================================
  // ABSENCES ET SANCTIONS
  // ==========================================

  addAbsence: (data) => ipcRenderer.invoke('db:addAbsence', data),
  addSanction: (data) => ipcRenderer.invoke('db:addSanction', data),

  // ==========================================
  // HEURES D'ABSENCE
  // ==========================================

  getHeuresAbsence: (eleveId) => ipcRenderer.invoke('db:getHeuresAbsence', eleveId),
  saveHeuresAbsence: (data) => ipcRenderer.invoke('db:saveHeuresAbsence', data),
  importAbsencesCSV: (data) => ipcRenderer.invoke('db:importAbsencesCSV', data),
  importAbsencesExcel: (data) => ipcRenderer.invoke('db:importAbsencesExcel', data),
  readTextFile: (filePath) => ipcRenderer.invoke('fs:readTextFile', filePath),

  // ==========================================
  // DASHBOARD - STATISTIQUES
  // ==========================================

  getDashboardStats: (classeId = null, periode = 'Tous', sequence = 0, niveau = null) => ipcRenderer.invoke('db:getDashboardStats', classeId, periode, sequence, niveau),
  getEvolutionStats: (classeId = null, niveau = null) => ipcRenderer.invoke('db:getEvolutionStats', classeId, niveau),

  // ==========================================
  // IMPORT / EXPORT
  // ==========================================

  selectFile: () => ipcRenderer.invoke('import:selectFile'),
  importExcel: (filePath, classeId, matiereId, periode, sequence, utilisateurId) =>
    ipcRenderer.invoke('import:excel', filePath, classeId, matiereId, periode, sequence, utilisateurId),
  importListeEleves: (filePath, classeId, mode, utilisateurId) =>
    ipcRenderer.invoke('import:listeEleves', filePath, classeId, mode, utilisateurId),
  importListeProfesseurs: (filePath, mode, utilisateurId) =>
    ipcRenderer.invoke('import:listeProfesseurs', filePath, mode, utilisateurId),
  exportPDF: (eleveId, periode, sequence, utilisateurId, lang) => ipcRenderer.invoke('export:pdf', eleveId, periode, sequence, utilisateurId, lang),
  exportExcel: (classeId, utilisateurId, lang) => ipcRenderer.invoke('export:excel', classeId, utilisateurId, lang),
  exportExcelRentree: (classeId, utilisateurId, lang) => ipcRenderer.invoke('export:excelRentree', classeId, utilisateurId, lang),
  exportModeleImport: (classeId, utilisateurId, lang) => ipcRenderer.invoke('export:modeleImport', classeId, utilisateurId, lang),
  exportModeleImportProfesseurs: (lang) => ipcRenderer.invoke('export:modeleImportProfesseurs', lang),
  exportBulletinClasse: (classeId, periode, utilisateurId, lang) => ipcRenderer.invoke('export:bulletinClasse', classeId, periode, utilisateurId, lang),
  exportBulletinRecap: (eleveId, utilisateurId, lang) => ipcRenderer.invoke('export:bulletinRecap', eleveId, utilisateurId, lang),
  exportRecapClasse: (classeId, utilisateurId, lang) => ipcRenderer.invoke('export:recapClasse', classeId, utilisateurId, lang),
  exportBordereau: (classeId, matiereId, trimestre, sequence, utilisateurId, lang) => ipcRenderer.invoke('export:bordereau', classeId, matiereId, trimestre, sequence, utilisateurId, lang),
  exportBordereauAbsences: (classeId, trimestre, utilisateurId, lang) => ipcRenderer.invoke('export:bordereauAbsences', classeId, trimestre, utilisateurId, lang),
  exportListeEleves: (classeId, utilisateurId, lang) => ipcRenderer.invoke('export:listeEleves', classeId, utilisateurId, lang),
  exportBordereauEmargement: (classeId, trimestre, utilisateurId, translations) => ipcRenderer.invoke('export:bordereauEmargement', classeId, trimestre, utilisateurId, translations),
  exportModeleAbsences: (classeId, utilisateurId, periode, lang) => ipcRenderer.invoke('export:modeleAbsences', classeId, utilisateurId, periode, lang),
  exportModeleNotes: (classeId, utilisateurId, lang) => ipcRenderer.invoke('export:modeleNotes', classeId, utilisateurId, lang),

  // ==========================================
  // NOTES (saisie manuelle)
  // ==========================================
  saveNotes: (data) => ipcRenderer.invoke('db:saveNotes', data),

  // ==========================================
  // SAUVEGARDE
  // ==========================================

  backup: (utilisateurId, customFolder) => ipcRenderer.invoke('backup:create', utilisateurId, customFolder),
  backupListe: (customFolder) => ipcRenderer.invoke('backup:liste', customFolder),
  nouvelleAnneeScolaire: (utilisateurId) => ipcRenderer.invoke('db:nouvelleAnneeScolaire', utilisateurId),
  restore: (utilisateurId) => ipcRenderer.invoke('backup:restore', utilisateurId),

  // ==========================================
  // PARAMÈTRES
  // ==========================================

  getParametres: () => ipcRenderer.invoke('db:getParametres'),
  saveParametres: (data) => ipcRenderer.invoke('db:saveParametres', data),

  // ==========================================
  // BULLETIN CONFIG
  // ==========================================

  getBulletinConfig: () => ipcRenderer.invoke('db:getBulletinConfig'),
  saveBulletinConfig: (data) => ipcRenderer.invoke('db:saveBulletinConfig', data),
  selectBackupFolder: () => ipcRenderer.invoke('dialog:selectBackupFolder'),
  uploadLogo: () => ipcRenderer.invoke('dialog:uploadLogo'),

  // ==========================================
  // RÈGLES ABSENCES
  // ==========================================

  getReglesAbsences: () => ipcRenderer.invoke('db:getReglesAbsences'),
  saveReglesAbsences: (regles) => ipcRenderer.invoke('db:saveReglesAbsences', regles),

  // ==========================================
  // GROUPES DE MATIÈRES
  // ==========================================

  getGroupesMatieres: () => ipcRenderer.invoke('db:getGroupesMatieres'),
  saveGroupesMatieres: (groupes) => ipcRenderer.invoke('db:saveGroupesMatieres', groupes),

  // ==========================================
  // AUDIT
  // ==========================================

  getAuditLogs: (limit = 50) => ipcRenderer.invoke('audit:getLogs', limit),

  // ==========================================
  // GESTION UTILISATEURS (avec ID utilisateur connecté)
  // ==========================================

  getUtilisateurs: () => ipcRenderer.invoke('auth:getUtilisateurs'),
  createUtilisateur: (data, utilisateurId) => ipcRenderer.invoke('auth:createUtilisateur', data, utilisateurId),
  updateUtilisateur: (id, data, utilisateurId) => ipcRenderer.invoke('auth:updateUtilisateur', id, data, utilisateurId),
  deleteUtilisateur: (id, utilisateurId) => ipcRenderer.invoke('auth:deleteUtilisateur', id, utilisateurId),

  // ==========================================
  // ÉVÉNEMENTS DE PROGRESSION POUR EXPORTS
  // ==========================================

  // ÉVÉNEMENTS DE PROGRESSION POUR EXPORTS
  onExportProgress: (callback) => {
    ipcRenderer.on('export-progress', (event, data) => callback(data));
    ipcRenderer.on('parents:export-progress', (event, data) => callback(data));
  },
  removeExportProgressListener: () => {
    ipcRenderer.removeAllListeners('export-progress');
    ipcRenderer.removeAllListeners('parents:export-progress');
  },

  onParentGenerationProgress: (callback) => {
    ipcRenderer.on('parents:generation-progress', (event, data) => callback(data));
  },
  removeParentGenerationProgressListener: () => {
    ipcRenderer.removeAllListeners('parents:generation-progress');
  },

  // ==========================================
  // PROFESSEURS (V2 - Comptes Enseignants PWA)
  // ==========================================

  getProfesseurs:            (filtres)               => ipcRenderer.invoke('db:getProfesseurs',            filtres),
  getProfesseursList:        (classeId)              => ipcRenderer.invoke('db:getProfesseursList',        classeId),
  getProfesseurDetail:       (id)                    => ipcRenderer.invoke('db:getProfesseurDetail',       id),
  createTeacherAccount:      (data)                  => ipcRenderer.invoke('db:createTeacherAccount',      data),
  updateProfesseur:          (id, data)              => ipcRenderer.invoke('db:updateProfesseur',          id, data),
  suspendTeacherAccount:     (id)                    => ipcRenderer.invoke('db:suspendTeacherAccount',     id),
  reactivateTeacherAccount:  (id)                    => ipcRenderer.invoke('db:reactivateTeacherAccount',  id),
  resetTeacherPassword:      (id)                    => ipcRenderer.invoke('db:resetTeacherPassword',      id),
  getTeacherLoginHistory:    (id)                    => ipcRenderer.invoke('db:getTeacherLoginHistory',    id),
  printTeacherAccessCard:    (id, lang, pwdOverride) => ipcRenderer.invoke('db:printTeacherAccessCard',    id, lang, pwdOverride),
  deleteProfesseur:          (id)                    => ipcRenderer.invoke('db:deleteProfesseur',          id),
  updateClassesEnseignees:   (profId, classeIds)     => ipcRenderer.invoke('db:updateClassesEnseignees',   profId, classeIds),
  getClassesByProfesseur:    (profId)                => ipcRenderer.invoke('db:getClassesByProfesseur',    profId),

  // ==========================================
  // PARENTS
  // ==========================================

  getParents: (recherche) => ipcRenderer.invoke('parents:getListe', recherche),
  generateParentPassword: (parentId) => ipcRenderer.invoke('parents:genererMdp', parentId),
  generateAllParentPasswords: () => ipcRenderer.invoke('parents:genererTousMdp'),
  printParentCard: (parentId, lang, passwordOverride = null) => ipcRenderer.invoke('parents:imprimerFiche', parentId, lang, passwordOverride),
  exporterFichesParents: (classeId, lang) => ipcRenderer.invoke('parents:exporterFiches', classeId, lang),
  testPortalConnection: (url, apiKey) => ipcRenderer.invoke('portal:testConnection', { url, apiKey }),
  exportToPortal: (url, apiKey) => ipcRenderer.invoke('portal:export', { url, apiKey }),
  restoreFromPortal: (url, apiKey) => ipcRenderer.invoke('portal:restore', { url, apiKey }),

  // ==========================================
  // FINANCE
  // ==========================================

  /** Statistiques globales (total dû, encaissé, impayés) */
  financeGetStats:            ()       => ipcRenderer.invoke('finance:getStats'),

  /** Types de frais */
  financeGetFraisTypes:       ()       => ipcRenderer.invoke('finance:getFraisTypes'),
  financeAddFraisType:        (data)   => ipcRenderer.invoke('finance:addFraisType',   data),
  financeUpdateFraisType:     (id, data) => ipcRenderer.invoke('finance:updateFraisType', id, data),
  financeDeleteFraisType:     (id)     => ipcRenderer.invoke('finance:deleteFraisType', id),

  /** Génération des tranches */
  financeGenererTranches:     (data)   => ipcRenderer.invoke('finance:genererTranches', data),

  /** Tranches */
  financeGetTranches:         (filtres) => ipcRenderer.invoke('finance:getTranches',       filtres),
  financeGetTranchesParEleve: (eleveId) => ipcRenderer.invoke('finance:getTranchesParEleve', eleveId),

  /** Paiements */
  financeEnregistrerPaiement: (data)   => ipcRenderer.invoke('finance:enregistrerPaiement', data),
  financeGetPaiements:        (filtres) => ipcRenderer.invoke('finance:getPaiements',        filtres),

  /** Impayés */
  financeGetImpayes:          (classeId) => ipcRenderer.invoke('finance:getImpayes',       classeId),
  financeGetTopImpayes:       (limit)    => ipcRenderer.invoke('finance:getTopImpayes',    limit),

  /** Graphique encaissements par mois */
  financeGetEncaissementsParMois: () => ipcRenderer.invoke('finance:getEncaissementsParMois'),

  /** Reçu PDF */
  financeGetRecuPDF:          (paiementId, lang) => ipcRenderer.invoke('finance:getRecuPDF',   paiementId, lang),

  /** Export Excel impayés */
  financeExportImpayes:       (classeId, lang)   => ipcRenderer.invoke('finance:exportImpayes', classeId, lang),

  /** Export PDF impayés */
  financeExportImpayesPDF:    (filtres)   => ipcRenderer.invoke('finance:exportImpayesPDF', filtres),

  // ==========================================
  // LICENCE
  // ==========================================

  getHardwareId: () => ipcRenderer.invoke('license:getHardwareId'),
  saveLicense: (data) => ipcRenderer.invoke('license:save', data),
  getLicenseStatus: () => ipcRenderer.invoke('license:getStatus'),

  // ==========================================
  // ANNÉES SCOLAIRES
  // ==========================================

  getAnneesScolaires: (options) => ipcRenderer.invoke('db:getAnneesScolaires', options),
  addAnneeScolaire: (data) => ipcRenderer.invoke('db:addAnneeScolaire', data),
  updateAnneeScolaire: (data) => ipcRenderer.invoke('db:updateAnneeScolaire', data),
  deleteAnneeScolaire: (data) => ipcRenderer.invoke('db:deleteAnneeScolaire', data),
  deleteAnneeScolaireDefinitive: (data) => ipcRenderer.invoke('db:deleteAnneeScolaireDefinitive', data),
  setAnneeActive: (data) => ipcRenderer.invoke('db:setAnneeActive', data),
  getAnneeActive: () => ipcRenderer.invoke('db:getAnneeActive'),
  migrateAnneeData: (data) => ipcRenderer.invoke('db:migrateAnneeData', data),
  preparerNouvelleAnnee: (data) => ipcRenderer.invoke('annees:preparerNouvelleAnnee', data),

  // ==========================================
  // SYNC PWA (Desktop → PWA Enseignants)
  // ==========================================

  syncToPwa:              ()      => ipcRenderer.invoke('db:syncToPwa'),
  pullFromPwa:            ()      => ipcRenderer.invoke('db:pullFromPwa'),
  getPwaSyncConfig:       ()      => ipcRenderer.invoke('db:getPwaSyncConfig'),
  savePwaSyncConfig:      (data)  => ipcRenderer.invoke('db:savePwaSyncConfig', data),

  // ==========================================
  // AUTOMATIC UPDATER
  // ==========================================

  checkUpdates: () => ipcRenderer.invoke('updater:check'),
  quitAndInstall: () => ipcRenderer.send('updater:quit-and-install'),
  onUpdaterStatus: (callback) => {
    ipcRenderer.on('updater:status', (event, data) => callback(data));
  },
  onUpdaterProgress: (callback) => {
    ipcRenderer.on('updater:progress', (event, data) => callback(data));
  },
  removeUpdaterListeners: () => {
    ipcRenderer.removeAllListeners('updater:status');
    ipcRenderer.removeAllListeners('updater:progress');
  },
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

  // ==========================================
  // AUDIT LOG
  // ==========================================
  logAudit: (action, details, utilisateurId) => ipcRenderer.invoke('audit:log', action, details, utilisateurId),

  // ==========================================
  // ÉVÉNEMENTS LOG
  // ==========================================

  onLog: (callback) => {
    ipcRenderer.on('log:message', (event, message) => callback(message));
  },
  removeLogListeners: () => {
    ipcRenderer.removeAllListeners('log:message');
  },
  
  /** Demande un redémarrage complet de l'application (utile après restauration) */
  relaunchApp: () => ipcRenderer.send('app:relaunch')
});

// ═══════════════════════════════════════════════════════════
// API CURRICULUM (constantes et fonctions de notation)
// ═══════════════════════════════════════════════════════════
const { getNoteToCode, getWeightsForSousCompetence, getPeriodeForUA, UA_TRIMESTRE_MAP, CURRICULUM_TEMPLATES } = require('../shared/constants/curriculum');

contextBridge.exposeInMainWorld('curriculum', {
  getNoteToCode,
  getWeightsForSousCompetence,
  getPeriodeForUA,
  UA_TRIMESTRE_MAP,
  CURRICULUM_TEMPLATES
});
