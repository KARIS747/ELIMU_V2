const { getLocalDateString, getLocalDateStringCompact, getLocalTimestampForFile } = require('../../src/shared/utils/dateUtils');

describe('dateUtils', () => {
  test('getLocalDateString returns correct format YYYY-MM-DD', () => {
    const date = new Date(2026, 4, 18); // 18 Mai 2026 (Month is 0-indexed)
    expect(getLocalDateString(date)).toBe('2026-05-18');
  });

  test('getLocalDateStringCompact returns correct format YYYYMMDD', () => {
    const date = new Date(2026, 4, 18);
    expect(getLocalDateStringCompact(date)).toBe('20260518');
  });

  test('getLocalTimestampForFile returns correct format YYYY-MM-DD_HH-mm-ss', () => {
    const date = new Date(2026, 4, 18, 14, 30, 45);
    expect(getLocalTimestampForFile(date)).toBe('2026-05-18_14-30-45');
  });

  test('defaults to current date if no argument is provided', () => {
    const now = new Date();
    const result = getLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    expect(result).toBe(`${year}-${month}-${day}`);
  });
});
