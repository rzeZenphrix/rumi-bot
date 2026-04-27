const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

function parseTimeBits(input) {
  const match = String(input || '').trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (match[3] || '').toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function applyTime(date, time) {
  const next = new Date(date);
  next.setHours(time?.hour ?? 9, time?.minute ?? 0, 0, 0);
  return next;
}

function parseNaturalDate(input, now = new Date()) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/i.test(text)) {
    const iso = new Date(text);
    return Number.isNaN(iso.getTime()) ? null : { date: iso, ambiguous: false };
  }

  let match = text.match(/^in (\d+) (minute|minutes|hour|hours|day|days)$/i);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    const date = new Date(now);
    if (unit.startsWith('minute')) date.setMinutes(date.getMinutes() + amount);
    if (unit.startsWith('hour')) date.setHours(date.getHours() + amount);
    if (unit.startsWith('day')) date.setDate(date.getDate() + amount);
    return { date, ambiguous: false };
  }

  match = text.match(/^tomorrow(?:\s+(.+))?$/i);
  if (match) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return { date: applyTime(date, parseTimeBits(match[1])), ambiguous: !match[1] };
  }

  match = text.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at\s+(.+)|\s+(.+))?$/i);
  if (match) {
    const weekday = WEEKDAYS.indexOf(match[1].toLowerCase());
    const date = new Date(now);
    const diff = (weekday - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + diff);
    return { date: applyTime(date, parseTimeBits(match[2] || match[3])), ambiguous: !(match[2] || match[3]) };
  }

  match = text.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at\s+(.+)|\s+(.+))?$/i);
  if (match) {
    const weekday = WEEKDAYS.indexOf(match[1].toLowerCase());
    const date = new Date(now);
    const diff = (weekday - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + diff);
    return { date: applyTime(date, parseTimeBits(match[2] || match[3])), ambiguous: !(match[2] || match[3]) };
  }

  match = text.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s+at\s+(.+)|\s+(.+))?$/i);
  if (match) {
    const date = new Date(now);
    date.setMonth(MONTHS[match[1]], Number(match[2]));
    if (date < now) date.setFullYear(date.getFullYear() + 1);
    return { date: applyTime(date, parseTimeBits(match[3] || match[4])), ambiguous: !(match[3] || match[4]) };
  }

  const fallback = new Date(input);
  if (!Number.isNaN(fallback.getTime())) {
    return { date: fallback, ambiguous: false };
  }

  return null;
}

module.exports = {
  parseNaturalDate
};
