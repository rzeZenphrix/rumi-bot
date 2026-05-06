const { AttachmentBuilder } = require('discord.js');

function loadCanvasLib() {
  try {
    return require('@napi-rs/canvas');
  } catch {}

  try {
    return require('canvas');
  } catch {}

  return null;
}

const CanvasLib = loadCanvasLib();

function hasCanvas() {
  return Boolean(CanvasLib?.createCanvas);
}

function createCanvas(width, height) {
  return CanvasLib.createCanvas(width, height);
}

async function loadImage(src) {
  if (!CanvasLib?.loadImage || !src) return null;

  try {
    return await CanvasLib.loadImage(src);
  } catch {
    return null;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fill) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, stroke, width = 2) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    font = '24px Arial',
    color = '#ffffff',
    align = 'left',
    baseline = 'top',
    maxWidth = null
  } = options;

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  if (maxWidth) ctx.fillText(String(text || ''), x, y, maxWidth);
  else ctx.fillText(String(text || ''), x, y);
}

function wrapText(ctx, text, maxWidth, maxLines = 4) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const width = ctx.measureText(test).width;

    if (width > maxWidth && line) {
      lines.push(line);
      line = word;

      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);

  if (lines.length === maxLines && lines[lines.length - 1].length > 4) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.endsWith('...') ? last : `${last.slice(0, Math.max(0, last.length - 3))}...`;
  }

  return lines;
}

function avatarUrl(user, size = 256) {
  if (!user) return null;

  if (typeof user.displayAvatarURL === 'function') {
    return user.displayAvatarURL({
      extension: 'png',
      size,
      forceStatic: true
    });
  }

  return user.avatarURL?.({
    extension: 'png',
    size,
    forceStatic: true
  }) || null;
}

async function drawAvatar(ctx, user, x, y, size) {
  const avatar = await loadImage(avatarUrl(user, 512));

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();

  if (avatar) {
    ctx.drawImage(avatar, x, y, size, size);
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, '#ff7ad9');
    gradient.addColorStop(1, '#6c5ce7');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, size, size);

    drawText(ctx, String(user?.username || '?').slice(0, 1).toUpperCase(), x + size / 2, y + size / 2 + 4, {
      font: `800 ${Math.floor(size * 0.42)}px Arial`,
      color: '#ffffff',
      align: 'center',
      baseline: 'middle'
    });
  }

  ctx.restore();

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 + 4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 5;
  ctx.stroke();
}

function background(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#130f2d');
  bg.addColorStop(0.45, '#24154f');
  bg.addColorStop(1, '#ff7ad9');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.18;

  for (let i = 0; i < 42; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 4 + 1;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  const glow = ctx.createRadialGradient(width * 0.82, height * 0.16, 20, width * 0.82, height * 0.16, width * 0.55);
  glow.addColorStop(0, 'rgba(255,255,255,0.28)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function glassPanel(ctx, x, y, w, h) {
  fillRoundRect(ctx, x, y, w, h, 34, 'rgba(10, 12, 30, 0.62)');
  strokeRoundRect(ctx, x, y, w, h, 34, 'rgba(255,255,255,0.18)', 2);

  const shine = ctx.createLinearGradient(x, y, x, y + h);
  shine.addColorStop(0, 'rgba(255,255,255,0.12)');
  shine.addColorStop(1, 'rgba(255,255,255,0.02)');

  fillRoundRect(ctx, x + 2, y + 2, w - 4, h - 4, 32, shine);
}

function pill(ctx, x, y, text, color = '#ff7ad9') {
  ctx.font = '700 20px Arial';

  const width = ctx.measureText(text).width + 34;

  fillRoundRect(ctx, x, y, width, 38, 19, 'rgba(255,255,255,0.12)');
  strokeRoundRect(ctx, x, y, width, 38, 19, 'rgba(255,255,255,0.16)', 1);

  drawText(ctx, text, x + width / 2, y + 19, {
    font: '700 18px Arial',
    color,
    align: 'center',
    baseline: 'middle'
  });

  return width;
}

function progressBar(ctx, x, y, w, h, value, label) {
  fillRoundRect(ctx, x, y, w, h, h / 2, 'rgba(255,255,255,0.12)');

  const pct = Math.max(0.06, Math.min(1, Number(value || 0)));

  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, '#ff7ad9');
  grad.addColorStop(1, '#8b5cf6');

  fillRoundRect(ctx, x, y, w * pct, h, h / 2, grad);

  drawText(ctx, label, x + 16, y + h / 2, {
    font: '700 16px Arial',
    color: '#ffffff',
    baseline: 'middle'
  });
}

async function renderProfileCard(user, profile = {}, member = null) {
  if (!hasCanvas()) return null;

  const width = 1200;
  const height = 700;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  background(ctx, width, height);
  glassPanel(ctx, 54, 54, width - 108, height - 108);

  await drawAvatar(ctx, user, 105, 118, 170);

  const displayName = member?.displayName || user?.globalName || user?.username || 'Unknown user';
  const username = user?.tag || user?.username || user?.id || 'unknown';

  drawText(ctx, displayName, 310, 128, {
    font: '900 54px Arial',
    color: '#ffffff',
    maxWidth: 690
  });

  drawText(ctx, `@${username}`, 314, 188, {
    font: '600 23px Arial',
    color: 'rgba(255,255,255,0.68)',
    maxWidth: 650
  });

  const hidden = profile.hideLeaderboard ? 'Private leaderboard' : 'Public leaderboard';

  let x = 314;
  x += pill(ctx, x, 236, `karma ${profile.karma || 0}`, '#ffd166') + 12;
  x += pill(ctx, x, 236, `streak ${profile.streak || 0}`, '#9dffcb') + 12;
  pill(ctx, x, 236, hidden, '#c4b5fd');

  const bio = profile.bio || 'No bio set yet. Use bio set <text> to personalize your profile.';

  ctx.font = '500 30px Arial';
  const bioLines = wrapText(ctx, bio, 890, 5);

  drawText(ctx, 'ABOUT', 106, 354, {
    font: '800 18px Arial',
    color: 'rgba(255,255,255,0.55)'
  });

  bioLines.forEach((line, index) => {
    drawText(ctx, line, 106, 388 + index * 38, {
      font: '500 30px Arial',
      color: '#ffffff'
    });
  });

  const links = Array.isArray(profile.socialLinks) ? profile.socialLinks.filter(Boolean).slice(0, 3) : [];

  drawText(ctx, 'LINKS', 106, 594, {
    font: '800 18px Arial',
    color: 'rgba(255,255,255,0.55)'
  });

  drawText(ctx, links.length ? links.join('  •  ') : 'No links saved.', 170, 590, {
    font: '600 22px Arial',
    color: 'rgba(255,255,255,0.82)',
    maxWidth: 830
  });

  progressBar(ctx, 790, 124, 270, 24, Math.min(1, Number(profile.karma || 0) / 1000), 'reputation');
  progressBar(ctx, 790, 164, 270, 24, Math.min(1, Number(profile.streak || 0) / 100), 'activity');

  drawText(ctx, 'RUMI SOCIAL PROFILE', 1060, 610, {
    font: '800 17px Arial',
    color: 'rgba(255,255,255,0.55)',
    align: 'right'
  });

  return canvas.toBuffer('image/png');
}

async function renderBioCard(user, profile = {}, status = 'view') {
  if (!hasCanvas()) return null;

  const width = 1100;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  background(ctx, width, height);
  glassPanel(ctx, 52, 52, width - 104, height - 104);

  await drawAvatar(ctx, user, 92, 112, 140);

  const name = user?.globalName || user?.username || 'Unknown user';

  drawText(ctx, 'BIO CARD', 270, 112, {
    font: '800 17px Arial',
    color: 'rgba(255,255,255,0.55)'
  });

  drawText(ctx, name, 270, 140, {
    font: '900 46px Arial',
    color: '#ffffff',
    maxWidth: 700
  });

  pill(ctx, 270, 204, profile.hideLeaderboard ? 'leaderboard hidden' : 'leaderboard visible', profile.hideLeaderboard ? '#c4b5fd' : '#9dffcb');

  const bio = profile.bio || 'No bio set yet. Use bio set <text> to create one.';

  ctx.font = '500 31px Arial';
  const lines = wrapText(ctx, bio, 890, 5);

  lines.forEach((line, index) => {
    drawText(ctx, line, 96, 314 + index * 39, {
      font: '500 31px Arial',
      color: '#ffffff'
    });
  });

  const label = status === 'updated' ? 'BIO UPDATED' : status === 'cleared' ? 'BIO CLEARED' : 'RUMI BIO';

  drawText(ctx, label, 1002, 428, {
    font: '800 17px Arial',
    color: 'rgba(255,255,255,0.55)',
    align: 'right'
  });

  return canvas.toBuffer('image/png');
}

async function renderCalendarCard(user, events = [], page = 1) {
  if (!hasCanvas()) return null;

  const width = 1200;
  const height = 760;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  background(ctx, width, height);
  glassPanel(ctx, 54, 54, width - 108, height - 108);

  await drawAvatar(ctx, user, 92, 92, 105);

  drawText(ctx, 'CALENDAR', 225, 96, {
    font: '800 18px Arial',
    color: 'rgba(255,255,255,0.55)'
  });

  drawText(ctx, `${user?.username || 'Your'} upcoming events`, 225, 124, {
    font: '900 44px Arial',
    color: '#ffffff',
    maxWidth: 780
  });

  pill(ctx, 225, 180, `page ${page}`, '#ffd166');
  pill(ctx, 330, 180, `${events.length} shown`, '#9dffcb');

  const startY = 270;

  if (!events.length) {
    drawText(ctx, 'No upcoming events found.', 100, startY + 30, {
      font: '700 34px Arial',
      color: '#ffffff'
    });

    drawText(ctx, 'Try: calendar create tomorrow 5pm Team meeting', 100, startY + 82, {
      font: '500 24px Arial',
      color: 'rgba(255,255,255,0.68)'
    });
  } else {
    events.slice(0, 5).forEach((event, index) => {
      const y = startY + index * 82;

      fillRoundRect(ctx, 94, y, 1012, 62, 22, 'rgba(255,255,255,0.10)');
      strokeRoundRect(ctx, 94, y, 1012, 62, 22, 'rgba(255,255,255,0.12)', 1);

      const starts = new Date(event.starts_at);
      const dateText = Number.isNaN(starts.getTime())
        ? 'Unknown time'
        : starts.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

      drawText(ctx, `${index + 1}. ${event.title || 'Untitled event'}`, 125, y + 14, {
        font: '800 24px Arial',
        color: '#ffffff',
        maxWidth: 620
      });

      drawText(ctx, dateText, 880, y + 32, {
        font: '700 18px Arial',
        color: '#ffd166',
        align: 'center',
        baseline: 'middle',
        maxWidth: 200
      });
    });
  }

  drawText(ctx, 'RUMI SCHEDULE', 1068, 676, {
    font: '800 17px Arial',
    color: 'rgba(255,255,255,0.55)',
    align: 'right'
  });

  return canvas.toBuffer('image/png');
}

async function renderReminderCard(user, reminder = {}) {
  if (!hasCanvas()) return null;

  const width = 1100;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  background(ctx, width, height);
  glassPanel(ctx, 52, 52, width - 104, height - 104);

  await drawAvatar(ctx, user, 90, 106, 130);

  drawText(ctx, 'REMINDER SAVED', 250, 110, {
    font: '800 18px Arial',
    color: 'rgba(255,255,255,0.55)'
  });

  drawText(ctx, user?.username || 'Reminder', 250, 140, {
    font: '900 46px Arial',
    color: '#ffffff',
    maxWidth: 720
  });

  const runAt = new Date(reminder.runAt || reminder.run_at);
  const dateText = Number.isNaN(runAt.getTime())
    ? 'Unknown time'
    : runAt.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });

  pill(ctx, 250, 202, dateText, '#ffd166');

  const text = reminder.text || 'No reminder text.';

  ctx.font = '500 34px Arial';
  const lines = wrapText(ctx, text, 900, 4);

  lines.forEach((line, index) => {
    drawText(ctx, line, 96, 310 + index * 42, {
      font: '500 34px Arial',
      color: '#ffffff'
    });
  });

  drawText(ctx, 'RUMI REMINDER', 1000, 428, {
    font: '800 17px Arial',
    color: 'rgba(255,255,255,0.55)',
    align: 'right'
  });

  return canvas.toBuffer('image/png');
}

function attachment(buffer, name) {
  if (!buffer) return null;
  return new AttachmentBuilder(buffer, { name });
}

module.exports = {
  hasCanvas,
  renderProfileCard,
  renderBioCard,
  renderCalendarCard,
  renderReminderCard,
  attachment
};