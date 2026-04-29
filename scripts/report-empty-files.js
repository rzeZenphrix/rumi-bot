const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.js')) {
      files.push(full);
    }
  }

  return files;
}

const empty = walk(root).filter((file) => {
  const text = fs.readFileSync(file, 'utf8').trim();
  return text.length === 0;
});

if (!empty.length) {
  console.log('No empty JS files found.');
  process.exit(0);
}

console.log(`Found ${empty.length} empty JS file(s):\n`);

for (const file of empty) {
  console.log(path.relative(process.cwd(), file));
}