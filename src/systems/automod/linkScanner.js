const URL_REGEX = /https?:\/\/[^\s<]+/gi;

const DISCORD_INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/([a-z0-9-]+)/gi;

function scanLinks(content = '') {
  const safeContent = String(content || '');

  const links = safeContent.match(URL_REGEX) || [];
  const invites = [...safeContent.matchAll(DISCORD_INVITE_REGEX)].map((match) => match[0]);

  return {
    links,
    invites,
    hasLinks: links.length > 0,
    hasInvites: invites.length > 0
  };
}

module.exports = {
  scanLinks
};