const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');

let ffmpegPath = process.env.FFMPEG_PATH || null;

try {
  const ffmpegStatic = require('ffmpeg-static');
  if (!ffmpegPath && ffmpegStatic) ffmpegPath = ffmpegStatic;
} catch {
  // system ffmpeg fallback
}

const FFMPEG_BIN = ffmpegPath || process.env.FFMPEG_BIN || 'ffmpeg';

const MAX_INPUT_BYTES = Number(process.env.MEDIA_MAX_INPUT_BYTES || 80 * 1024 * 1024);
const MAX_OUTPUT_BYTES = Number(process.env.MEDIA_MAX_OUTPUT_BYTES || 24 * 1024 * 1024);
const MAX_GIF_DURATION = Number(process.env.MEDIA_MAX_GIF_DURATION || 12);
const MAX_MP4_DURATION = Number(process.env.MEDIA_MAX_MP4_DURATION || 90);
const PROCESS_TIMEOUT_MS = Number(process.env.MEDIA_PROCESS_TIMEOUT_MS || 180000);

function mediaTempDir() {
  const dir = path.join(os.tmpdir(), `rumi-media-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  if (!dir || !dir.includes('rumi-media-')) return;
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function firstUrl(text) {
  return String(text || '').match(/https?:\/\/[^\s<>)]+/i)?.[0] || null;
}

function isPlatformUrl(url) {
  return /(youtube\.com|youtu\.be|music\.youtube\.com|pinterest\.|pin\.it|tiktok\.com|instagram\.com|x\.com|twitter\.com|reddit\.com|vimeo\.com)/i.test(String(url || ''));
}

function extFromUrl(url, fallback = 'bin') {
  try {
    const clean = new URL(url);
    const ext = path.extname(clean.pathname).replace('.', '').toLowerCase();
    return ext || fallback;
  } catch {
    return fallback;
  }
}

function parseTime(input, fallback = null) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return fallback;

  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);

  const colon = raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const a = Number(colon[1]);
    const b = Number(colon[2]);
    const c = colon[3] ? Number(colon[3]) : null;
    return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  }

  let total = 0;
  const matches = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)/g)];
  if (!matches.length) return fallback;

  for (const match of matches) {
    const amount = Number(match[1]);
    const unit = match[2][0];
    if (unit === 'h') total += amount * 3600;
    else if (unit === 'm') total += amount * 60;
    else total += amount;
  }

  return total || fallback;
}

function takeFlag(args, names, fallback = null) {
  const index = args.findIndex((arg) => names.includes(String(arg || '').toLowerCase()));
  if (index === -1) return fallback;

  const value = args[index + 1];
  args.splice(index, value ? 2 : 1);
  return value || fallback;
}

function getAttachmentUrl(message) {
  return message.attachments?.first?.()?.url || null;
}

function getSourceUrl(message, args) {
  return firstUrl(args.join(' ')) || getAttachmentUrl(message);
}

function assertOutputSize(filePath) {
  const size = fs.statSync(filePath).size;
  if (size > MAX_OUTPUT_BYTES) {
    throw new Error(`Output is too large for Discord upload. Max is ${Math.round(MAX_OUTPUT_BYTES / 1024 / 1024)}MB.`);
  }
  return size;
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn(cmd, args, {
      shell: false,
      windowsHide: true,
      ...options
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Media process timed out.'));
    }, options.timeout || PROCESS_TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.slice(-1200) || `${cmd} exited with code ${code}`));
      }
    });
  });
}

async function downloadDirect(url, dir) {
  const ext = extFromUrl(url, 'mp4');
  const out = path.join(dir, `source.${ext}`);

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'RumiBot/1.0',
      accept: '*/*'
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch media: HTTP ${response.status}`);
  }

  const length = Number(response.headers.get('content-length') || 0);
  if (length && length > MAX_INPUT_BYTES) {
    throw new Error(`Input is too large. Max is ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB.`);
  }

  const stream = fs.createWriteStream(out);
  let downloaded = 0;

  await new Promise((resolve, reject) => {
    const body = Readable.fromWeb(response.body);

    body.on('data', (chunk) => {
      downloaded += chunk.length;
      if (downloaded > MAX_INPUT_BYTES) {
        body.destroy(new Error(`Input is too large. Max is ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB.`));
      }
    });

    body.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);
    body.pipe(stream);
  });

  return out;
}

async function ytDlpCommand() {
  const candidates = [];

  if (process.env.YT_DLP_BIN) {
    candidates.push({ cmd: process.env.YT_DLP_BIN, args: [] });
  }

  candidates.push(
    { cmd: 'yt-dlp', args: [] },
    { cmd: 'python3', args: ['-m', 'yt_dlp'] },
    { cmd: 'python', args: ['-m', 'yt_dlp'] }
  );

  for (const candidate of candidates) {
    try {
      await run(candidate.cmd, [...candidate.args, '--version'], { timeout: 8000 });
      return candidate;
    } catch {
      // try next
    }
  }

  return null;
}

async function downloadWithYtDlp(url, dir) {
  if (String(process.env.MEDIA_ALLOW_PLATFORM_DOWNLOADS || '').toLowerCase() !== 'true') {
    throw new Error('Platform downloads are disabled. Set MEDIA_ALLOW_PLATFORM_DOWNLOADS=true to allow supported links.');
  }

  const candidate = await ytDlpCommand();

  if (!candidate) {
    throw new Error('yt-dlp is not installed. Install yt-dlp or set YT_DLP_BIN.');
  }

  const output = path.join(dir, 'source.%(ext)s');

  await run(candidate.cmd, [
    ...candidate.args,
    '--no-playlist',
    '--no-warnings',
    '--no-cache-dir',
    '--max-filesize',
    String(MAX_INPUT_BYTES),
    '-f',
    'bv*[height<=720]+ba/b[height<=720]/best',
    '--merge-output-format',
    'mp4',
    '-o',
    output,
    url
  ], {
    timeout: PROCESS_TIMEOUT_MS
  });

  const files = fs.readdirSync(dir)
    .filter((name) => /^source\./.test(name))
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile());

  if (!files.length) {
    throw new Error('yt-dlp did not return a media file.');
  }

  return files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}

async function resolveInputFile(message, args, dir) {
  const url = getSourceUrl(message, args);

  if (!url) {
    throw new Error('Attach a video or provide a video URL.');
  }

  if (!isUrl(url)) {
    throw new Error('That is not a valid URL.');
  }

  if (isPlatformUrl(url)) {
    return downloadWithYtDlp(url, dir);
  }

  return downloadDirect(url, dir);
}

async function convertToMp4(inputFile, outputFile, options = {}) {
  const start = Number(options.start || 0);
  const duration = Number(options.duration || 0);

  const args = ['-y'];

  if (start > 0) args.push('-ss', String(start));

  args.push('-i', inputFile);

  if (duration > 0) {
    args.push('-t', String(Math.min(duration, MAX_MP4_DURATION)));
  }

  args.push(
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(process.env.MEDIA_MP4_CRF || 26),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputFile
  );

  await run(FFMPEG_BIN, args);
  assertOutputSize(outputFile);
  return outputFile;
}

async function convertVideoToGif(inputFile, outputFile, options = {}) {
  const start = Number(options.start || 0);
  const duration = Math.min(Number(options.duration || 6), MAX_GIF_DURATION);
  const fps = Math.max(5, Math.min(20, Number(options.fps || 12)));
  const width = Math.max(240, Math.min(720, Number(options.width || 480)));

  const args = ['-y'];

  if (start > 0) args.push('-ss', String(start));

  args.push(
    '-t',
    String(duration),
    '-i',
    inputFile,
    '-filter_complex',
    `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer`,
    '-loop',
    '0',
    outputFile
  );

  await run(FFMPEG_BIN, args);
  assertOutputSize(outputFile);
  return outputFile;
}

module.exports = {
  cleanup,
  convertToMp4,
  convertVideoToGif,
  getSourceUrl,
  mediaTempDir,
  parseTime,
  resolveInputFile,
  takeFlag
};