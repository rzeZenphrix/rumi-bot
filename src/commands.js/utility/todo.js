const respond = require('../../utils/respond');
const db = require('../../services/database');

module.exports = {
  name: 'todo',
  aliases: ['task', 'tasks'],
  category: 'utility',
  description: 'I manage your Supabase-backed todo list.',
  usage: 'todo <add|list|complete|remove> ...',
  examples: ['todo add finish logs command', 'todo list', 'todo complete <id>'],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'add') {
      const task = args.join(' ').trim();
      if (!task) return respond.reply(message, 'info', 'Use `todo add <task>`.');
      const row = await db.addTodo({ user_id: message.author.id, guild_id: message.guild?.id || null, task });
      return respond.reply(message, 'good', `I added that todo: \`${row.id}\`.`);
    }

    if (sub === 'list') {
      const rows = await db.listTodos(message.author.id, args.includes('--done'));
      const lines = rows.map((row, index) => `${index + 1}. ${row.completed ? '✅' : '⬜'} **${row.task}**\n\`${row.id}\``);
      return respond.reply(message, 'info', lines.length ? `I found your todos:\n${lines.join('\n')}` : 'I could not find any todos for you.');
    }

    if (sub === 'complete' || sub === 'done') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `todo complete <id>`.');
      await db.completeTodo(message.author.id, id);
      return respond.reply(message, 'good', 'I marked that todo complete.');
    }

    if (sub === 'remove' || sub === 'delete') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `todo remove <id>`.');
      await db.deleteTodo(message.author.id, id);
      return respond.reply(message, 'good', 'I removed that todo.');
    }

    return respond.reply(message, 'info', 'Use `todo add`, `todo list`, `todo complete`, or `todo remove`.');
  }
};
