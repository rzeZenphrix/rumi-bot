const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const {
  cleanup,
  convertToMp4,
  mediaTempDir,
  parseTime,
  resolveInputFile,
  takeFlag
} = require('../../systems/media/videoTools');

module.exports = {
  name: 'mp4',
  aliases: ['downloadmp4', 'video', 'viddl'],
  category: 'media',
  description: 'Convert a supported video link or attachment into a downloadable MP4.',
  usage: 'mp4 <video URL or attachment> [--start 0s] [--duration 30s]',
  examples: [
    'mp4 <attachment>',
    'mp4 https://example.com/video.mov',
    'mp4 https://pin.it/... --duration 20s',
    'mp4 https://youtube.com/watch?v=... --start 10s --duration 30s'
  ],
  flags: [
    { name: '--start <time>', description: 'Start offset (e.g., 10s).' },
    { name: '--duration <time>', description: 'Clip length (e.g., 30s).' }
  ],
  guildOnly: true,
  typing: true,
  cooldown: 15,

  async execute({ message, args }) {
    const copy = [...args];
    const start = parseTime(takeFlag(copy, ['--start', '-s']), 0);
    const duration = parseTime(takeFlag(copy, ['--duration', '--dur', '-d']), 0);

    const dir = mediaTempDir();
    const notice = await respond.reply(message, 'info', 'Processing MP4...', {
      mentionUser: false
    });

    try {
      const input = await resolveInputFile(message, copy, dir);
      const output = path.join(dir, `rumi-${Date.now()}.mp4`);

      await convertToMp4(input, output, {
        start,
        duration
      });

      await message.channel.send({
        files: [
          new AttachmentBuilder(output, {
            name: `rumi-video-${Date.now()}.mp4`
          })
        ],
        allowedMentions: { parse: [] }
      });

      if (notice?.deletable) {
        await notice.delete().catch(() => null);
      }

      return null;
    } catch (error) {
      return respond.reply(message, 'bad', error.message || 'Could not create MP4.', {
        mentionUser: false
      });
    } finally {
      cleanup(dir);
    }
  }
};