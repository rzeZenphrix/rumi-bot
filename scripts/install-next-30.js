const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function write(file, content) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trimStart());
  console.log(`wrote ${file}`);
}

const basic = (name, aliases, category, description, usage, body) => `
const respond = require('../../utils/respond');

module.exports = {
  name: '${name}',
  aliases: ${JSON.stringify(aliases)},
  category: '${category}',
  description: ${JSON.stringify(description)},
  usage: ${JSON.stringify(usage)},
  examples: [${JSON.stringify(usage)}],

  async execute({ message, args }) {
${body}
  }
};
`;

write('src/commands.js/text/clap.js', basic(
  'clap',
  ['clapify'],
  'text',
  'Turns text into clap text.',
  'clap <text>',
  `    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to clapify.');
    return respond.reply(message, 'info', text.split(/\\s+/).join(' 👏 '));`
));

write('src/commands.js/text/mocktext.js', basic(
  'mocktext',
  ['spongebob', 'sarcasm'],
  'text',
  'Turns text into alternating mock case.',
  'mocktext <text>',
  `    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to mock.');
    const out = [...text].map((c, i) => i % 2 ? c.toLowerCase() : c.toUpperCase()).join('');
    return respond.reply(message, 'info', out);`
));

write('src/commands.js/text/repeat.js', basic(
  'repeat',
  ['reptext'],
  'text',
  'Repeats text a safe number of times.',
  'repeat <2-10> <text>',
  `    const count = Math.min(10, Math.max(2, Number(args.shift()) || 2));
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to repeat.');
    return respond.reply(message, 'info', Array(count).fill(text).join('\\n').slice(0, 3900));`
));

write('src/commands.js/text/spoiler.js', basic(
  'spoiler',
  ['hideword'],
  'text',
  'Wraps text in Discord spoiler tags.',
  'spoiler <text>',
  `    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to spoiler.');
    return respond.reply(message, 'info', text.split(/\\s+/).map(w => \`||\${w}||\`).join(' '));`
));

write('src/commands.js/text/uppercase.js', basic(
  'uppercase',
  ['upper', 'caps'],
  'text',
  'Uppercases text.',
  'uppercase <text>',
  `    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to uppercase.');
    return respond.reply(message, 'info', text.toUpperCase());`
));

write('src/commands.js/text/lowercase.js', basic(
  'lowercase',
  ['lower'],
  'text',
  'Lowercases text.',
  'lowercase <text>',
  `    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to lowercase.');
    return respond.reply(message, 'info', text.toLowerCase());`
));

write('src/commands.js/text/reversetext.js', basic(
  'reversetext',
  ['revtext', 'fliptext'],
  'text',
  'Reverses text.',
  'reversetext <text>',
  `    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to reverse.');
    return respond.reply(message, 'info', [...text].reverse().join(''));`
));

write('src/commands.js/text/wordcount.js', basic(
  'wordcount',
  ['wc'],
  'text',
  'Counts characters, words, and lines.',
  'wordcount <text>',
  `    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to count.');
    const words = text.split(/\\s+/).filter(Boolean).length;
    const lines = text.split(/\\n/).length;
    return respond.reply(message, 'info', null, {
      description: 'I counted that text.',
      fields: [
        { name: 'Characters', value: String(text.length), inline: true },
        { name: 'Words', value: String(words), inline: true },
        { name: 'Lines', value: String(lines), inline: true }
      ]
    });`
));

write('src/commands.js/tools/uuid.js', basic(
  'uuid',
  ['guid'],
  'tools',
  'Generates a UUID.',
  'uuid',
  `    return respond.reply(message, 'info', crypto.randomUUID());`
).replace("const respond", "const crypto = require('node:crypto');\nconst respond"));

write('src/commands.js/tools/base64encode.js', basic(
  'base64encode',
  ['b64e'],
  'tools',
  'Encodes text to Base64.',
  'base64encode <text>',
  `    const text = args.join(' ');
    if (!text) return respond.reply(message, 'info', 'need text to encode.');
    return respond.reply(message, 'info', Buffer.from(text, 'utf8').toString('base64'));`
));

write('src/commands.js/tools/base64decode.js', basic(
  'base64decode',
  ['b64d'],
  'tools',
  'Decodes Base64 text.',
  'base64decode <text>',
  `    const text = args.join('');
    if (!text) return respond.reply(message, 'info', 'need Base64 text to decode.');
    try {
      return respond.reply(message, 'info', Buffer.from(text, 'base64').toString('utf8'));
    } catch {
      return respond.reply(message, 'bad', 'could not decode that Base64 text.');
    }`
));

write('src/commands.js/tools/urlencode.js', basic(
  'urlencode',
  ['encodeurl'],
  'tools',
  'URL-encodes text.',
  'urlencode <text>',
  `    const text = args.join(' ');
    if (!text) return respond.reply(message, 'info', 'need text to encode.');
    return respond.reply(message, 'info', encodeURIComponent(text));`
));

write('src/commands.js/tools/urldecode.js', basic(
  'urldecode',
  ['decodeurl'],
  'tools',
  'URL-decodes text.',
  'urldecode <text>',
  `    const text = args.join(' ');
    if (!text) return respond.reply(message, 'info', 'need text to decode.');
    try {
      return respond.reply(message, 'info', decodeURIComponent(text));
    } catch {
      return respond.reply(message, 'bad', 'could not decode that URL text.');
    }`
));

write('src/commands.js/tools/timestamp.js', basic(
  'timestamp',
  ['ts'],
  'tools',
  'Creates Discord timestamp formats.',
  'timestamp [unix]',
  `    const unix = Number(args[0]) || Math.floor(Date.now() / 1000);
    return respond.reply(message, 'info', null, {
      description: 'I generated Discord timestamps.',
      fields: [
        { name: 'Short time', value: \`<t:\${unix}:t>\`, inline: true },
        { name: 'Long date', value: \`<t:\${unix}:F>\`, inline: true },
        { name: 'Relative', value: \`<t:\${unix}:R>\`, inline: true },
        { name: 'Raw', value: \`\\\`<t:\${unix}:R>\\\`\` }
      ]
    });`
));

write('src/commands.js/tools/httpstatus.js', basic(
  'httpstatus',
  ['statuscode'],
  'tools',
  'Explains common HTTP status codes.',
  'httpstatus <code>',
  `    const code = String(args[0] || '');
    const map = {
      200: 'OK — the request succeeded.',
      201: 'Created — a resource was created.',
      204: 'No Content — success without a response body.',
      301: 'Moved Permanently — the resource moved.',
      302: 'Found — temporary redirect.',
      400: 'Bad Request — the request is invalid.',
      401: 'Unauthorized — authentication is needed.',
      403: 'Forbidden — access is denied.',
      404: 'Not Found — resource not found.',
      409: 'Conflict — request conflicts with current state.',
      429: 'Too Many Requests — rate limited.',
      500: 'Internal Server Error — server crashed.',
      502: 'Bad Gateway — upstream failed.',
      503: 'Service Unavailable — server unavailable.'
    };
    return respond.reply(message, map[code] ? 'info' : 'bad', map[code] || 'do not know that status code.');`
));

write('src/commands.js/server/membercount.js', basic(
  'membercount',
  ['members'],
  'server',
  'Shows server member count.',
  'membercount',
  `    return respond.reply(message, 'info', null, {
      description: 'I counted the server members.',
      fields: [
        { name: 'Members', value: String(message.guild.memberCount || message.guild.members.cache.size), inline: true },
        { name: 'Cached users', value: String(message.guild.members.cache.filter(m => !m.user.bot).size), inline: true },
        { name: 'Cached bots', value: String(message.guild.members.cache.filter(m => m.user.bot).size), inline: true }
      ]
    });`
));

write('src/commands.js/server/bots.js', basic(
  'bots',
  ['botlist'],
  'server',
  'Lists cached bots.',
  'bots',
  `    const bots = message.guild.members.cache.filter(m => m.user.bot).first(20);
    return respond.reply(message, 'info', bots.map(m => \`\${m.user.tag} (\\\`\${m.id}\\\`)\`).join('\\n') || 'I found no cached bots.');`
));

write('src/commands.js/server/humans.js', basic(
  'humans',
  ['humanlist'],
  'server',
  'Shows cached human count.',
  'humans',
  `    const humans = message.guild.members.cache.filter(m => !m.user.bot);
    return respond.reply(message, 'info', \`found **\${humans.size}** cached human members.\`);`
));

write('src/commands.js/server/boosters.js', basic(
  'boosters',
  ['boosts'],
  'server',
  'Lists server boosters.',
  'boosters',
  `    const boosters = message.guild.members.cache.filter(m => m.premiumSince).first(25);
    return respond.reply(message, 'info', boosters.map(m => \`\${m} — <t:\${Math.floor(m.premiumSinceTimestamp / 1000)}:R>\`).join('\\n') || 'found no cached boosters.');`
));

write('src/commands.js/server/oldest.js', basic(
  'oldest',
  ['oldestmembers'],
  'server',
  'Shows oldest cached accounts.',
  'oldest',
  `    const members = [...message.guild.members.cache.values()]
      .sort((a, b) => a.user.createdTimestamp - b.user.createdTimestamp)
      .slice(0, 10);
    return respond.reply(message, 'info', members.map((m, i) => \`**\${i + 1}.** \${m.user.tag} — <t:\${Math.floor(m.user.createdTimestamp / 1000)}:R>\`).join('\\n'));`
));

write('src/commands.js/server/newest.js', basic(
  'newest',
  ['newestmembers'],
  'server',
  'Shows newest cached accounts.',
  'newest',
  `    const members = [...message.guild.members.cache.values()]
      .sort((a, b) => b.user.createdTimestamp - a.user.createdTimestamp)
      .slice(0, 10);
    return respond.reply(message, 'info', members.map((m, i) => \`**\${i + 1}.** \${m.user.tag} — <t:\${Math.floor(m.user.createdTimestamp / 1000)}:R>\`).join('\\n'));`
));

write('src/commands.js/server/joinedat.js', basic(
  'joinedat',
  ['joined'],
  'server',
  'Shows when a member joined.',
  'joinedat [user]',
  `    const member = message.mentions.members.first() || message.member;
    return respond.reply(message, 'info', \`\${member} joined <t:\${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:\${Math.floor(member.joinedTimestamp / 1000)}:R>).\`);`
));

write('src/commands.js/server/createdat.js', basic(
  'createdat',
  ['created'],
  'server',
  'Shows when an account was created.',
  'createdat [user]',
  `    const user = message.mentions.users.first() || message.author;
    return respond.reply(message, 'info', \`\${user} was created <t:\${Math.floor(user.createdTimestamp / 1000)}:F> (<t:\${Math.floor(user.createdTimestamp / 1000)}:R>).\`);`
));

write('src/commands.js/server/rolecount.js', basic(
  'rolecount',
  ['rolescount'],
  'server',
  'Shows server role count.',
  'rolecount',
  `    return respond.reply(message, 'info', \`found **\${message.guild.roles.cache.size}** roles in this server.\`);`
));

write('src/commands.js/server/serveremojis.js', basic(
  'serveremojis',
  ['emojilist'],
  'server',
  'Lists server emojis.',
  'serveremojis',
  `    const emojis = message.guild.emojis.cache.map(e => \`\${e} \\\`:\${e.name}:\\\`\`).slice(0, 40);
    return respond.reply(message, 'info', emojis.join(' ') || 'found no server emojis.');`
));

write('src/commands.js/server/serverstickers.js', basic(
  'serverstickers',
  ['stickerlist'],
  'server',
  'Lists server stickers.',
  'serverstickers',
  `    const stickers = message.guild.stickers.cache.map(s => \`\${s.name} (\\\`\${s.id}\\\`)\`).slice(0, 30);
    return respond.reply(message, 'info', stickers.join('\\n') || 'found no server stickers.');`
));

write('src/commands.js/server/permissions.js', basic(
  'permissions',
  ['perms'],
  'server',
  'Shows a member permissions summary.',
  'permissions [user]',
  `    const member = message.mentions.members.first() || message.member;
    const perms = member.permissions.toArray().map(p => p.replace(/([a-z])([A-Z])/g, '$1 $2')).slice(0, 40);
    return respond.reply(message, 'info', null, {
      description: \`I found permissions for \${member}.\`,
      fields: [{ name: 'Permissions', value: perms.join(', ').slice(0, 1024) || 'None' }]
    });`
));

write('src/commands.js/moderation/say.js', `
const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'say',
  aliases: ['speak'],
  category: 'moderation',
  description: 'Makes me send a plain message.',
  usage: 'say <message>',
  permissions: [PermissionFlagsBits.ManageMessages],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need a message to say.');
    await message.delete().catch(() => null);
    return message.channel.send({ content: text, allowedMentions: { parse: [] } });
  }
};
`);

write('src/commands.js/moderation/announce.js', `
const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'announce',
  aliases: ['announcement'],
  category: 'moderation',
  description: 'Sends a clean announcement embed.',
  usage: 'announce <message>',
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need announcement text.');
    return respond.reply(message, 'list', null, { description: text, allowedMentions: { parse: [] } });
  }
};
`);

write('src/commands.js/moderation/setnick.js', `
const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'setnick',
  aliases: ['setnickname'],
  category: 'moderation',
  description: 'Sets a member nickname.',
  usage: 'setnick @user <nickname>',
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],

  async execute({ message, args }) {
    const member = message.mentions.members.first();
    if (!member) return respond.reply(message, 'info', 'need a member mention.');
    const nick = args.slice(1).join(' ').trim();
    if (!nick) return respond.reply(message, 'info', 'need a nickname.');
    await member.setNickname(nick, \`Changed by \${message.author.tag}\`);
    return respond.reply(message, 'good', \`changed \${member}'s nickname.\`);
  }
};
`);

write('src/commands.js/moderation/clearnick.js', `
const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'clearnick',
  aliases: ['resetnick'],
  category: 'moderation',
  description: 'Clears a member nickname.',
  usage: 'clearnick @user',
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],

  async execute({ message }) {
    const member = message.mentions.members.first();
    if (!member) return respond.reply(message, 'info', 'need a member mention.');
    await member.setNickname(null, \`Cleared by \${message.author.tag}\`);
    return respond.reply(message, 'good', \`cleared \${member}'s nickname.\`);
  }
};
`);

write('src/commands.js/fun/rate.js', basic(
  'rate',
  ['rateit'],
  'fun',
  'Rates something from 0 to 100.',
  'rate <thing>',
  `    const thing = args.join(' ').trim();
    if (!thing) return respond.reply(message, 'info', 'need something to rate.');
    const score = Math.floor(Math.random() * 101);
    return respond.reply(message, 'info', \`rate **\${thing}** a **\${score}/100**.\`);`
));

write('src/commands.js/fun/compliment.js', basic(
  'compliment',
  ['nice'],
  'fun',
  'Gives a compliment.',
  'compliment [user]',
  `    const target = message.mentions.users.first() || message.author;
    const lines = ['you have elite energy.', 'your server presence is immaculate.', 'you are built different.', 'you are genuinely cool.'];
    return respond.reply(message, 'good', \`think \${target} \${lines[Math.floor(Math.random() * lines.length)]}\`);`
));

write('src/commands.js/fun/roastlite.js', basic(
  'roastlite',
  ['softroast'],
  'fun',
  'Gives a harmless roast.',
  'roastlite [user]',
  `    const target = message.mentions.users.first() || message.author;
    const lines = ['your Wi-Fi has more stability than your decisions.', 'you lag in real life.', 'your typing speed needs a loading screen.', 'your aura is buffering.'];
    return respond.reply(message, 'alert', \`think \${target} \${lines[Math.floor(Math.random() * lines.length)]}\`);`
));

write('src/commands.js/fun/coinrace.js', basic(
  'coinrace',
  ['racecoin'],
  'fun',
  'Runs a tiny coin race.',
  'coinrace',
  `    const winner = Math.random() > 0.5 ? 'heads' : 'tails';
    return respond.reply(message, 'info', \`ran the race and **\${winner}** won.\`);`
));

write('src/commands.js/fun/luck.js', basic(
  'luck',
  ['luckscore'],
  'fun',
  'Shows your luck score.',
  'luck',
  `    return respond.reply(message, 'info', \`think your luck is **\${Math.floor(Math.random() * 101)}%** today.\`);`
));

write('src/commands.js/fun/vibe.js', basic(
  'vibe',
  ['vibecheck'],
  'fun',
  'Checks the vibe.',
  'vibe',
  `    const score = Math.floor(Math.random() * 101);
    const label = score > 75 ? 'immaculate' : score > 45 ? 'stable' : 'questionable';
    return respond.reply(message, 'info', \`checked the vibe: **\${score}%** — **\${label}**.\`);`
));

write('src/commands.js/fun/sus.js', basic(
  'sus',
  ['susscore'],
  'fun',
  'Shows a sus score.',
  'sus [user]',
  `    const target = message.mentions.users.first() || message.author;
    return respond.reply(message, 'alert', \`think \${target} is **\${Math.floor(Math.random() * 101)}%** sus.\`);`
));

console.log('installed next 30+ Ohara commands');