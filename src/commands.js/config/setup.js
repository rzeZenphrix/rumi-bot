const { PermissionFlagsBits, ChannelType } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
module.exports = {
  name:'setup', aliases:['quicksetup'], category:'config', guildOnly:true,
  description:'I run quick setup modules for logging, automod, welcome, anti-raid, anti-nuke, tickets, roles, levels, suggestions, and starboard.',
  usage:'setup <logging|automod|moderation|welcome|verification|antiraid|antinuke|tickets|roles|levels|suggestions|starboard|all>',
  examples:['setup logging','setup automod','setup all'], permissions:[PermissionFlagsBits.ManageGuild], typing:true,
  async execute({message,args}){
    const module=(args.shift()||'view').toLowerCase();
    const guild=message.guild;
    const settings=(await db.getGuildSettings(guild.id)).settings_json || {};
    async function ensureChannel(name){
      let ch=guild.channels.cache.find(c=>c.name===name && c.type===ChannelType.GuildText);
      if(!ch) ch=await guild.channels.create({name,type:ChannelType.GuildText,reason:`Rumi setup by ${message.author.tag}`}).catch(()=>null);
      return ch;
    }
    const done=[];
    if(['logging','all'].includes(module)){ const ch=await ensureChannel('rumi-logs'); settings.logging={enabled:true,channelId:ch?.id}; done.push(`logging ${ch?`<#${ch.id}>`:'configured'}`); }
    if(['automod','all'].includes(module)){ settings.automod={enabled:true,mentions:8,links:4,spam:4}; await db.updateGuildSettings(guild.id,{automod_enabled:true}); done.push('automod defaults'); }
    if(['moderation','all'].includes(module)){ settings.moderation={cases:true,dmUsers:false}; done.push('moderation defaults'); }
    if(['welcome','all'].includes(module)){ const ch=await ensureChannel('welcome'); settings.welcome={enabled:true,channelId:ch?.id,message:'Welcome {user.mention} to {server.name}!'}; done.push(`welcome ${ch?`<#${ch.id}>`:''}`); }
    if(['verification','all'].includes(module)){ settings.verification={enabled:true,method:'button'}; done.push('verification defaults'); }
    if(['antiraid','anti-raid','all'].includes(module)){ settings.antiraid={enabled:true,mode:'normal'}; done.push('anti-raid defaults'); }
    if(['antinuke','anti-nuke','all'].includes(module)){ settings.antinuke={enabled:true,punishment:'strip'}; done.push('anti-nuke defaults'); }
    if(['tickets','all'].includes(module)){ const ch=await ensureChannel('ticket-panel'); settings.tickets={enabled:true,panelChannelId:ch?.id}; done.push('ticket defaults'); }
    if(['roles','all'].includes(module)){ settings.roles={menus:[]}; done.push('role defaults'); }
    if(['levels','all'].includes(module)){ settings.levels={enabled:true,multiplier:1}; done.push('level defaults'); }
    if(['suggestions','all'].includes(module)){ const ch=await ensureChannel('suggestions'); settings.suggestions={enabled:true,channelId:ch?.id}; done.push('suggestions defaults'); }
    if(['starboard','all'].includes(module)){ const ch=await ensureChannel('starboard'); settings.starboard={enabled:true,channelId:ch?.id,threshold:3}; done.push('starboard defaults'); }
    if(!done.length) return respond.reply(message,'info','choose a setup module: logging, automod, moderation, welcome, verification, antiraid, antinuke, tickets, roles, levels, suggestions, starboard, or all.');
    await db.updateGuildSettings(guild.id,{settings_json:settings});
    return respond.reply(message,'good',null,{description:`✅ **Setup complete**\nI configured: ${done.map(x=>`\`${x}\``).join(', ')}.`});
  }
};
