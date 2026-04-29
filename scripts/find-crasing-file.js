const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', 'src');

const targets = [
  path.join(root, 'commands.js'),
  path.join(root, 'events'),
  path.join(root, 'systems'),
  path.join(root, 'utils')
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, {
    withFileTypes: true
  });

  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }

  return files;
}

const files = targets.flatMap(walk);

console.log(`[diagnose] testing ${files.length} files...\n`);

let failed = 0;

for (const file of files) {
  const code = `
    process.env.TEST_IMPORT_ONLY = 'true';
    process.env.ENABLE_API = 'false';
    try {
      require(${JSON.stringify(file)});
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  `;

  const result = spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TEST_IMPORT_ONLY: 'true',
      ENABLE_API: 'false'
    }
  });

  if (result.status !== 0) {
    failed += 1;

    console.log('FAILED:', path.relative(path.join(__dirname, '..'), file));
    console.log('exit:', result.status);

    if (result.stderr) {
      console.log(result.stderr.slice(0, 3000));
    }

    if (result.stdout) {
      console.log(result.stdout.slice(0, 1000));
    }

    console.log('---');
  }
}

if (!failed) {
  console.log('[diagnose] no import crashes found.');
} else {
  console.log(`[diagnose] ${failed} files failed.`);
}