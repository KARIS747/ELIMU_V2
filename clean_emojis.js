const fs = require('fs');

function cleanFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Regex for emojis and common symbols used as icons
    // Added \u2139 for ℹ️
    // Added \u2600-\u26FF, \u2700-\u27BF
    // Added \u{1F300}-\u{1F9FF}
    // Added \u{1F600}-\u{1F64F} (emoticons)
    // Added \u{1F1E6}-\u{1F1FF} (flags)
    // Added \u{FE0F} (variation selector)
    // Added \u{200D} (ZWJ)
    
    // Remove emoji and ONE optional space after it
    let cleaned = content.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{FE0F}\u{200D}\u{2139}]\s?/gu, '');
    
    // Also handle case where space was BEFORE the emoji
    cleaned = cleaned.replace(/\s?[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{FE0F}\u{200D}\u{2139}]/gu, '');

    fs.writeFileSync(filePath, cleaned);
}

cleanFile('src/renderer/locales/fr.js');
cleanFile('src/renderer/locales/en.js');
cleanFile('src/renderer/sections/parametres/parametres.html');
console.log('Cleaned files');
