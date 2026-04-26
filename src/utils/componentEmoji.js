function isUnicodeEmoji(value) {
  return /\p{Emoji}/u.test(value) && !/^[a-z0-9_-]+$/i.test(value);
}

function parseCustomEmoji(value) {
  const match = String(value || '').match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);

  if (!match) return null;

  return {
    name: match[1],
    id: match[2],
    animated: String(value).startsWith('<a:')
  };
}

function parseComponentEmoji(value) {
  const raw = String(value || '').trim();

  if (!raw) return null;

  const custom = parseCustomEmoji(raw);
  if (custom) return custom;

  if (isUnicodeEmoji(raw)) {
    return {
      name: raw,
      animated: false
    };
  }

  return null;
}

module.exports = {
  parseComponentEmoji
};