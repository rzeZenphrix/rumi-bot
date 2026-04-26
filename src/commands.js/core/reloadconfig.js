const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
module.exports = { name:'reloadconfig', aliases:['rlconfig','configreload'], category:'core', description:'I reload this server configuration from Supabase.', usage:'reloadconfig', examples:['reloadconfig'], guildOnly:true, permissions:[PermissionFlagsBits.ManageGuild], typing:true, async execute({message}){ await db.getGuildSettings(message.guild.id); return respond.reply(message,'good','reloaded this server configuration from Supabase.'); }};
