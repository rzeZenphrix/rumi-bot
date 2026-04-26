const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AttachmentBuilder } = require('discord.js');

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch media: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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

function buildCaptionData(width, caption) {
  const safeWidth = Math.max(Number(width) || 500, 320);
  const fontSize = Math.max(30, Math.min(72, Math.floor(safeWidth / 11)));
  const maxChars = Math.max(10, Math.floor(safeWidth / (fontSize * 0.55)));
  const lines = wrapText(caption, maxChars);
  const lineHeight = Math.floor(fontSize * 1.12);
  const paddingY = Math.floor(fontSize * 0.45);
  const captionHeight = Math.max(86, paddingY * 2 + lineHeight * lines.length);
  return { fontSize, lines, lineHeight, paddingY, captionHeight };
}

function buildCaptionBandSvg({ width, height, lines, fontSize, lineHeight, paddingY }) {
  const text = lines.map((line, index) => {
    const y = paddingY + fontSize + index * lineHeight;
    return `<text x="50%" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" fill="#111111">${escapeXml(line)}</text>`;
  }).join('');
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>${text}</svg>`;
}

function buildAnimatedFullOverlaySvg({ width, totalHeight, frameHeight, captionHeight, pages, lines, fontSize, lineHeight, paddingY }) {
  let content = '';
  for (let page = 0; page < pages; page += 1) {
    const frameTop = page * frameHeight;
    content += `<rect x="0" y="${frameTop}" width="${width}" height="${captionHeight}" fill="#ffffff"/>`;
    for (let index = 0; index < lines.length; index += 1) {
      const y = frameTop + paddingY + fontSize + index * lineHeight;
      content += `<text x="50%" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" fill="#111111">${escapeXml(lines[index])}</text>`;
    }
  }
  return `<svg width="${width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
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

async function makeCaptionedStaticImage(buffer, caption, originalName) {
  const sharp = require('sharp');
  const normalizedBuffer = await sharp(buffer, { animated: false, limitInputPixels: false }).rotate().png().toBuffer();
  const normalizedMeta = await sharp(normalizedBuffer, { limitInputPixels: false }).metadata();
  const width = normalizedMeta.width || 800;
  const captionData = buildCaptionData(width, caption);
  const extendedBuffer = await sharp(normalizedBuffer, { limitInputPixels: false }).extend({ top: captionData.captionHeight, bottom: 0, left: 0, right: 0, background: '#ffffff' }).png().toBuffer();
  const extendedMeta = await sharp(extendedBuffer, { limitInputPixels: false }).metadata();
  const overlaySvg = buildCaptionBandSvg({ width: extendedMeta.width || width, height: captionData.captionHeight, lines: captionData.lines, fontSize: captionData.fontSize, lineHeight: captionData.lineHeight, paddingY: captionData.paddingY });
  const output = await sharp(extendedBuffer, { limitInputPixels: false }).composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }]).png().toBuffer();
  const parsed = path.parse(originalName || 'captioned.png');
  return attachmentFromBuffer(output, `${cleanName(parsed.name || 'captioned', 'captioned')}.png`);
}

async function makeCaptionedAnimatedGif(buffer, caption, originalName, meta) {
  const sharp = require('sharp');
  const inputMeta = meta || await getImageMetadata(buffer);
  const inputWidth = inputMeta.width || 500;
  const captionData = buildCaptionData(inputWidth, caption);
  const delay = Array.isArray(inputMeta.delay) && inputMeta.delay.length ? inputMeta.delay : undefined;
  const loop = typeof inputMeta.loop === 'number' ? inputMeta.loop : 0;
  const extendedBuffer = await sharp(buffer, { animated: true, limitInputPixels: false }).rotate().extend({ top: captionData.captionHeight, bottom: 0, left: 0, right: 0, background: '#ffffff' }).gif({ effort: 7, loop, delay }).toBuffer();
  const extendedMeta = await sharp(extendedBuffer, { animated: true, limitInputPixels: false }).metadata();
  const width = extendedMeta.width || inputWidth;
  const totalHeight = extendedMeta.height || 1;
  const pages = extendedMeta.pages || inputMeta.pages || 1;
  const frameHeight = extendedMeta.pageHeight || Math.floor(totalHeight / pages);
  const overlaySvg = buildAnimatedFullOverlaySvg({ width, totalHeight, frameHeight, captionHeight: captionData.captionHeight, pages, lines: captionData.lines, fontSize: captionData.fontSize, lineHeight: captionData.lineHeight, paddingY: captionData.paddingY });
  const output = await sharp(extendedBuffer, { animated: true, limitInputPixels: false }).composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }]).gif({ effort: 7, loop, delay }).toBuffer();
  const parsed = path.parse(originalName || 'captioned.gif');
  return attachmentFromBuffer(output, `${cleanName(parsed.name || 'captioned', 'captioned')}.gif`);
}

function shellQuoteForDrawtext(text) {
  return String(text || '')
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
}

async function makeCaptionedVideoGif(buffer, caption, originalName = 'captioned.mp4') {
  const ffmpegPath = require('ffmpeg-static');
  const ffmpeg = require('fluent-ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegPath);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rumi-media-'));
  const ext = path.extname(originalName).replace('.', '') || 'mp4';
  const input = path.join(tmp, `input.${ext}`);
  const output = path.join(tmp, 'captioned.gif');
  await fs.writeFile(input, buffer);

  const safeCaption = shellQuoteForDrawtext(caption);
  const vf = [
    'scale=480:-1:flags=lanczos',
    'fps=15',
    'pad=iw:ih+90:0:90:white',
    `drawtext=text='${safeCaption}':x=(w-text_w)/2:y=22:fontsize=34:fontcolor=black:font='Arial':borderw=0`
  ].join(',');

  await new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions(['-vf', vf, '-loop', '0'])
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  const out = await fs.readFile(output);
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => null);
  return attachmentFromBuffer(out, `${cleanName(path.parse(originalName).name || 'captioned', 'captioned')}.gif`);
}

async function makeCaptionedImage(buffer, caption, originalName = 'captioned.png', contentType = '') {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('video/')) return makeCaptionedVideoGif(buffer, caption, originalName);

  try { require('sharp'); } catch { throw new Error('Captioning needs the `sharp` package. Run `npm i sharp` and restart me.'); }

  const meta = await getImageMetadata(buffer);
  if (shouldUseAnimatedPipeline(buffer, meta, originalName, contentType)) return makeCaptionedAnimatedGif(buffer, caption, originalName, meta);
  return makeCaptionedStaticImage(buffer, caption, originalName);
}

module.exports = {
  fetchBuffer,
  firstAttachment,
  customEmojiInfo,
  customEmojiInfos,
  cleanName,
  attachmentFromBuffer,
  makeCaptionedImage,
  makeCaptionedVideoGif
};
