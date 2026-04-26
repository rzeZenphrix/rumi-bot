const respond = require('../../utils/respond');

module.exports = {
  name: 'ping',
  aliases: ['pong'],
  description: 'Check bot latency.',
  usage: 'ping',

  async execute({ message }) {
    await respond.reply(
      message,
      'good',
      `I am online. My API latency is \`${message.client.ws.ping}ms\`.`
    );
  }
};
