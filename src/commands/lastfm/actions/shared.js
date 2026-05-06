const respond = require('../../../utils/respond');
const { createPagedMessage } = require('../../../utils/pagedMessages');
const { createLinkComponents, resolveMemberByText } = require('../../../systems/musicAccounts/shared');

function formatNumber(value) {
  return new Intl.NumberFormat('en-GB').format(Number(value || 0));
}

function unix(value) {
  return value ? `<t:${Number(value)}:R>` : 'Unknown';
}

async function resolveLastFmTarget(message, args = [], getLinkedUsername) {
  const text = args.join(' ').trim();
  if (!text) {
    const username = await getLinkedUsername(message.author.id);
    return { username, member: message.member };
  }

  const directMember = await resolveMemberByText(message, text);
  if (directMember) {
    return {
      username: await getLinkedUsername(directMember.id),
      member: directMember
    };
  }

  if (args.length === 1) {
    const maybeMember = await resolveMemberByText(message, args[0]);
    if (maybeMember) {
      return {
        username: await getLinkedUsername(maybeMember.id),
        member: maybeMember
      };
    }
  }

  return { username: text.replace(/^@+/, '').trim(), member: null };
}

async function replyLinkPrompt(message, text = 'Link your Last.fm account first.') {
  const { session, components } = await createLinkComponents('lastfm', message.author.id, {
    source: 'bot',
    metadata: { command: 'lastfm link', requestedAt: new Date().toISOString() }
  });

  return respond.reply(message, 'info', null, {
    mentionUser: false,
    title: 'Connect Last.fm',
    description: `${text}\n\nThis one-time link expires <t:${Math.floor(new Date(session.expires_at).getTime() / 1000)}:R>.`,
    components
  });
}

function pagingPayload(prefix, ownerId, guildId, pages) {
  return createPagedMessage({
    prefix,
    ownerId,
    guildId,
    type: 'info',
    pages
  });
}

module.exports = {
  formatNumber,
  unix,
  resolveLastFmTarget,
  replyLinkPrompt,
  pagingPayload
};
