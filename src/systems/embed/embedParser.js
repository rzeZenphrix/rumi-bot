const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const { parseComponentEmoji } = require('../../utils/componentEmoji');
const { safeEmojiObject } = require('../tickets/ticketManager');

function parseBlocks(input) {
  const text = String(input || '');
  const blocks = [];
  let index = 0;

  while (index < text.length) {
    const start = text.indexOf('$v{', index);
    if (start === -1) break;

    let cursor = start + 3;
    let depth = 1;

    while (cursor < text.length && depth > 0) {
      const char = text[cursor];

      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;

      cursor += 1;
    }

    blocks.push(text.slice(start + 3, cursor - 1));
    index = cursor;
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

function color(value) {
  const clean = String(value || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return 0x2b2d31;
  return parseInt(clean, 16);
}

function resolveUrl(value) {
  const clean = String(value || '').trim();
  return /^https?:\/\//i.test(clean) ? clean : null;
}

function buttonStyle(value) {
  const clean = String(value || '').toLowerCase();

  if (['primary', 'blurple'].includes(clean)) return ButtonStyle.Primary;
  if (['secondary', 'gray', 'grey'].includes(clean)) return ButtonStyle.Secondary;
  if (['success', 'green'].includes(clean)) return ButtonStyle.Success;
  if (['danger', 'red'].includes(clean)) return ButtonStyle.Danger;
  if (['link', 'url'].includes(clean)) return ButtonStyle.Link;

  return ButtonStyle.Secondary;
}

function extractAction(parts) {
  const item = parts.find((part) => /^action=/i.test(part));
  if (!item) return null;

  return item.slice(item.indexOf('=') + 1).trim();
}

function buildButton(value, index) {
  const parts = value.split('&&').map((part) => part.trim()).filter(Boolean);
  const action = extractAction(parts);
  const url = parts.find((part) => /^https?:\/\//i.test(part));
  const styleText = parts.find((part) => ['primary', 'secondary', 'success', 'danger', 'link', 'url', 'blurple', 'gray', 'grey', 'green', 'red'].includes(part.toLowerCase())) || (url ? 'link' : 'secondary');

  let label = parts.find((part) => {
    if (/^action=/i.test(part)) return false;
    if (/^https?:\/\//i.test(part)) return false;
    if (['primary', 'secondary', 'success', 'danger', 'link', 'url', 'blurple', 'gray', 'grey', 'green', 'red'].includes(part.toLowerCase())) return false;
    if (safeEmojiObject(part)) return false;
    return true;
  }) || 'Button';

  const emojiText = parts.find((part) => safeEmojiObject(part));
  const style = buttonStyle(styleText);

  const button = new ButtonBuilder()
    .setLabel(label.slice(0, 80))
    .setStyle(style);

  const emoji = safeEmojiObject(emojiText);
  if (emoji) {
    const parsedEmoji = parseComponentEmoji(emoji);
    if (parsedEmoji) button.setEmoji(parsedEmoji);
  }

  if (action?.startsWith('create_ticket:')) {
    const typeKey = action.split(':').slice(1).join(':');
    button.setCustomId(`ticket:create_key:${typeKey}`);
    if (style === ButtonStyle.Link) button.setStyle(ButtonStyle.Primary);
    return button;
  }

  if (style === ButtonStyle.Link) {
    if (!url) {
      button.setStyle(ButtonStyle.Secondary);
      button.setCustomId(`embed:button:${index}`);
    } else {
      button.setURL(url);
    }
  } else {
    button.setCustomId(action ? `embed:action:${index}:${action}` : `embed:button:${index}`);
  }

  return button;
}

function buildDropdown(value) {
  const parts = value.split('&&').map((part) => part.trim()).filter(Boolean);
  const placeholder = parts.shift() || 'Choose an option';

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:select_key')
    .setPlaceholder(placeholder.slice(0, 150))
    .setMinValues(1)
    .setMaxValues(1);

  let optionCount = 0;

  for (const raw of parts.slice(0, 25)) {
    const [key, label, description, emojiText] = raw.split(':').map((part) => String(part || '').trim());

    if (!key || !label) continue;

    const option = {
      label: label.slice(0, 100),
      value: key.slice(0, 100),
      description: (description || `Open a ${label} ticket`).slice(0, 100)
    };

    const emoji = safeEmojiObject(emojiText);
    if (emoji) option.emoji = emoji;

    menu.addOptions(option);
    optionCount += 1;
  }

  return optionCount ? menu : null;
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

function addButtonsToRows(buttons) {
  const rows = [];

  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  return rows;
}

async function parseEmbedScript(script, context = {}) {
  const blocks = parseBlocks(script);
  const config = {
    color: 0x2b2d31,
    fields: [],
    buttons: [],
    dropdowns: [],
    timestamp: false
  };

  for (const block of blocks) {
    const [key, value] = splitKeyValue(block);

    if (key === 'color') config.color = color(value);
    else if (key === 'title') config.title = value;
    else if (key === 'url') config.url = value;
    else if (key === 'description') config.description = extractInlineMedia(value, config);
    else if (key === 'thumbnail') config.thumbnail = value;
    else if (key === 'image' || key === 'gif') config.image = value;
    else if (key === 'timestamp') config.timestamp = ['on', 'true', 'yes'].includes(value.toLowerCase());
    else if (key === 'author') {
      const [name, iconURL, url] = value.split('&&').map((part) => part.trim());
      config.author = { name, iconURL, url };
    } else if (key === 'footer') {
      const [text, iconURL] = value.split('&&').map((part) => part.trim());
      config.footer = { text, iconURL };
    } else if (key === 'field') {
      const [name, fieldValue, inline] = value.split('&&').map((part) => part.trim());
      config.fields.push({
        name: name || '\u200b',
        value: fieldValue || '\u200b',
        inline: ['true', 'yes', 'inline'].includes(String(inline || '').toLowerCase())
      });
    } else if (key === 'button') {
      config.buttons.push(buildButton(value, config.buttons.length));
    } else if (key === 'dropdown') {
      const dropdown = buildDropdown(value);
      if (dropdown) config.dropdowns.push(dropdown);
    }
  }

  if (!blocks.length) config.description = String(script || '');

  const embed = new EmbedBuilder().setColor(config.color);

  if (config.title) embed.setTitle(config.title.slice(0, 256));
  if (resolveUrl(config.url)) embed.setURL(config.url);
  if (config.description) embed.setDescription(config.description.slice(0, 4096));
  if (resolveUrl(config.thumbnail)) embed.setThumbnail(config.thumbnail);
  if (resolveUrl(config.image)) embed.setImage(config.image);
  if (config.timestamp) embed.setTimestamp();

  if (config.author?.name) {
    embed.setAuthor({
      name: config.author.name.slice(0, 256),
      iconURL: resolveUrl(config.author.iconURL) || undefined,
      url: resolveUrl(config.author.url) || undefined
    });
  }

  if (config.footer?.text) {
    embed.setFooter({
      text: config.footer.text.slice(0, 2048),
      iconURL: resolveUrl(config.footer.iconURL) || undefined
    });
  }

  if (config.fields.length) embed.addFields(config.fields.slice(0, 25));

  const rows = [
    ...addButtonsToRows(config.buttons),
    ...config.dropdowns.map((dropdown) => new ActionRowBuilder().addComponents(dropdown))
  ].slice(0, 5);

  return {
    config,
    embeds: [embed],
    components: rows
  };
}

module.exports = {
  parseEmbedScript
};
