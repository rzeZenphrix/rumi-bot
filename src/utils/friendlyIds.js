function compactId(value, length = 8) {
  return String(value || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, length)
    .toLowerCase();
}

function friendlyId(value, prefix = 'id') {
  const compact = compactId(value);
  return compact ? `${prefix}-${compact}` : `${prefix}-unknown`;
}

function matchesFriendlyId(value, input, prefix = 'id') {
  const raw = String(value || '').toLowerCase();
  const wanted = String(input || '').trim().toLowerCase();
  if (!wanted) return false;
  return wanted === raw || wanted === friendlyId(value, prefix) || raw.startsWith(wanted.replace(`${prefix}-`, ''));
}

module.exports = {
  compactId,
  friendlyId,
  matchesFriendlyId
};
