const fs = require('node:fs');
const path = require('node:path');
const respond = require('../../utils/respond');
const pkg = require('../../../package.json');

function readJsonChangelog(file) {
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : null;
}

function readMarkdownChangelog(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return null;
  return [{
    version: pkg.version,
    date: null,
    changes: text.split(/\r?\n/).filter(Boolean).slice(0, 12)
  }];
}

function loadChangelog() {
  const root = path.join(__dirname, '..', '..', '..');
  const sources = [
    () => readJsonChangelog(path.join(root, 'data', 'changelog.json')),
    () => readJsonChangelog(path.join(root, 'src', 'data', 'changelog.json')),
    () => readMarkdownChangelog(path.join(root, 'CHANGELOG.md'))
  ];

  for (const read of sources) {
    try {
      const entries = read();
      if (entries?.length) return entries;
    } catch (_error) {
      return null;
    }
  }

  return null;
}

module.exports = {
  name: 'changelog',
  aliases: ['changes'],
  category: 'core',
  description: 'Show recent Rumi changes from the changelog file.',
  usage: 'changelog',
  examples: ['changelog'],
  async execute({ message }) {
    const entries = loadChangelog();

    if (!entries) {
      return respond.reply(message, 'info', `I could not load a changelog file. Current version: \`${pkg.version}\`.`);
    }

    const latest = entries[0];
    const changes = Array.isArray(latest.changes) ? latest.changes : [];

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: [
        '**Recent changes**',
        `Version: \`${latest.version || pkg.version}\`${latest.date ? ` (${latest.date})` : ''}`,
        '',
        changes.length ? changes.slice(0, 10).map((change) => `- ${change}`).join('\n') : 'No changes listed.'
      ].join('\n')
    });
  }
};
