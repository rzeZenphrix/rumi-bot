const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  StreamType
} = require('@discordjs/voice');

const { PermissionFlagsBits } = require('discord.js');
const { Readable } = require('stream');
const respond = require('../../utils/respond');

class SineWaveStream extends Readable {
  constructor(options = {}) {
    super();

    this.sampleRate = options.sampleRate || 48000;
    this.frequency = options.frequency || 440;
    this.durationMs = options.durationMs || 3500;
    this.totalSamples = Math.floor((this.sampleRate * this.durationMs) / 1000);
    this.index = 0;
  }

  _read() {
    const samplesPerChunk = 960;
    const remaining = this.totalSamples - this.index;

    if (remaining <= 0) {
      this.push(null);
      return;
    }

    const samples = Math.min(samplesPerChunk, remaining);
    const buffer = Buffer.alloc(samples * 4);

    for (let i = 0; i < samples; i += 1) {
      const t = (this.index + i) / this.sampleRate;
      const wave = Math.sin(2 * Math.PI * this.frequency * t);

      // Quiet beep so it does not blast ears.
      const value = Math.floor(wave * 0.18 * 32767);

      // Stereo 16-bit little-endian PCM.
      buffer.writeInt16LE(value, i * 4);
      buffer.writeInt16LE(value, i * 4 + 2);
    }

    this.index += samples;
    this.push(buffer);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  name: 'audiotest',
  aliases: ['beep', 'voicetest', 'vctest'],
  category: 'music',
  description: 'Test Discord voice audio with a generated beep.',
  usage: 'audiotest',
  examples: ['audiotest'],
  guildOnly: true,
  cooldown: 8,

  async execute({ message }) {
    const voiceChannel = message.member?.voice?.channel;

    if (!voiceChannel) {
      return respond.reply(message, 'info', 'Join a voice channel first.');
    }

    const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    const perms = me ? voiceChannel.permissionsFor(me) : null;

    if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.Speak)) {
      return respond.reply(message, 'bad', 'I need Connect and Speak permissions in your voice channel.');
    }

    let connection;
    let player;

    try {
      await respond.reply(message, 'info', 'Running direct voice audio test. You should hear a short beep.');

      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 15000);

      player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play
        }
      });

      const resource = createAudioResource(
        new SineWaveStream({
          frequency: 523.25,
          durationMs: 3500
        }),
        {
          inputType: StreamType.Raw
        }
      );

      connection.subscribe(player);
      player.play(resource);

      await entersState(player, AudioPlayerStatus.Playing, 5000);

      await Promise.race([
        entersState(player, AudioPlayerStatus.Idle, 8000).catch(() => null),
        wait(8000)
      ]);

      connection.destroy();

      return respond.reply(message, 'good', 'Audio test finished.');
    } catch (error) {
      if (connection) connection.destroy();

      return respond.reply(
        message,
        'bad',
        `Voice audio test failed: ${error.message || 'unknown error'}`
      );
    }
  }
};