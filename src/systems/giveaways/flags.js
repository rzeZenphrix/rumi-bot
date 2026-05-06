function splitArgs(input) {
  const text = Array.isArray(input) ? input.join(' ') : String(input || '');
  const out = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
}

function parseFlags(input) {
  const tokens = splitArgs(input);
  const flags = {};
  const positionals = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const raw = token.slice(2);
    const eq = raw.indexOf('=');
    let key = raw;
    let value = true;
    if (eq !== -1) {
      key = raw.slice(0, eq);
      value = raw.slice(eq + 1);
    } else if (tokens[index + 1] && !tokens[index + 1].startsWith('--')) {
      value = tokens[index + 1];
      index += 1;
    }

    flags[key.toLowerCase()] = value;
  }

  return { flags, positionals, tokens };
}

function parseBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value || '').toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(normalized)) return true;
  if (['false', 'no', 'off', '0'].includes(normalized)) return false;
  return fallback;
}

function parseDurationMs(value) {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(\d+(?:\.\d+)?)(s|m|h|d|w)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] || 's';
  const multipliers = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000
  };
  const ms = amount * multipliers[unit];
  if (!Number.isFinite(ms) || ms < 10_000) return null;
  return Math.min(ms, 1000 * 60 * 60 * 24 * 365);
}

function normalizeColor(value, fallback = '#ffb6c1') {
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`;
  return fallback;
}

function colorInt(value, fallback = 0xffb6c1) {
  const color = normalizeColor(value, null);
  if (!color) return fallback;
  return Number.parseInt(color.slice(1), 16);
}

function formatDuration(ms) {
  const seconds = Math.max(1, Math.round(Number(ms || 0) / 1000));
  const units = [
    ['w', 604800],
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1]
  ];
  for (const [label, size] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label}`;
  }
  return `${seconds}s`;
}

function unix(dateLike) {
  const date = new Date(dateLike);
  return Math.floor(date.getTime() / 1000);
}

module.exports = {
  splitArgs,
  parseFlags,
  parseBool,
  parseDurationMs,
  normalizeColor,
  colorInt,
  formatDuration,
  unix
};
