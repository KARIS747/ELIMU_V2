
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({
    margin: 50,
    size: 'A4'
});

const outputPath = path.join(process.cwd(), 'Avantages_Elimu.pdf');
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// --- Couleurs et Styles ---
const colors = {
    primary: '#1a3c6e',
    accent: '#58a6ff',
    success: '#3fb950',
    text: '#1f2328',
    secondary: '#656d76',
    bg: '#f6f8fa'
};

// --- En-tête ---
doc.rect(0, 0, 595, 120).fill(colors.primary);
doc.fillColor('#ffffff')
   .font('Helvetica-Bold')
   .fontSize(28)
   .text('ÉLIMU 2026', 50, 45);
doc.fontSize(12)
   .font('Helvetica')
   .text("L'éducation en mouvement - Solution de Gestion Scolaire", 50, 80);

// --- Titre Principal ---
let y = 150;
doc.fillColor(colors.primary)
   .font('Helvetica-Bold')
   .fontSize(22)
   .text('Pourquoi choisir Élimu ?', 50, y);
y += 40;

// --- Introduction ---
doc.fillColor(colors.text)
   .font('Helvetica')
   .fontSize(11)
   .text("Élimu est bien plus qu'un simple logiciel de gestion scolaire. C'est un écosystème complet conçu pour répondre aux défis réels des établissements scolaires en Afrique francophone, alliant robustesse hors-ligne et connectivité moderne.", 50, y, { width: 495, align: 'justify' });
y += 60;

// --- Fonction pour les avantages ---
function drawAdvantage(title, description, iconColor) {
    // Petit indicateur de couleur
    doc.rect(50, y, 5, 40).fill(iconColor);
    
    doc.fillColor(colors.text)
       .font('Helvetica-Bold')
       .fontSize(13)
       .text(title, 65, y);
    
    doc.fillColor(colors.secondary)
       .font('Helvetica')
       .fontSize(10)
       .text(description, 65, y + 18, { width: 480 });
    
    y += 65;
}

drawAdvantage(
    "1. Architecture Offline-First (100% Hors-Ligne)",
    "Travaillez sans interruption même sans connexion internet. Toutes vos données sont stockées localement sur votre ordinateur, garantissant rapidité et disponibilité permanente.",
    colors.accent
);

drawAdvantage(
    "2. Écosystème Connecté (Portail Parents)",
    "Synchronisez vos données en un clic vers un portail web sécurisé. Les parents consultent les notes, les absences et les paiements de leurs enfants depuis leur smartphone.",
    colors.success
);

drawAdvantage(
    "3. Bulletins Professionnels Multi-Styles",
    "Générez des bulletins automatiques en quelques secondes. Choisissez entre les styles Officiel (administratif), Moderne (design FIFA) ou Minimaliste pour vos impressions.",
    colors.primary
);

drawAdvantage(
    "4. Sécurité de Grade Professionnel",
    "Vos données sont protégées par un système de licence robuste et un chiffrement des mots de passe (BCrypt). Gestion des rôles pour contrôler l'accès des employés.",
    '#f85149'
);

drawAdvantage(
    "5. Interface Moderne et Intuitive",
    "Une expérience utilisateur fluide inspirée des meilleurs standards actuels. Simple à prendre en main pour tout le personnel administratif, sans formation complexe.",
    colors.warning
);

// --- Pied de page ---
doc.rect(0, 770, 595, 71).fill(colors.bg);
doc.fillColor(colors.secondary)
   .fontSize(9)
   .text('Document généré par l\'assistant intelligent Élimu - ' + new Date().toLocaleDateString('fr-FR'), 50, 790, { align: 'center', width: 495 });
doc.fillColor(colors.primary)
   .font('Helvetica-Bold')
   .text('www.elimu-app.com', 50, 805, { align: 'center', width: 495 });

doc.end();

stream.on('finish', () => {
    console.log('PDF généré avec succès : ' + outputPath);
});
