const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const {
  cleanup,
  convertVideoToGif,
  mediaTempDir,
  parseTime,
  resolveInputFile,
  takeFlag
} = require('../../systems/media/videoTools');

module.exports = {
  name: 'tg',
  aliases: ['togif', 'makegif', 'videogif'],
  category: 'media',
  description: 'Convert a short video clip, MP4, or supported link into a GIF.',
  usage: 'tg <video URL or attachment> [--start 0s] [--duration 6s] [--fps 12] [--width 480]',
  examples: [
    'tg <attachment>',
    'tg https://example.com/video.mp4',
    'tg https://pin.it/... --duration 5s',
    'tg https://youtube.com/watch?v=... --start 20s --duration 6s',
    'tg <attachment> --start 3s --duration 8s --fps 10 --width 420'
  ],
  flags: [
    { name: '--start <time>', description: 'Start offset (e.g., 10s).' },
    { name: '--duration <time>', description: 'Clip length (e.g., 6s).' },
    { name: '--fps <number>', description: 'Output frames per second.' },
    { name: '--width <px>', description: 'Output width in pixels.' }
  ],
  guildOnly: true,
  typing: true,
  cooldown: 15,

  async execute({ message, args }) {
    const copy = [...args];

    const start = parseTime(takeFlag(copy, ['--start', '-s']), 0);
    const duration = parseTime(takeFlag(copy, ['--duration', '--dur', '-d']), 6);
    const fps = Number(takeFlag(copy, ['--fps', '-f'], 12));
    const width = Number(takeFlag(copy, ['--width', '-w'], 480));

    const dir = mediaTempDir();
    const notice = await respond.reply(message, 'info', 'Creating GIF...', {
      mentionUser: false
    });

    try {
      const input = await resolveInputFile(message, copy, dir);
      const output = path.join(dir, `rumi-${Date.now()}.gif`);

      await convertVideoToGif(input, output, {
        start,
        duration,
        fps,
        width
      });

      await message.channel.send({
        files: [
          new AttachmentBuilder(output, {
            name: `rumi-gif-${Date.now()}.gif`
          })
        ],
        allowedMentions: { parse: [] }
      });

      if (notice?.deletable) {
        await notice.delete().catch(() => null);
      }

      return null;
    } catch (error) {
      return respond.reply(message, 'bad', error.message || 'Could not create GIF.', {
        mentionUser: false
      });
    } finally {
      cleanup(dir);
    }
  }
};