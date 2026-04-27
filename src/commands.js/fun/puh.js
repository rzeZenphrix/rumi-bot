const respond = require('../../utils/respond');

function randomWidth() {
  return (2.5 + Math.random() * 16.5).toFixed(1);
}

module.exports = {
  name: 'puh',
  aliases: [],
  category: 'fun',
  description: 'Give a random puh width from 2.5 to 19 inches.',
  usage: 'puh [user]',
  examples: ['puh', 'puh @user'],
  cooldown: 3,

  async execute({ message, args }) {
    const target = args.join(' ').trim() || message.author.toString();
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `${target} has a puh width of **${randomWidth()} inches**.`
    });
  }
};
