const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  getGuildProfile,
  applyProfileField,
  clearProfileField,
  updateGuildProfile,
  applyGuildProfile
} = require('../../systems/customization/profileManager');

const IMAGE_FIELDS = new Set(['avatar', 'banner']);
const TEXT_FIELDS = new Set(['nick', 'nickname', 'bio']);
const CLEAR_WORDS = new Set(['clear', 'reset', 'remove', 'default', 'none', 'null']);
const VALID_FIELDS = new Set(['nick', 'nickname', 'avatar', 'banner', 'bio']);

function clean(value) {
  return String(value || '').trim();
}

function normalizeField(value) {
  const field = clean(value).toLowerCase();
  return field === 'nickname' ? 'nick' : field;
}

function firstAttachmentUrl(message) {
  return message.attachments?.first?.()?.url || null;
}

function pickValue(message, args) {
  return firstAttachmentUrl(message) || clean(args.join(' '));
}

function isClearValue(value) {
  return CLEAR_WORDS.has(clean(value).toLowerCase());
}

function fieldLabel(field) {
  if (field === 'nick') return 'nickname';
  return field;
}

function imageHint(field) {
  return `Attach an image or provide an image URL for ${field}.`;
}

function usage(prefix = '') {
  const p = prefix || '';
  return [
    `Usage: \`${p}botcustom view\``,
    `\`${p}botcustom nick <nickname>\``,
    `\`${p}botcustom avatar <image URL or attachment>\``,
    `\`${p}botcustom banner <image URL or attachment>\``,
    `\`${p}botcustom bio <text>\``,
    `\`${p}botcustom clear <nick|avatar|banner|bio>\``,
    `\`${p}botcustom apply\``
  ].join('\n');
}

function profileSummary(profile) {
  return [
    `Nickname: ${profile.nick ? `\`${profile.nick}\`` : 'default'}`,
    `Avatar: ${profile.avatar ? 'custom' : 'default'}`,
    `Banner: ${profile.banner ? 'custom' : 'default'}`,
    `Bio: ${profile.bio ? `\`${profile.bio}\`` : 'default'}`
  ].join('\n');
}

async function safeReply(message, type, text, options = {}) {
  return respond.reply(message, type, text, {
    mentionUser: false,
    allowTitle: false,
    ...options
  });
}

async function applySingle(message, field, value) {
  const normalized = normalizeField(field);

  if (!VALID_FIELDS.has(normalized)) {
    return safeReply(message, 'info', usage());
  }

  if (IMAGE_FIELDS.has(normalized) && !value) {
    return safeReply(message, 'info', imageHint(normalized));
  }

  if (TEXT_FIELDS.has(normalized) && !value) {
    return safeReply(message, 'info', `Give me a ${fieldLabel(normalized)} value.`);
  }

  if (isClearValue(value)) {
    await clearProfileField(message.guild, normalized, {
      actorId: message.author.id,
      reason: `Rumi ${fieldLabel(normalized)} cleared by ${message.author.tag}`
    });

    return safeReply(message, 'good', `Cleared bot ${fieldLabel(normalized)}.`);
  }

  await applyProfileField(message.guild, normalized, value, {
    actorId: message.author.id,
    reason: `Rumi ${fieldLabel(normalized)} updated by ${message.author.tag}`
  });

  return safeReply(message, 'good', `Updated bot ${fieldLabel(normalized)}.`);
}

module.exports = {
  name: 'botcustom',
  aliases: ['botcustomize', 'custombot', 'botprofile', 'rumiprofile'],
  category: 'config',
  description: 'Customize Rumi profile for this server live.',
  usage: 'botcustom <view|nick|avatar|banner|bio|clear|apply>',
  examples: [
    'botcustom view',
    'botcustom nick Rumi',
    'botcustom avatar <attachment>',
    'botcustom banner https://example.com/banner.png',
    'botcustom bio Calm chaos manager.',
    'botcustom clear avatar',
    'botcustom apply'
  ],
  subcommands: [
    {
      name: 'view',
      description: 'View this server bot profile customization.',
      usage: 'botcustom view',
      examples: ['botcustom view']
    },
    {
      name: 'nick',
      aliases: ['nickname'],
      description: 'Set Rumi nickname in this server.',
      usage: 'botcustom nick <nickname>',
      examples: ['botcustom nick Rumi']
    },
    {
      name: 'avatar',
      description: 'Set Rumi server avatar from image URL or attachment.',
      usage: 'botcustom avatar <image URL or attachment>',
      examples: ['botcustom avatar <attachment>']
    },
    {
      name: 'banner',
      description: 'Set Rumi server banner from image URL or attachment.',
      usage: 'botcustom banner <image URL or attachment>',
      examples: ['botcustom banner <attachment>']
    },
    {
      name: 'bio',
      description: 'Set Rumi server bio/about me.',
      usage: 'botcustom bio <text>',
      examples: ['botcustom bio Calm chaos manager.']
    },
    {
      name: 'clear',
      aliases: ['reset', 'remove'],
      description: 'Clear one bot profile field.',
      usage: 'botcustom clear <nick|avatar|banner|bio>',
      examples: ['botcustom clear avatar']
    },
    {
      name: 'apply',
      aliases: ['sync', 'refresh'],
      description: 'Re-apply saved profile customization live.',
      usage: 'botcustom apply',
      examples: ['botcustom apply']
    }
  ],
  guildOnly: true,
  typing: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 5,

  async execute({ message, args }) {
    const sub = clean(args.shift()).toLowerCase() || 'view';

    try {
      if (sub === 'help') {
        return safeReply(message, 'info', usage());
      }

      if (sub === 'view' || sub === 'status' || sub === 'settings') {
        const profile = await getGuildProfile(message.guild.id);
        return safeReply(message, 'info', profileSummary(profile));
      }

      if (sub === 'apply' || sub === 'sync' || sub === 'refresh') {
        const result = await applyGuildProfile(message.guild, {
          reason: `Rumi bot profile re-applied by ${message.author.tag}`
        });

        const skipped = result.skipped?.length
          ? ` Skipped: ${result.skipped.map((x) => x.field).join(', ')}.`
          : '';

        return safeReply(
          message,
          'good',
          result.applied?.length
            ? `Applied bot profile: ${result.applied.map(fieldLabel).join(', ')}.${skipped}`
            : `No saved bot profile fields to apply.${skipped}`
        );
      }

      if (sub === 'clear' || sub === 'reset' || sub === 'remove') {
        const field = normalizeField(args.shift());

        if (!VALID_FIELDS.has(field)) {
          return safeReply(message, 'info', 'Usage: `botcustom clear <nick|avatar|banner|bio>`.');
        }

        await clearProfileField(message.guild, field, {
          actorId: message.author.id,
          reason: `Rumi ${fieldLabel(field)} cleared by ${message.author.tag}`
        });

        return safeReply(message, 'good', `Cleared bot ${fieldLabel(field)}.`);
      }

      if (sub === 'set') {
        const field = normalizeField(args.shift());
        const value = pickValue(message, args);
        return applySingle(message, field, value);
      }

      if (sub === 'all' || sub === 'profile') {
        const patch = {};
        let currentField = null;
        const chunks = {};

        for (const token of args) {
          const maybeField = normalizeField(token);

          if (VALID_FIELDS.has(maybeField)) {
            currentField = maybeField;
            chunks[currentField] ||= [];
            continue;
          }

          if (currentField) {
            chunks[currentField].push(token);
          }
        }

        for (const [field, values] of Object.entries(chunks)) {
          const value = clean(values.join(' '));
          if (value) patch[field] = value;
        }

        const attachment = firstAttachmentUrl(message);
        if (attachment && !patch.avatar) patch.avatar = attachment;

        if (!Object.keys(patch).length) {
          return safeReply(
            message,
            'info',
            'Usage: `botcustom profile nick <name> bio <text>` or use individual commands like `botcustom avatar <attachment>`.'
          );
        }

        await updateGuildProfile(message.guild, patch, {
          actorId: message.author.id,
          reason: `Rumi bot profile updated by ${message.author.tag}`
        });

        return safeReply(message, 'good', `Updated bot profile: ${Object.keys(patch).map(fieldLabel).join(', ')}.`);
      }

      if (VALID_FIELDS.has(normalizeField(sub))) {
        const field = normalizeField(sub);
        const value = pickValue(message, args);
        return applySingle(message, field, value);
      }

      return safeReply(message, 'info', usage());
    } catch (error) {
      return safeReply(
        message,
        'bad',
        error?.message || 'Could not update bot customization. Check the image URL, permissions, or Discord limits.'
      );
    }
  }
};