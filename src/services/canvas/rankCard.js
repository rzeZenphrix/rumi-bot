const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
}

async function makeRankCard({ user, member, level, xp, needed }) {
  const canvas = createCanvas(900, 280);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 900, 280);
  gradient.addColorStop(0, '#09090f');
  gradient.addColorStop(1, '#24102f');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 900, 280);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundedRect(ctx, 30, 30, 840, 220, 34);
  ctx.fill();

  const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));

  ctx.save();
  roundedRect(ctx, 60, 60, 160, 160, 32);
  ctx.clip();
  ctx.drawImage(avatar, 60, 60, 160, 160);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Arial';
  ctx.fillText(member?.displayName || user.username, 250, 100);

  ctx.fillStyle = '#c7b7ff';
  ctx.font = '28px Arial';
  ctx.fillText(`Level ${level}`, 250, 145);

  const progress = Math.min(1, xp / Math.max(needed, 1));

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundedRect(ctx, 250, 175, 560, 34, 17);
  ctx.fill();

  const bar = ctx.createLinearGradient(250, 175, 810, 175);
  bar.addColorStop(0, '#8b5cf6');
  bar.addColorStop(1, '#ec4899');

  ctx.fillStyle = bar;
  roundedRect(ctx, 250, 175, 560 * progress, 34, 17);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '22px Arial';
  ctx.fillText(`${xp} / ${needed} XP`, 250, 235);

  return new AttachmentBuilder(await canvas.encode('png'), {
    name: 'rank-card.png'
  });
}

module.exports = {
  makeRankCard
};