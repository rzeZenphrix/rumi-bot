const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CHECK_TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS || 8000);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }

  return out;
}

const files = [
  path.join(process.cwd(), 'src', 'index.js'),
  ...walk(path.join(process.cwd(), 'src'))
].filter((file, index, arr) => arr.indexOf(file) === index && fs.existsSync(file));

let failed = 0;
let timedOut = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS
  });

  if (result.error?.code === 'ETIMEDOUT') {
    timedOut += 1;
    failed += 1;
    console.error(`Syntax check timed out: ${path.relative(process.cwd(), file)}`);
    continue;
  }

  if (result.status !== 0) {
    failed += 1;
    console.error(`Syntax check failed: ${path.relative(process.cwd(), file)}`);
    if (result.stderr) console.error(result.stderr);
    if (result.stdout) console.error(result.stdout);
  }
}

if (failed) {
  console.error(`Syntax check failed for ${failed} file(s); timed out: ${timedOut}.`);
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} file(s).`);
