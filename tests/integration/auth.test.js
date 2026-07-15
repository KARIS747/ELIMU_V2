const path = require('path');
const fs = require('fs');
const { initializeDatabase, closeDatabase, run, get } = require('../../src/shared/database/db');
const auth = require('../../src/shared/security/auth');

describe('Auth Integration', () => {
  const testDbPath = path.join(__dirname, 'test_auth.db');

  beforeAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    await initializeDatabase(testDbPath);
  });

  afterAll(async () => {
    await closeDatabase();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  beforeEach(async () => {
    await run('DELETE FROM utilisateurs');
  });

  test('isFirstLaunch returns true when no users exist', async () => {
    const isFirst = await auth.isFirstLaunch();
    expect(isFirst).toBe(true);
  });

  test('createAdmin creates a new admin user', async () => {
    const result = await auth.createAdmin('admin', 'password123');
    expect(result.success).toBe(true);
    expect(result.user.nom_utilisateur).toBe('admin');
    expect(result.user.role).toBe('admin');

    const isFirst = await auth.isFirstLaunch();
    expect(isFirst).toBe(false);
  });

  test('login works with correct credentials', async () => {
    await auth.createAdmin('testuser', 'secretpassword');
    const result = await auth.login('testuser', 'secretpassword');
    expect(result.success).toBe(true);
    expect(result.user.nom_utilisateur).toBe('testuser');
  });

  test('login fails with incorrect password', async () => {
    await auth.createAdmin('testuser', 'secretpassword');
    const result = await auth.login('testuser', 'wrongpassword');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Identifiants incorrects');
  });

  test('login fails with non-existent user', async () => {
    const result = await auth.login('nobody', 'password');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Identifiants incorrects');
  });

  test('login fails after too many attempts (brute force protection)', async () => {
    const username = 'bruteforce';
    await auth.createAdmin(username, 'password');
    
    // 5 attempts are allowed
    for (let i = 0; i < 5; i++) {
      await auth.login(username, 'wrong');
    }
    
    const result = await auth.login(username, 'password'); // Correct password but blocked
    expect(result.success).toBe(false);
    expect(result.error).toContain('Trop de tentatives');
  });

  test('reinitialiserMotDePasse works with correct secret answer', async () => {
    await auth.createAdmin('recovery', 'oldpass', 'Ma ville?', 'Douala');
    const result = await auth.reinitialiserMotDePasse('recovery', 'Douala', 'newpass123');
    expect(result.success).toBe(true);

    const loginRes = await auth.login('recovery', 'newpass123');
    expect(loginRes.success).toBe(true);
  });
});
