const respond = require('../../utils/respond');

function stripCodeFence(input) {
  return String(input || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}

function lookupPath(target, rawPath) {
  return String(rawPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((value, key) => (value == null ? undefined : value[key]), target);
}

async function readInput(message, args) {
  const raw = stripCodeFence(args.join(' '));
  if (raw) return raw;

  const attachment = message.attachments.first();
  if (attachment?.url) {
    return fetch(attachment.url).then((res) => res.text()).catch(() => '');
  }

  if (message.reference?.messageId) {
    const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (!replied) return '';
    const repliedAttachment = replied.attachments.first();
    if (repliedAttachment?.url) {
      return fetch(repliedAttachment.url).then((res) => res.text()).catch(() => '');
    }
    return stripCodeFence(replied.content);
  }

  return '';
}

module.exports = {
  name: 'json',
  aliases: ['jsonfmt'],
  category: 'utility',
  description: 'Validate, format, minify, or inspect JSON.',
  usage: 'json <validate|format|minify|path> <json>',
  examples: ['json validate {"ok":true}', 'json format {"ok":true}', 'json path user.name {"user":{"name":"rumi"}}'],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'validate').toLowerCase();
    if (sub === 'validate' || sub === 'format' || sub === 'minify') {
      const rawInput = await readInput(message, args);
      if (!rawInput) return respond.reply(message, 'info', 'Paste JSON after the command, attach a `.json` file, or reply to a message containing JSON.');

      let parsed;
      try {
        parsed = JSON.parse(rawInput);
      } catch (error) {
        return respond.reply(message, 'bad', `I found invalid JSON: ${error.message}.`);
      }

      if (sub === 'validate') {
        return respond.reply(message, 'good', null, {
          mentionUser: false,
          title: 'JSON is valid',
          allowTitle: true,
          description: `Top-level type: \`${Array.isArray(parsed) ? 'array' : typeof parsed}\``,
          fields: [
            {
              name: 'Top-level keys',
              value: Array.isArray(parsed)
                ? `Array length: \`${parsed.length}\``
                : Object.keys(parsed || {}).slice(0, 20).join(', ') || 'No keys',
              inline: false
            }
          ]
        });
      }

      if (sub === 'format') {
        const formatted = JSON.stringify(parsed, null, 2).slice(0, 1900);
        return respond.reply(message, 'good', `\`\`\`json\n${formatted}\n\`\`\``);
      }

      const minified = JSON.stringify(parsed).slice(0, 1900);
      return respond.reply(message, 'good', `\`\`\`json\n${minified}\n\`\`\``);
    }

    if (sub === 'path') {
      const path = args.shift();
      const rawInput = await readInput(message, args);
      if (!path) return respond.reply(message, 'info', 'Use `json path <dot.path> <json>`.');
      if (!rawInput) return respond.reply(message, 'info', 'Paste JSON after the path or attach a `.json` file.');

      let parsed;
      try {
        parsed = JSON.parse(rawInput);
      } catch (error) {
        return respond.reply(message, 'bad', `I found invalid JSON: ${error.message}.`);
      }

      const value = lookupPath(parsed, path);
      if (typeof value === 'undefined') return respond.reply(message, 'bad', 'I could not find that path in the JSON.');
      const output = JSON.stringify(value, null, 2).slice(0, 1900);
      return respond.reply(message, 'info', `\`\`\`json\n${output}\n\`\`\``);
    }

    return respond.reply(message, 'info', 'Use `json validate`, `json format`, `json minify`, or `json path`.');
  }
};
