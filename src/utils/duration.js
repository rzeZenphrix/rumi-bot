const DURATION_UNITS = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000
};

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function parseDuration(input, options = {}) {
  if (!input) return null;

  const cleaned = String(input).trim().toLowerCase();

  const match = cleaned.match(
    /^(\d+(?:\.\d+)?)(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i
  );

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = DURATION_UNITS[unit];

  if (!Number.isFinite(amount) || amount <= 0 || !multiplier) return null;

  const ms = Math.round(amount * multiplier);

  if (options.maxMs && ms > options.maxMs) return null;
  if (options.minMs && ms < options.minMs) return null;

  return ms;
}

function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';

  const units = [
    ['d', 24 * 60 * 60 * 1000],
    ['h', 60 * 60 * 1000],
    ['m', 60 * 1000],
    ['s', 1000]
  ];

  const parts = [];
  let remaining = ms;

  for (const [label, size] of units) {
    const count = Math.floor(remaining / size);

    if (!count) continue;

    parts.push(`${count}${label}`);
    remaining -= count * size;
  }

  return parts.slice(0, 2).join(' ') || `${Math.ceil(ms / 1000)}s`;
}

module.exports = {
  MAX_TIMEOUT_MS,
  parseDuration,
  humanDuration
};