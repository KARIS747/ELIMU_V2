
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './license-manager/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function reset() {
  const newPassword = 'karis2026'; // Mot de passe temporaire
  const hash = await bcrypt.hash(newPassword, 10);
  
  try {
    await pool.query("UPDATE lm_users SET password_hash = $1 WHERE username = 'karis'", [hash]);
    console.log('✅ Mot de passe réinitialisé pour "karis"');
    console.log('👉 Nouvel identifiant : karis / karis2026');
    console.log('Pensez à le changer dans votre admin.');
  } catch (e) {
    console.error('❌ Erreur lors de la réinitialisation :', e.message);
  } finally {
    await pool.end();
  }
}

reset();
