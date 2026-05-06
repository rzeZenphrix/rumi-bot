const { createMusicCommand, parseMusicSettings, SETTINGS_HELP } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'musicsettings',
  aliases: ['msettings'],
  description: 'View or change server music settings.',
  usage: SETTINGS_HELP,
  examples: SETTINGS_HELP,
  help: 'Use one of these: ' + SETTINGS_HELP.map((line) => `\`${line}\``).join(', '),
  title: 'Music Settings',
  async build(args) {
    return parseMusicSettings(args);
  }
});
