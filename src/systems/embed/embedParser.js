const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const { resolveVariables } = require('../variables/variableRegistry');
const respond = require('../../utils/respond');

function parseBlocks(input) {
  const text = String(input || '');
  const blocks = [];
  let i = 0;

  while (i < text.length) {
    const start = text.indexOf('$v{', i);
    if (start === -1) break;

    let depth = 1;
    let cursor = start + 3;

    while (cursor < text.length && depth > 0) {
      const char = text[cursor];

      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;

      cursor += 1;
    }

    const raw = text.slice(start + 3, cursor - 1);
    blocks.push(raw);
    i = cursor;
  }

  return blocks;
}

function splitKeyValue(block) {
  const index = block.indexOf(':');
  if (index === -1) return [block.trim().toLowerCase(), ''];

  return [
    block.slice(0, index).trim().toLowerCase(),
    block.slice(index + 1).trim()
  ];
}

function normalizeColor(value) {
  const clean = String(value || '').replace('#', '').trim();

  if (!/^[0-9a-f]{6}$/i.test(clean)) return respond.DEFAULT_EMBED_COLOR;

  return Number.parseInt(clean, 16);
}

function extractInlineMedia(description, config) {
  let output = String(description || '');

  output = output.replace(/\{image:\s*(https?:\/\/[^}]+)\}/gi, (_, url) => {
    config.image = url.trim();
    return '';
  });

  output = output.replace(/\{thumbnail:\s*(https?:\/\/[^}]+)\}/gi, (_, url) => {
    config.thumbnail = url.trim();
    return '';
  });

  return output.trim();
}

function parseField(value) {
  const parts = value.split('&&').map((part) => part.trim());

  return {
    name: parts[0] || '\u200b',
    value: parts[1] || '\u200b',
    inline: ['true', 'yes', 'inline'].includes(String(parts[2] || '').toLowerCase())
  };
}

function buttonStyle(value) {
  const clean = String(value || '').toLowerCase();

  if (clean === 'primary' || clean === 'blurple') return ButtonStyle.Primary;
  if (clean === 'secondary' || clean === 'gray' || clean === 'grey') return ButtonStyle.Secondary;
  if (clean === 'success' || clean === 'green') return ButtonStyle.Success;
  if (clean === 'danger' || clean === 'red') return ButtonStyle.Danger;
  if (clean === 'link' || clean === 'url') return ButtonStyle.Link;

  return ButtonStyle.Secondary;
}

function parseButton(value, index) {
  const parts = value.split('&&').map((part) => part.trim());

  const maybeUrl = parts.find((part) => /^https?:\/\//i.test(part));
  const label = parts.find((part) => part && !/^https?:\/\//i.test(part) && !['primary', 'secondary', 'success', 'danger', 'link', 'url'].includes(part.toLowerCase())) || 'Button';
  const styleText = parts.find((part) => ['primary', 'secondary', 'success', 'danger', 'link', 'url', 'blurple', 'gray', 'grey', 'green', 'red'].includes(part.toLowerCase())) || (maybeUrl ? 'link' : 'secondary');
  const emoji = parts.find((part) => /^<a?:.+:\d+>$|^\p{Emoji}/u.test(part)) || null;

  return {
    label,
    url: maybeUrl,
    style: styleText,
    emoji,
    customId: maybeUrl ? null : `ohara_embed_button_${index}`,
    action: parts.find((part) => part.startsWith('action='))?.slice(7) || null,
    roleId: parts.find((part) => part.startsWith('role='))?.slice(5) || null
  };
}

function buildComponents(config) {
  const rows = [];
  const buttons = config.buttons || [];

  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder();

    for (const buttonConfig of buttons.slice(i, i + 5)) {
      const button = new ButtonBuilder()
        .setLabel(buttonConfig.label.slice(0, 80))
        .setStyle(buttonStyle(buttonConfig.style));

      if (buttonConfig.emoji) button.setEmoji(buttonConfig.emoji);

      if (buttonStyle(buttonConfig.style) === ButtonStyle.Link && buttonConfig.url) {
        button.setURL(buttonConfig.url);
      } else {
        button.setCustomId(buttonConfig.customId || `ohara_embed_button_${i}`);
      }

      row.addComponents(button);
    }

    rows.push(row);
  }

  for (const dropdown of config.dropdowns || []) {
    const row = new ActionRowBuilder();
    const menu = new StringSelectMenuBuilder()
      .setCustomId(dropdown.customId || 'ohara_embed_dropdown')
      .setPlaceholder(dropdown.placeholder || 'Choose an option')
      .setMinValues(dropdown.min || 1)
      .setMaxValues(dropdown.max || 1);

    menu.addOptions(dropdown.options.slice(0, 25));
    row.addComponents(menu);
    rows.push(row);
  }

  return rows.slice(0, 5);
}

async function parseEmbedScript(script, context = {}) {
  const hasEmbedToken = String(script).includes('{embed}');
  const blocks = parseBlocks(script);

  const config = {
    color: respond.DEFAULT_EMBED_COLOR,
    fields: [],
    buttons: [],
    dropdowns: [],
    timestamp: false
  };

  for (const block of blocks) {
    const [key, rawValue] = splitKeyValue(block);
    const value = await resolveVariables(rawValue, context);

    if (key === 'title') config.title = value;
    else if (key === 'url') config.url = value;
    else if (key === 'description') config.description = extractInlineMedia(value, config);
    else if (key === 'color') config.color = normalizeColor(value);
    else if (key === 'thumbnail') config.thumbnail = value;
    else if (key === 'image' || key === 'gif') config.image = value;
    else if (key === 'timestamp') config.timestamp = ['true', 'yes', 'on'].includes(value.toLowerCase());
    else if (key === 'author') {
      const [name, iconURL, url] = value.split('&&').map((part) => part.trim());
      config.author = { name, iconURL, url };
    } else if (key === 'footer') {
      const [text, iconURL] = value.split('&&').map((part) => part.trim());
      config.footer = { text, iconURL };
    } else if (key === 'field') {
      config.fields.push(parseField(value));
    } else if (key === 'button') {
      config.buttons.push(parseButton(value, config.buttons.length));
    }
  }

  if (!hasEmbedToken && blocks.length === 0) {
    config.description = await resolveVariables(script, context);
  }

  const embed = new EmbedBuilder().setColor(config.color);

  if (config.title) embed.setTitle(config.title.slice(0, 256));
  if (config.url && /^https?:\/\//i.test(config.url)) embed.setURL(config.url);
  if (config.description) embed.setDescription(config.description.slice(0, 4096));
  if (config.thumbnail && /^https?:\/\//i.test(config.thumbnail)) embed.setThumbnail(config.thumbnail);
  if (config.image && /^https?:\/\//i.test(config.image)) embed.setImage(config.image);

  if (config.author?.name) {
    embed.setAuthor({
      name: config.author.name.slice(0, 256),
      iconURL: config.author.iconURL && /^https?:\/\//i.test(config.author.iconURL) ? config.author.iconURL : undefined,
      url: config.author.url && /^https?:\/\//i.test(config.author.url) ? config.author.url : undefined
    });
  }

  if (config.footer?.text) {
    embed.setFooter({
      text: config.footer.text.slice(0, 2048),
      iconURL: config.footer.iconURL && /^https?:\/\//i.test(config.footer.iconURL) ? config.footer.iconURL : undefined
    });
  }

  if (config.timestamp) embed.setTimestamp();

  if (config.fields.length) {
    embed.addFields(config.fields.slice(0, 25));
  }

  return {
    config,
    embeds: [embed],
    components: buildComponents(config)
  };
}

module.exports = {
  parseEmbedScript
};
