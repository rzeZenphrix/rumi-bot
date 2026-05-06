const { createCanvas } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const respond = require('../../utils/respond');

const NAMED = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  black: '#000000',
  white: '#ffffff',
  purple: '#800080',
  pink: '#ffc0cb',
  orange: '#ffa500',
  yellow: '#ffff00',
  cyan: '#00ffff'
};

function parseColor(input) {
  const text = String(input || '').trim().toLowerCase();
  const named = NAMED[text];
  if (named) return parseColor(named);

  const hex = text.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return { hex: `#${hex.toUpperCase()}` };

  let match = text.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i);
  if (match) {
    const [r, g, b] = match.slice(1).map(Number);
    if ([r, g, b].every((n) => n >= 0 && n <= 255)) {
      return { hex: `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}` };
    }
  }

  match = text.match(/^hsl\((\d{1,3}),\s*(\d{1,3})%,\s*(\d{1,3})%\)$/i);
  if (match) {
    let [h, s, l] = match.slice(1).map(Number);
    h %= 360;
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color);
    };
    return { hex: `#${[f(0), f(8), f(4)].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}` };
  }

  return null;
}

function toRgb(hex) {
  const raw = hex.replace('#', '');
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16)
  };
}

function toHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h;
  let s;
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) {
    h = 0;
    s = 0;
  } else {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn: h = 60 * (((gn - bn) / d) % 6); break;
      case gn: h = 60 * ((bn - rn) / d + 2); break;
      default: h = 60 * ((rn - gn) / d + 4); break;
    }
  }
  if (h < 0) h += 360;
  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function buildSwatch(hex) {
  const canvas = createCanvas(640, 320);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'color.png' });
}

module.exports = {
  name: 'color',
  aliases: ['colour', 'hex'],
  category: 'utility',
  description: 'I show color info from hex, rgb, hsl, or simple named colors.',
  usage: 'color <hex|rgb(...)|hsl(...)|name>',
  examples: ['color #5865f2', 'color rgb(88, 101, 242)', 'color hsl(235, 85%, 65%)'],

  async execute({ message, args }) {
    const parsed = parseColor(args.join(' '));
    if (!parsed) {
      return respond.reply(message, 'info', 'Send a valid color like `#5865f2`, `rgb(88, 101, 242)`, `hsl(235, 85%, 65%)`, or `purple`.');
    }

    const rgb = toRgb(parsed.hex);
    const hsl = toHsl(rgb);
    const file = buildSwatch(parsed.hex);

    return message.channel.send({
      embeds: [respond.makeEmbed('info', message.author, null, {
        color: Number.parseInt(parsed.hex.slice(1), 16),
        description: `**Color info**\n**HEX:** \`${parsed.hex}\`\n**RGB:** \`${rgb.r}, ${rgb.g}, ${rgb.b}\`\n**HSL:** \`${hsl.h}, ${hsl.s}%, ${hsl.l}%\``
      })],
      files: [file],
      allowedMentions: { users: [message.author.id], roles: [] }
    });
  }
};
