const crypto = require('crypto');

const defaultLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args)
};

function trouverEleve(eleves, nom, prenom) {
  const normaliser = (str) =>
    (str || '').toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const nomN = normaliser(nom);
  const prenomN = normaliser(prenom);

  let eleve = eleves.find(e =>
    normaliser(e.nom) === nomN && normaliser(e.prenom) === prenomN
  );

  if (!eleve && !prenomN) {
    eleve = eleves.find(e => normaliser(e.nom) === nomN);
  }

  if (!eleve && nomN.length >= 3) {
    eleve = eleves.find(e =>
      normaliser(e.nom).startsWith(nomN) || nomN.startsWith(normaliser(e.nom))
    );
  }

  return eleve || null;
}

function validateExcelMetadata(workbook, expectedEcoleId, logger) {
  const metaSheet = workbook.worksheets.find(ws => ws.name === '_metadata');
  if (!metaSheet) return null;

  const rows = [];
  metaSheet.eachRow((row) => { rows.push(row); });
  if (rows.length < 2) return null;

  const meta = {};
  const headers = rows[0].values;
  const values = rows[1].values;
  for (let i = 1; i < headers.length; i++) {
    meta[headers[i]] = values[i];
  }

  if (!meta.ecole_id) {
    return { valid: false, error: 'ecole_id manquant dans la feuille _metadata' };
  }
  if (meta.ecole_id !== expectedEcoleId) {
    return { valid: false, error: `ecole_id du fichier (${meta.ecole_id}) ne correspond pas à l'école courante (${expectedEcoleId})` };
  }

  if (meta.hash) {
    const dataSheet = workbook.worksheets[0];
    if (dataSheet) {
      const dataRows = [];
      dataSheet.eachRow((row, rowNum) => {
        if (rowNum > 1) {
          const rowData = {};
          row.values.forEach((val, idx) => {
            if (idx > 0) rowData[`col${idx}`] = val;
          });
          dataRows.push(rowData);
        }
      });
      const recomputed = crypto.createHash('sha256').update(JSON.stringify({ rows: dataRows, meta: { ...meta, hash: undefined } })).digest('hex');
      if (recomputed !== meta.hash) {
        return { valid: false, error: 'Signature SHA-256 invalide — le fichier a été modifié' };
      }
    }
  }

  return { valid: true, meta };
}

function readPwaMetadata(workbook, expectedEcoleId) {
  const metaSheet = workbook.worksheets.find(ws => ws.name === '_metadata');
  if (!metaSheet) return null;

  const rows = [];
  metaSheet.eachRow((row) => { rows.push(row); });
  if (rows.length < 2) return null;

  const meta = {};
  const headers = rows[0].values;
  const values = rows[1].values;
  for (let i = 1; i < headers.length; i++) {
    meta[headers[i]] = values[i];
  }
  return meta;
}

module.exports = { defaultLogger, trouverEleve, validateExcelMetadata, readPwaMetadata };