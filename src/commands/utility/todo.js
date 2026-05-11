const respond = require('../../utils/respond');
const emojis = require('../../utils/botEmojis');
const db = require('../../services/database');
const { createPagedMessage } = require('../../utils/pagedMessages');

async function fetchTodo(userId, id) {
  const { data } = await db.supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

async function updateTodo(userId, id, patch) {
  const { data } = await db.supabase
    .from('todos')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .maybeSingle();
  return data || null;
}

module.exports = {
  name: 'todo',
  aliases: ['task', 'tasks'],
  category: 'utility',
  description: 'Manage your todo list with paging and edit controls.',
  usage: 'todo <add|list|view|complete|reopen|edit|remove|clear> ...',
  examples: ['todo add finish logs command', 'todo list', 'todo edit <id> new text'],
  flags: [
    { name: '--done', description: 'Include completed items when listing todos.' }
  ],
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
      if (!rows.length) return respond.reply(message, 'info', 'I could not find any todos for you.');

      const pages = [];
      for (let index = 0; index < rows.length; index += 6) {
        const chunk = rows.slice(index, index + 6);
        pages.push({
          title: 'Todo list',
          allowTitle: true,
          description: chunk
            .map((row, rowIndex) => `**${index + rowIndex + 1}.** ${row.completed ? emojis.good : emojis.info} ${row.task}\n\`${row.id}\``)
            .join('\n\n')
        });
      }

      const payload = createPagedMessage({
        prefix: 'todo',
        ownerId: message.author.id,
        guildId: message.guild?.id,
        type: 'info',
        pages
      });

      return respond.reply(message, 'info', null, payload);
    }

    if (sub === 'view') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `todo view <id>`.');
      const row = await fetchTodo(message.author.id, id);
      if (!row) return respond.reply(message, 'bad', 'I could not find that todo.');
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Todo item',
        allowTitle: true,
        description: row.task,
        fields: [
          { name: 'ID', value: row.id, inline: true },
          { name: 'Completed', value: row.completed ? 'yes' : 'no', inline: true },
          { name: 'Created', value: row.created_at || 'unknown', inline: false }
        ]
      });
    }

    if (sub === 'complete' || sub === 'done') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `todo complete <id>`.');
      await db.completeTodo(message.author.id, id);
      return respond.reply(message, 'good', 'I marked that todo complete.');
    }

    if (sub === 'reopen') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `todo reopen <id>`.');
      const row = await updateTodo(message.author.id, id, { completed: false });
      if (!row) return respond.reply(message, 'bad', 'I could not reopen that todo.');
      return respond.reply(message, 'good', 'I reopened that todo.');
    }

    if (sub === 'edit') {
      const id = args.shift();
      const task = args.join(' ').trim();
      if (!id || !task) return respond.reply(message, 'info', 'Use `todo edit <id> <new text>`.');
      const row = await updateTodo(message.author.id, id, { task });
      if (!row) return respond.reply(message, 'bad', 'I could not edit that todo.');
      return respond.reply(message, 'good', 'I updated that todo.');
    }

    if (sub === 'clear') {
      const { data } = await db.supabase
        .from('todos')
        .delete()
        .eq('user_id', message.author.id)
        .select();
      return respond.reply(message, 'good', `I cleared **${data?.length || 0}** todo item(s).`);
    }

    if (sub === 'remove' || sub === 'delete') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `todo remove <id>`.');
      await db.deleteTodo(message.author.id, id);
      return respond.reply(message, 'good', 'I removed that todo.');
    }

    return respond.reply(message, 'info', 'Use `todo add`, `todo list`, `todo view`, `todo complete`, `todo reopen`, `todo edit`, `todo remove`, or `todo clear`.');
  }
};
