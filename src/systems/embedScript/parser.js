const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const { parseComponentEmoji } = require('../../utils/componentEmoji');

const MAX_EMBEDS = 10;
const MAX_ROWS = 5;

function replaceVariables(text, context) {
  if (!text) return text;

  const { message, member, user } = context;
  const actor = user || member?.user || message?.author;
  const guild = message?.guild;
  const channel = message?.channel;

  const replacements = {
    '{user.mention}': actor ? `<@${actor.id}>` : '',
    '{user.name}': actor?.username || actor?.tag || '',
    '{user.tag}': actor?.tag || actor?.username || '',
    '{user.avatar}': actor?.displayAvatarURL?.({ size: 1024, extension: 'png', forceStatic: false }) || '',
    '{user.id}': actor?.id || '',
    '{server.name}': guild?.name || '',
    '{server.id}': guild?.id || '',
    '{guild.name}': guild?.name || '',
    '{guild.id}': guild?.id || '',
    '{channel.name}': channel?.name || '',
    '{channel.id}': channel?.id || '',
    '{channel.mention}': channel ? `<#${channel.id}>` : ''
  };

  let out = String(text);
  for (const [token, value] of Object.entries(replacements)) out = out.split(token).join(value);

  // Greed/Bleed-style shorthand users often use for invisible spacing/new lines.
  out = out.replaceAll('/e', '')
    .replaceAll(':invisible:', '\u2800')
    .replaceAll(':invisible::invisible:', '\u2800\u2800');

  return out;
}

function splitVars(script) {
  const parts = [];
  let i = 0;
  let buffer = '';

  while (i < script.length) {
    if (script.startsWith('$v{', i)) {
      if (buffer) {
        parts.push({ type: 'raw', value: buffer });
        buffer = '';
      }

      i += 3;
      let depth = 1;
      let body = '';

      while (i < script.length && depth > 0) {
        const ch = script[i];
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
        if (depth > 0) body += ch;
        i += 1;
      }

      parts.push({ type: 'var', value: body });
    } else {
      buffer += script[i];
      i += 1;
    }
  }

  if (buffer) parts.push({ type: 'raw', value: buffer });
  return parts;
}

function parseKeyValue(body) {
  const idx = body.indexOf(':');
  if (idx === -1) return { key: body.trim().toLowerCase(), value: '' };
  return {
    key: body.slice(0, idx).trim().toLowerCase(),
    value: body.slice(idx + 1).trim()
  };
}

function parseColor(value) {
  const raw = String(value || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return null;
  return Number.parseInt(raw, 16);
}

function parseBool(value) {
  return ['true', 'yes', '1', 'inline'].includes(String(value || '').trim().toLowerCase());
}

function currentEmbed(state) {
  if (!state.current) {
    state.current = new EmbedBuilder();
    state.embeds.push(state.current);
  }

  return state.current;
}

function startEmbed(state) {
  if (state.embeds.length >= MAX_EMBEDS) return currentEmbed(state);
  state.current = new EmbedBuilder();
  state.embeds.push(state.current);
  return state.current;
}

function addButton(state, value, context) {
  if (state.rows.length >= MAX_ROWS) return;
  const pieces = value.split('&&').map((part) => replaceVariables(part.trim(), context));
  const url = pieces[0] || '';
  const label = pieces[1] || 'Open';
  const emoji = pieces[2] && pieces[2] !== '/e' ? pieces[2] : undefined;
  const disabled = String(pieces[3] || '').toLowerCase() === 'disabled';

  if (!/^https?:\/\//i.test(url)) return;

  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setURL(url)
    .setLabel(label.slice(0, 80))
    .setDisabled(disabled);

  if (emoji) {
    const parsedEmoji = parseComponentEmoji(emoji);
    if (parsedEmoji) button.setEmoji(parsedEmoji);
  }

  let row = state.rows[state.rows.length - 1];
  if (!row || row.components.length >= 5 || row.components.some((component) => component.data?.type === 3)) {
    row = new ActionRowBuilder();
    state.rows.push(row);
  }
  row.addComponents(button);
}

function addSelect(state, value, context) {
  if (state.rows.length >= MAX_ROWS) return;
  const pieces = value.split('&&').map((part) => replaceVariables(part.trim(), context));
  const customId = pieces.shift() || `select_${Date.now()}`;
  const placeholder = pieces.shift() || 'Choose an option';
  const options = [];

  for (const piece of pieces.slice(0, 25)) {
    const [label, optionValue, description] = piece.split('|').map((x) => x?.trim());
    if (!label) continue;
    options.push({ label: label.slice(0, 100), value: (optionValue || label).slice(0, 100), description: description?.slice(0, 100) });
  }

  if (!options.length) return;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId.slice(0, 100))
    .setPlaceholder(placeholder.slice(0, 150))
    .addOptions(options);

  state.rows.push(new ActionRowBuilder().addComponents(menu));
}

function applyVar(state, body, context) {
  const trimmed = body.trim();
  if (!trimmed) return;

  if (trimmed.toLowerCase() === 'embed') {
    startEmbed(state);
    return;
  }

  const { key, value: rawValue } = parseKeyValue(trimmed);
  const value = replaceVariables(rawValue, context);

  if (key === 'embed') {
    startEmbed(state);
    return;
  }

  if (key === 'message' || key === 'content') {
    state.content += value;
    return;
  }

  if (key === 'button') {
    addButton(state, rawValue, context);
    return;
  }

  if (key === 'select' || key === 'dropdown') {
    addSelect(state, rawValue, context);
    return;
  }

  const embed = currentEmbed(state);

  if (key === 'title') embed.setTitle(value.slice(0, 256));
  if (key === 'description' || key === 'desc') embed.setDescription(value.slice(0, 4096));
  if (key === 'url') embed.setURL(value);
  if (key === 'color') {
    const color = parseColor(value);
    if (color !== null) embed.setColor(color);
  }
  if (key === 'image') embed.setImage(value);
  if (key === 'thumbnail' || key === 'thumb') embed.setThumbnail(value);
  if (key === 'footer') {
    const [text, iconURL] = value.split('&&').map((part) => part.trim());
    if (text) embed.setFooter({ text: text.slice(0, 2048), iconURL: iconURL || undefined });
  }
  if (key === 'author') {
    const [name, iconURL, url] = value.split('&&').map((part) => part.trim());
    if (name) embed.setAuthor({ name: name.slice(0, 256), iconURL: iconURL || undefined, url: url || undefined });
  }
  if (key === 'field') {
    const [name, fieldValue, inline] = value.split('&&').map((part) => part.trim());
    if (name && fieldValue) embed.addFields({ name: name.slice(0, 256), value: fieldValue.slice(0, 1024), inline: parseBool(inline) });
  }
}

function parseEmbedScript(script, context = {}) {
  const state = {
    content: '',
    embeds: [],
    current: null,
    rows: []
  };

  let normalized = String(script || '');
  normalized = normalized.replace(/^,?ce\s+/i, '');
  normalized = normalized.replace(/^,?embed\s+/i, '');

  // Allow initial {embed} markers and multiple embeds between $v{} blocks.
  const parts = splitVars(normalized.replaceAll('{embed}', '$v{embed}'));

  for (const part of parts) {
    if (part.type === 'raw') {
      const text = replaceVariables(part.value, context);
      if (text.trim()) state.content += text;
    } else {
      applyVar(state, part.value, context);
    }
  }

  const embeds = state.embeds
    .slice(0, MAX_EMBEDS)
    .map((embed) => embed.toJSON())
    .filter((embed) => Object.keys(embed).length > 0)
    .map((json) => EmbedBuilder.from(json));

  const payload = {
    content: state.content.trim() || undefined,
    embeds,
    components: state.rows.slice(0, MAX_ROWS),
    allowedMentions: { parse: ['users', 'roles'] }
  };

  if (!payload.content && !payload.embeds.length) {
    throw new Error('I could not find message content or embed data in that script.');
  }

  return payload;
}

function validateEmbedScript(script, context = {}) {
  try {
    const payload = parseEmbedScript(script, context);
    return {
      ok: true,
      errors: [],
      summary: {
        hasContent: Boolean(payload.content),
        embeds: payload.embeds?.length || 0,
        components: payload.components?.length || 0
      }
    };
  } catch (error) {
    return { ok: false, errors: [error.message], summary: null };
  }
}

module.exports = {
  parseEmbedScript,
  validateEmbedScript,
  replaceVariables
};
