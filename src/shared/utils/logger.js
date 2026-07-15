const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Obtenir le chemin du dossier de données utilisateur
const userDataPath = app.getPath('userData');
const logDir = path.join(userDataPath, 'logs');

// Créer le dossier logs s'il n'existe pas
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configuration du logger Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d'
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d'
    })
  ]
});

// Si on est en développement, on affiche aussi dans la console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Exporter une fonction pour créer un logger avec un préfixe
function createLogger(module) {
  return {
    info: (message) => logger.info(`[${module}] ${message}`),
    error: (message) => logger.error(`[${module}] ${message}`),
    warn: (message) => logger.warn(`[${module}] ${message}`),
    debug: (message) => logger.debug(`[${module}] ${message}`)
  };
}

module.exports = { logger, createLogger };
