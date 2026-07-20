function normalizePhone(raw) {
  if (!raw) return '';
  let digits = raw.replace(/[\s\-\.\(\)]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('237')) return '+' + digits;
  return '+237' + digits;
}

module.exports = { normalizePhone };
