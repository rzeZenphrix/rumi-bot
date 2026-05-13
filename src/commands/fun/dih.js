const respond = require('../../utils/respond');

function randomLength() {
  return (0.1 + Math.random() * 13.9).toFixed(1);
}

module.exports = {
  name: 'dih',
  aliases: [],
  category: 'fun',
  description: 'Give a random dih length from 0.1 to 14 inches.',
  usage: 'dih [user]',
  examples: ['dih', 'dih @user'],
  cooldown: 3,
  nsfw: true,

  async execute({ message, args }) {
    const target = args.join(' ').trim() || message.author.toString();
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `${target} has a dih length of **${randomLength()} inches**.`
    });
  }
};
