const { importUANotesFormatB } = require('./import/formatB');
const { importClassicNotes } = require('./import/classic');
const { importListeEleves } = require('./import/listeEleves');
const { importListeProfesseurs } = require('./import/listeProfesseurs');
const { importAbsencesExcel } = require('./import/absencesExcel');
const { importPwaExport } = require('./import/pwaExport');

async function importExcel(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId = null, ecoleId = '') {
  const fileName = filePath.split('/').pop().split('\\').pop();

  const pwaNotesMatch = fileName.match(/^ELIMU_NOTES_/i);
  const pwaAbsencesMatch = fileName.match(/^ELIMU_ABSENCES_/i);

  if (pwaNotesMatch || pwaAbsencesMatch) {
    return await importPwaExport(filePath, utilisateurId, anneeId, ecoleId);
  }

  const formatBMatch = fileName.match(/^ELIMU_([^_]+)_(\d{4}-\d{4})\.xlsx$/i);

  if (formatBMatch) {
    console.log('Dispatcher : Format B detecte pour la classe ' + classeId);
    return await importUANotesFormatB(filePath, classeId, utilisateurId, anneeId, ecoleId);
  } else {
    console.log('Dispatcher : Format classique V1 detecte pour la classe ' + classeId);
    return await importClassicNotes(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId, ecoleId);
  }
}

module.exports = { importExcel, importListeEleves, importListeProfesseurs, importAbsencesExcel, importUANotesFormatB, importPwaExport };