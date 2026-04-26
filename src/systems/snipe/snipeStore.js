const DELETE_SNIPES = new Map();
const EDIT_SNIPES = new Map();

const MAX_SNIPES_PER_CHANNEL = 10;

function channelKey(messageOrChannel) {
  const guildId = messageOrChannel.guild?.id;
  const channelId = messageOrChannel.channel?.id || messageOrChannel.id;

  if (!guildId || !channelId) return null;

  return `${guildId}:${channelId}`;
}

function isRenderableMedia(item) {
  const name = item.name || '';
  const contentType = item.contentType || '';

  return (
    contentType.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp)$/i.test(name)
  );
}

function serializeAttachment(attachment) {
  return {
    id: attachment.id,
    name: attachment.name || 'attachment',
    url: attachment.url,
    proxyURL: attachment.proxyURL,
    contentType: attachment.contentType || '',
    size: attachment.size || 0,
    renderable: isRenderableMedia({
      name: attachment.name,
      contentType: attachment.contentType
    })
  };
}

function serializeSticker(sticker) {
  return {
    id: sticker.id,
    name: sticker.name || 'sticker',
    url: sticker.url,
    contentType: 'image/sticker',
    renderable: true,
    sticker: true
  };
}

function serializeMessage(message) {
  return {
    messageId: message.id,
    channelId: message.channel?.id,
    guildId: message.guild?.id,
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || 'Unknown user',
    authorMention: message.author?.id ? `<@${message.author.id}>` : '**Unknown user**',
    content: message.content || '',
    attachments: [...(message.attachments?.values?.() || [])].map(serializeAttachment),
    stickers: [...(message.stickers?.values?.() || [])].map(serializeSticker),
    createdAt: message.createdTimestamp || Date.now(),
    storedAt: Date.now()
  };
}

function push(map, key, payload) {
  const current = map.get(key) || [];

  current.unshift(payload);

  while (current.length > MAX_SNIPES_PER_CHANNEL) {
    current.pop();
  }

  map.set(key, current);
}

function addDeleteSnipe(message, action = {}) {
  if (!message.guild || !message.channel) return;
  if (message.author?.bot) return;

  const key = channelKey(message);
  if (!key) return;

  const payload = {
    type: 'delete',
    actionById: action.executorId || null,
    actionByTag: action.executorTag || null,
    actionByMention: action.executorId ? `<@${action.executorId}>` : null,
    actionSource: action.source || 'unknown',
    actionAt: Date.now(),
    ...serializeMessage(message)
  };

  if (!payload.content && !payload.attachments.length && !payload.stickers.length) {
    return;
  }

  push(DELETE_SNIPES, key, payload);
}

function addEditSnipe(oldMessage, newMessage) {
  if (!oldMessage.guild || !oldMessage.channel) return;
  if (oldMessage.author?.bot) return;

  const oldContent = oldMessage.content || '';
  const newContent = newMessage.content || '';

  const oldAttachments = [...(oldMessage.attachments?.values?.() || [])].map(serializeAttachment);
  const oldStickers = [...(oldMessage.stickers?.values?.() || [])].map(serializeSticker);

  if (oldContent === newContent && !oldAttachments.length && !oldStickers.length) {
    return;
  }

  const key = channelKey(oldMessage);
  if (!key) return;

  const payload = {
    type: 'edit',
    actionById: oldMessage.author?.id || null,
    actionByTag: oldMessage.author?.tag || 'Unknown user',
    actionByMention: oldMessage.author?.id ? `<@${oldMessage.author.id}>` : null,
    actionSource: 'message_update',
    ...serializeMessage(oldMessage),
    oldContent,
    newContent,
    editedAt: Date.now()
  };

  push(EDIT_SNIPES, key, payload);
}

function getSnipe(channel, type = 'delete', index = 1) {
  const key = channelKey(channel);
  if (!key) return null;

  const list = type === 'edit'
    ? EDIT_SNIPES.get(key) || []
    : DELETE_SNIPES.get(key) || [];

  const safeIndex = Math.max(1, Math.min(MAX_SNIPES_PER_CHANNEL, Number(index) || 1));

  return list[safeIndex - 1] || null;
}

module.exports = {
  MAX_SNIPES_PER_CHANNEL,
  addDeleteSnipe,
  addEditSnipe,
  getSnipe,
  isRenderableMedia
};