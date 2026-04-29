const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const COMMANDS_ROOT = path.join(ROOT, 'src', 'commands.js');
const OUTPUT = path.join(ROOT, 'docs', 'COMMAND_AUDIT.md');

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(target);
    return entry.name.endsWith('.js') ? [target] : [];
  });
}

function classify(file, source) {
  const lower = source.toLowerCase();
  const lines = source.split(/\r?\n/).length;

  if (!/module\.exports\s*=/.test(source) || !/async execute\s*\(/.test(source)) {
    return { status: 'candidate for removal', reason: 'No normal command export or execute handler.' };
  }

  if (/coming soon|placeholder|not implemented|todo|stub/i.test(source)) {
    return { status: 'placeholder', reason: 'Contains explicit placeholder language.' };
  }

  if (/temporarily disabled|currently unavailable/i.test(source)) {
    return { status: 'broken', reason: 'User-facing logic says the feature is unavailable.' };
  }

  const logicSignals = [
    'fetch(',
    'db.',
    'respond.reply(',
    'message.channel.send(',
    'guild.channels',
    'guild.members',
    'permissionflagsbits',
    'canvas',
    'sharp',
    'ffmpeg',
    'createDashboardUrl',
    'askGemini',
    'setTimeout('
  ];

  const score = logicSignals.reduce((count, signal) => count + (lower.includes(signal.toLowerCase()) ? 1 : 0), 0);

  if (score <= 1 && lines < 90) {
    return { status: 'thin but valid', reason: 'Small command surface with limited logic.' };
  }

  if (score <= 2 && lines < 70) {
    return { status: 'thin but valid', reason: 'Simple command with light runtime behavior.' };
  }

  return { status: 'complete', reason: 'Has a real execute flow and multiple runtime logic signals.' };
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

const files = listFiles(COMMANDS_ROOT).sort();
const byCategory = new Map();
const rows = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = toPosix(path.relative(ROOT, file));
  const category = toPosix(path.relative(COMMANDS_ROOT, file)).split('/')[0];
  const result = classify(file, source);

  rows.push({ category, file: relative, ...result });
  byCategory.set(category, (byCategory.get(category) || 0) + 1);
}

const counts = rows.reduce((map, row) => {
  map[row.status] = (map[row.status] || 0) + 1;
  return map;
}, {});

const lines = [
  '# Command Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Summary',
  '',
  `- Total commands scanned: ${rows.length}`,
  `- Complete: ${counts.complete || 0}`,
  `- Thin but valid: ${counts['thin but valid'] || 0}`,
  `- Placeholder: ${counts.placeholder || 0}`,
  `- Broken: ${counts.broken || 0}`,
  `- Candidate for removal: ${counts['candidate for removal'] || 0}`,
  '',
  '## Category Counts',
  ''
];

for (const [category, count] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`- ${category}: ${count}`);
}

lines.push('', '## Detailed Audit', '', '| Category | File | Status | Reason |', '|---|---|---|---|');

for (const row of rows) {
  lines.push(`| ${row.category} | \`${row.file}\` | ${row.status} | ${row.reason} |`);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`);

console.log(`Wrote ${path.relative(ROOT, OUTPUT)} for ${rows.length} command file(s).`);
