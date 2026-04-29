const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function resolveScript() {
  const candidates = [
    path.resolve(__dirname, 'start-worker.sh'),
    path.resolve(process.cwd(), 'scripts', 'start-worker.sh'),
    path.resolve(process.cwd(), 'rumi', 'scripts', 'start-worker.sh')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function startBotWorkerFallback(reason) {
  if (reason) {
    console.warn(`[rumi] ${reason}`);
  }

  console.warn('[rumi] falling back to direct bot worker startup');
  process.env.ENABLE_API = process.env.ENABLE_API || 'false';
  process.env.BOT_MODE = process.env.BOT_MODE || 'single';
  process.env.NO_SHARDS = process.env.NO_SHARDS || 'true';
  require(path.resolve(__dirname, '..', 'src', 'index.js'));
}

function main() {
  const scriptPath = resolveScript();
  if (!scriptPath) {
    startBotWorkerFallback('embedded worker shell script was not found');
    return;
  }

  const serviceRoot = path.resolve(path.dirname(scriptPath), '..');
  const child = spawn('sh', [scriptPath], {
    cwd: serviceRoot,
    env: process.env,
    stdio: 'inherit'
  });

  child.on('error', (error) => {
    startBotWorkerFallback(`failed to launch worker shell script: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main();
