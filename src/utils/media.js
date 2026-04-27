const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AttachmentBuilder } = require('discord.js');

async function fetchBuffer(url, options = {}) {
  const maxBytes = Number(options.maxBytes || 0);
  const timeoutMs = Number(options.timeoutMs || process.env.MEDIA_FETCH_TIMEOUT_MS || 12000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`Could not fetch media: HTTP ${res.status}`);

  const length = Number(res.headers.get('content-length') || 0);
  if (maxBytes && length > maxBytes) {
    throw new Error(`Media is too large. Max size is ${maxBytes} bytes.`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (maxBytes && buffer.length > maxBytes) {
    throw new Error(`Media is too large. Max size is ${maxBytes} bytes.`);
  }

  return buffer;
}

function firstAttachment(message) {
  return message.attachments?.first?.() || null;
}

function customEmojiInfo(input) {
  const match = String(input || '').match(/<(?<animated>a?):(?<name>[A-Za-z0-9_]{2,32}):(?<id>\d{17,20})>/);
  if (!match) return null;
  const { animated, name, id } = match.groups;
  return { animated: Boolean(animated), name, id, url: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?quality=lossless` };
}

function customEmojiInfos(input) {
  return [...String(input || '').matchAll(/<(?<animated>a?):(?<name>[A-Za-z0-9_]{2,32}):(?<id>\d{17,20})>/g)]
    .map((match) => {
      const { animated, name, id } = match.groups;
      return { animated: Boolean(animated), name, id, url: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?quality=lossless` };
    });
}

function cleanName(name, fallback = 'file') {
  return String(name || fallback).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || fallback;
}

function attachmentFromBuffer(buffer, name) {
  return new AttachmentBuilder(buffer, { name });
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

function bufferLooksGif(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 6) return false;
  const signature = buffer.subarray(0, 6).toString('ascii');
  return signature === 'GIF87a' || signature === 'GIF89a';
}

function normalizeCaptionOptions(options = {}) {
  const position = ['top', 'bottom'].includes(String(options.position || '').toLowerCase())
    ? String(options.position).toLowerCase()
    : 'top';
  const fontFamily = String(options.fontFamily || options.font || 'Arial').slice(0, 120);
  const fontColor = /^#?[0-9a-f]{6}$/i.test(String(options.fontColor || options.color || '').trim())
    ? `#${String(options.fontColor || options.color).replace('#', '').toLowerCase()}`
    : '#111111';
  const backgroundColor = /^#?[0-9a-f]{6}$/i.test(String(options.backgroundColor || options.background || '').trim())
    ? `#${String(options.backgroundColor || options.background).replace('#', '').toLowerCase()}`
    : '#ffffff';
  const requestedSize = Number(options.fontSize || options.size || 0);

  return {
    position,
    fontFamily,
    fontColor,
    backgroundColor,
    requestedSize: Number.isFinite(requestedSize) && requestedSize > 0 ? requestedSize : null
  };
}

function buildCaptionData(width, caption, options = {}) {
  const safeWidth = Math.max(Number(width) || 500, 320);
  const normalized = normalizeCaptionOptions(options);
  const defaultSize = Math.floor(safeWidth / 11);
  const fontSize = Math.max(20, Math.min(96, Math.floor(normalized.requestedSize || defaultSize)));
  const maxChars = Math.max(10, Math.floor(safeWidth / (fontSize * 0.55)));
  const lines = wrapText(caption, maxChars);
  const lineHeight = Math.floor(fontSize * 1.12);
  const paddingY = Math.floor(fontSize * 0.45);
  const captionHeight = Math.max(86, paddingY * 2 + lineHeight * lines.length);
  return { ...normalized, fontSize, lines, lineHeight, paddingY, captionHeight };
}

function buildCaptionBandSvg({ width, height, lines, fontSize, lineHeight, paddingY, fontFamily, fontColor, backgroundColor }) {
  const text = lines.map((line, index) => {
    const y = paddingY + fontSize + index * lineHeight;
    return `<text x="50%" y="${y}" text-anchor="middle" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="900" fill="${fontColor}">${escapeXml(line)}</text>`;
  }).join('');
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundColor}"/>${text}</svg>`;
}

async function getImageMetadata(buffer) {
  const sharp = require('sharp');
  return sharp(buffer, { animated: true, limitInputPixels: false }).metadata();
}

function shouldUseAnimatedPipeline(buffer, meta, originalName, contentType) {
  const name = String(originalName || '').toLowerCase();
  const type = String(contentType || '').toLowerCase();
  return bufferLooksGif(buffer) || Number(meta?.pages || 1) > 1 || type.includes('gif') || name.endsWith('.gif') || type.includes('webp');
}

async function makeCaptionedStaticImage(buffer, caption, originalName, options = {}) {
  const sharp = require('sharp');
  const normalizedBuffer = await sharp(buffer, { animated: false, limitInputPixels: false }).rotate().png().toBuffer();
  const normalizedMeta = await sharp(normalizedBuffer, { limitInputPixels: false }).metadata();
  const width = normalizedMeta.width || 800;
  const captionData = buildCaptionData(width, caption, options);
  const top = captionData.position === 'top' ? captionData.captionHeight : 0;
  const bottom = captionData.position === 'bottom' ? captionData.captionHeight : 0;
  const extendedBuffer = await sharp(normalizedBuffer, { limitInputPixels: false }).extend({ top, bottom, left: 0, right: 0, background: captionData.backgroundColor }).png().toBuffer();
  const extendedMeta = await sharp(extendedBuffer, { limitInputPixels: false }).metadata();
  const overlaySvg = buildCaptionBandSvg({ width: extendedMeta.width || width, height: captionData.captionHeight, lines: captionData.lines, fontSize: captionData.fontSize, lineHeight: captionData.lineHeight, paddingY: captionData.paddingY, fontFamily: captionData.fontFamily, fontColor: captionData.fontColor, backgroundColor: captionData.backgroundColor });
  const overlayTop = captionData.position === 'top' ? 0 : ((extendedMeta.height || captionData.captionHeight) - captionData.captionHeight);
  const output = await sharp(extendedBuffer, { limitInputPixels: false }).composite([{ input: Buffer.from(overlaySvg), top: overlayTop, left: 0 }]).png().toBuffer();
  const parsed = path.parse(originalName || 'captioned.png');
  return attachmentFromBuffer(output, `${cleanName(parsed.name || 'captioned', 'captioned')}.png`);
}

async function makeCaptionedAnimatedGif(buffer, caption, originalName, meta, options = {}) {
  const ffmpegPath = require('ffmpeg-static');
  const ffmpeg = require('fluent-ffmpeg');
  const sharp = require('sharp');
  ffmpeg.setFfmpegPath(ffmpegPath);

  const inputMeta = meta || await getImageMetadata(buffer);
  const inputWidth = inputMeta.width || 500;
  const captionData = buildCaptionData(inputWidth, caption, options);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rumi-gif-caption-'));
  const input = path.join(tmp, 'input.gif');
  const palette = path.join(tmp, 'palette.png');
  const band = path.join(tmp, 'band.png');
  const output = path.join(tmp, 'captioned.gif');
  await fs.writeFile(input, buffer);
  const padY = captionData.position === 'top' ? captionData.captionHeight : 0;
  const overlayY = captionData.position === 'top' ? 0 : 'H-h';
  const overlaySvg = buildCaptionBandSvg({
    width: inputWidth,
    height: captionData.captionHeight,
    lines: captionData.lines,
    fontSize: captionData.fontSize,
    lineHeight: captionData.lineHeight,
    paddingY: captionData.paddingY,
    fontFamily: captionData.fontFamily,
    fontColor: captionData.fontColor,
    backgroundColor: captionData.backgroundColor
  });
  const bandBuffer = await sharp(Buffer.from(overlaySvg)).png().toBuffer();
  await fs.writeFile(band, bandBuffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .input(band)
        .outputOptions([
          '-frames:v', '1',
          '-lavfi',
          `[0:v]pad=iw:ih+${captionData.captionHeight}:0:${padY}:${captionData.backgroundColor}[padded];[padded][1:v]overlay=0:${overlayY},palettegen=stats_mode=diff`
        ])
        .on('end', resolve)
        .on('error', reject)
        .output(palette)
        .run();
    });

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(input)
        .input(band)
        .input(palette)
        .complexFilter([
          {
            filter: 'pad',
            options: `iw:ih+${captionData.captionHeight}:0:${padY}:${captionData.backgroundColor}`,
            inputs: '0:v',
            outputs: 'padded'
          },
          {
            filter: 'overlay',
            options: `0:${overlayY}`,
            inputs: ['padded', '1:v'],
            outputs: 'captioned'
          },
          {
            filter: 'paletteuse',
            options: 'dither=bayer:bayer_scale=3',
            inputs: ['captioned', '2:v'],
            outputs: 'final'
          }
        ], 'final')
        .outputOptions(['-loop', '0'])
        .output(output)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const out = await fs.readFile(output);
    const parsed = path.parse(originalName || 'captioned.gif');
    return attachmentFromBuffer(out, `${cleanName(parsed.name || 'captioned', 'captioned')}.gif`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => null);
  }
}

function shellQuoteForDrawtext(text) {
  return String(text || '')
    .replaceAll('\\', '\\\\')
    .replaceAll(' ', '\\ ')
    .replaceAll(':', '\\:')
    .replaceAll(',', '\\,')
    .replaceAll("'", "\\'")
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
}

function escapeFfmpegText(text) {
  return String(text || '')
    .replaceAll('\\', '\\\\')
    .replaceAll(' ', '\\ ')
    .replaceAll("'", "\\'")
    .replaceAll(':', '\\:')
    .replaceAll(',', '\\,')
    .replaceAll('%', '\\%')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n');
}

async function makeCaptionedVideoGif(buffer, caption, originalName = 'captioned.mp4', options = {}) {
  const ffmpegPath = require('ffmpeg-static');
  const ffmpeg = require('fluent-ffmpeg');
  const sharp = require('sharp');
  ffmpeg.setFfmpegPath(ffmpegPath);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rumi-media-'));
  const ext = path.extname(originalName).replace('.', '') || 'mp4';
  const input = path.join(tmp, `input.${ext}`);
  const band = path.join(tmp, 'band.png');
  const output = path.join(tmp, 'captioned.gif');
  await fs.writeFile(input, buffer);

  const captionData = buildCaptionData(480, caption, options);
  const overlaySvg = buildCaptionBandSvg({
    width: 480,
    height: captionData.captionHeight,
    lines: captionData.lines,
    fontSize: captionData.fontSize,
    lineHeight: captionData.lineHeight,
    paddingY: captionData.paddingY,
    fontFamily: captionData.fontFamily,
    fontColor: captionData.fontColor,
    backgroundColor: captionData.backgroundColor
  });
  const bandBuffer = await sharp(Buffer.from(overlaySvg)).png().toBuffer();
  await fs.writeFile(band, bandBuffer);
  const overlayY = captionData.position === 'top' ? 0 : 'H-h';

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(input)
      .input(band)
      .complexFilter([
        {
          filter: 'scale',
          options: '480:-1:flags=lanczos',
          inputs: '0:v',
          outputs: 'scaled'
        },
        {
          filter: 'fps',
          options: '15',
          inputs: 'scaled',
          outputs: 'timed'
        },
        {
          filter: 'pad',
          options: `iw:ih+${captionData.captionHeight}:0:${captionData.position === 'top' ? captionData.captionHeight : 0}:${captionData.backgroundColor}`,
          inputs: 'timed',
          outputs: 'padded'
        },
        {
          filter: 'overlay',
          options: `0:${overlayY}`,
          inputs: ['padded', '1:v'],
          outputs: 'final'
        }
      ], 'final')
      .outputOptions(['-loop', '0', '-map', '[final]'])
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  const out = await fs.readFile(output);
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => null);
  return attachmentFromBuffer(out, `${cleanName(path.parse(originalName).name || 'captioned', 'captioned')}.gif`);
}

async function makeCaptionedImage(buffer, caption, originalName = 'captioned.png', contentType = '', options = {}) {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('video/')) return makeCaptionedVideoGif(buffer, caption, originalName, options);

  try { require('sharp'); } catch { throw new Error('Captioning needs the `sharp` package. Run `npm i sharp` and restart me.'); }

  const meta = await getImageMetadata(buffer);
  if (shouldUseAnimatedPipeline(buffer, meta, originalName, contentType)) return makeCaptionedAnimatedGif(buffer, caption, originalName, meta, options);
  return makeCaptionedStaticImage(buffer, caption, originalName, options);
}

async function makeEditedImage(buffer, originalName = 'edited.png', operation = 'grayscale', options = {}) {
  const sharp = require('sharp');
  const base = sharp(buffer, { animated: false, limitInputPixels: false }).rotate();
  const parsed = path.parse(originalName || 'edited.png');

  switch (operation) {
    case 'blur':
      base.blur(Math.max(0.3, Number(options.amount || 2)));
      break;
    case 'brightness':
      base.modulate({ brightness: Math.max(0.1, Number(options.amount || 1.25)) });
      break;
    case 'contrast': {
      const amount = Math.max(0.2, Number(options.amount || 1.35));
      base.linear(amount, -(128 * amount) + 128);
      break;
    }
    case 'deepfry':
      base.modulate({ saturation: 1.8, brightness: 1.15 }).sharpen({ sigma: 1.4, m1: 2.2, m2: 3.2 });
      break;
    case 'flip':
      base.flip();
      break;
    case 'glitch': {
      const meta = await base.clone().metadata();
      const width = meta.width || 512;
      const height = meta.height || 512;
      const overlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="none"/>
        <rect x="0" y="${Math.floor(height * 0.22)}" width="${width}" height="14" fill="rgba(255,0,96,0.18)"/>
        <rect x="0" y="${Math.floor(height * 0.55)}" width="${width}" height="10" fill="rgba(0,255,255,0.16)"/>
        <rect x="0" y="${Math.floor(height * 0.76)}" width="${width}" height="8" fill="rgba(255,255,255,0.12)"/>
      </svg>`;
      base.modulate({ saturation: 1.2 }).composite([{ input: Buffer.from(overlay), blend: 'screen' }]);
      break;
    }
    case 'grayscale':
      base.grayscale();
      break;
    case 'invert':
      base.negate();
      break;
    case 'jail-bars': {
      const meta = await base.clone().metadata();
      const width = meta.width || 512;
      const height = meta.height || 512;
      const barWidth = Math.max(16, Math.floor(width / 12));
      const bars = Array.from({ length: 6 }, (_, index) => {
        const x = Math.floor((index + 1) * width / 7) - Math.floor(barWidth / 2);
        return `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="rgba(26,26,26,0.75)"/>`;
      }).join('');
      const overlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
      base.composite([{ input: Buffer.from(overlay), blend: 'over' }]);
      break;
    }
    case 'pixelate': {
      const meta = await base.clone().metadata();
      const width = meta.width || 512;
      const height = meta.height || 512;
      const factor = Math.max(8, Number(options.factor || 14));
      base.resize(Math.max(1, Math.floor(width / factor)), Math.max(1, Math.floor(height / factor)), { kernel: 'nearest' })
        .resize(width, height, { kernel: 'nearest' });
      break;
    }
    case 'resize': {
      const width = Number(options.width || 0) || null;
      const height = Number(options.height || 0) || null;
      if (width || height) {
        base.resize(width, height, { fit: 'inside', withoutEnlargement: false });
      }
      break;
    }
    case 'rotate':
      base.rotate(Number(options.degrees || 90), { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      break;
    case 'vaporwave':
      base.tint('#ff8bd1').modulate({ saturation: 1.25, brightness: 1.05 });
      break;
    case 'wasted': {
      const meta = await base.clone().metadata();
      const width = meta.width || 512;
      const height = meta.height || 512;
      const overlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(120,0,0,0.22)"/>
        <rect x="0" y="${Math.floor(height * 0.38)}" width="${width}" height="${Math.max(56, Math.floor(height * 0.16))}" fill="rgba(0,0,0,0.72)"/>
        <text x="50%" y="${Math.floor(height * 0.49)}" text-anchor="middle" font-family="Arial Black" font-size="${Math.max(30, Math.floor(width / 7))}" fill="#f2f2f2">WASTED</text>
      </svg>`;
      base.grayscale().composite([{ input: Buffer.from(overlay), blend: 'over' }]);
      break;
    }
    default:
      break;
  }

  const output = await base.png().toBuffer();
  return attachmentFromBuffer(output, `${cleanName(parsed.name || operation, operation)}.png`);
}

module.exports = {
  fetchBuffer,
  firstAttachment,
  customEmojiInfo,
  customEmojiInfos,
  cleanName,
  attachmentFromBuffer,
  makeCaptionedImage,
  makeCaptionedVideoGif,
  makeEditedImage
};
