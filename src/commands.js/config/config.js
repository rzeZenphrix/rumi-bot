const { PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');

function safeJson(text){ try{return JSON.parse(text)}catch{return null} }

module.exports = {
  name:'config', aliases:['cfg'], category:'config', guildOnly:true,
  description:'View, set, reset, import, export, and backup server config.',
  usage:'config <view|set|reset|export|import|backup|restore|profile>',
  examples:['config view','config set welcome.channel 123','config export','config profile save default'],
  permissions:[PermissionFlagsBits.ManageGuild], typing:true,
  async execute({message,args}){
    const sub=(args.shift()||'view').toLowerCase();
    const guildId=message.guild.id;
    const settings=await db.getGuildSettings(guildId);
    const current=settings.settings_json || {};
    if(sub==='view') return respond.reply(message,'info',null,{description:`**Server config**\n**Prefix:** \`${settings.prefix}\`\n**Automod:** \`${settings.automod_enabled?'on':'off'}\`\n**Jail:** \`${settings.jail_enabled?'on':'off'}\`\n**Keys:** ${Object.keys(current).length?Object.keys(current).map(k=>`\`${k}\``).join(', '):'none'}`});
    if(sub==='set'){
      const key=args.shift(); const value=args.join(' ');
      if(!key||!value) return respond.reply(message,'info','use `config set <key> <value>`.');
      current[key]=value;
      await db.updateGuildSettings(guildId,{settings_json:current});
      return respond.reply(message,'good',`set \`${key}\` to \`${value}\`.`);
    }
    if(sub==='reset'){
      await db.updateGuildSettings(guildId,{settings_json:{}});
      return respond.reply(message,'good','reset this server configuration.');
    }
    if(sub==='export'){
      const file=new AttachmentBuilder(Buffer.from(JSON.stringify({guild_id:guildId,prefix:settings.prefix,settings_json:current},null,2)),{name:`${guildId}-config.json`});
      return message.channel.send({files:[file],allowedMentions:{parse:[]}});
    }
    if(sub==='import'){
      const raw=args.join(' ').trim(); const json=raw?safeJson(raw):null;
      if(!json) return respond.reply(message,'info','paste a valid JSON object after `config import`.');
      await db.updateGuildSettings(guildId,{settings_json:json.settings_json || json});
      return respond.reply(message,'good','imported that configuration.');
    }
    if(sub==='backup'){
      const id=`backup:${Date.now()}`; await db.setKv(`guild:${guildId}:configBackups`,id,{prefix:settings.prefix,settings_json:current,createdBy:message.author.id});
      return respond.reply(message,'good',`created config backup \`${id}\`.`);
    }
    if(sub==='restore'){
      const id=args.shift(); if(!id) return respond.reply(message,'info','use `config restore <backupId>`.');
      const backup=await db.getKv(`guild:${guildId}:configBackups`,id,null); if(!backup) return respond.reply(message,'bad','I could not find that backup.');
      await db.updateGuildSettings(guildId,{prefix:backup.prefix || settings.prefix,settings_json:backup.settings_json || {}});
      return respond.reply(message,'good',`restored backup \`${id}\`.`);
    }
    if(sub==='profile'){
      const action=(args.shift()||'list').toLowerCase();
      if(action==='save'){const name=args.shift(); if(!name)return respond.reply(message,'info','use `config profile save <name>`.'); await db.setKv(`guild:${guildId}:configProfiles`,name,{prefix:settings.prefix,settings_json:current}); return respond.reply(message,'good',`saved profile \`${name}\`.`)}
      if(action==='load'){const name=args.shift(); if(!name)return respond.reply(message,'info','use `config profile load <name>`.'); const p=await db.getKv(`guild:${guildId}:configProfiles`,name,null); if(!p)return respond.reply(message,'bad','I could not find that profile.'); await db.updateGuildSettings(guildId,{prefix:p.prefix||settings.prefix,settings_json:p.settings_json||{}}); return respond.reply(message,'good',`loaded profile \`${name}\`.`)}
      if(action==='delete'){const name=args.shift(); if(!name)return respond.reply(message,'info','use `config profile delete <name>`.'); await db.deleteKv(`guild:${guildId}:configProfiles`,name); return respond.reply(message,'good',`deleted profile \`${name}\`.`)}
      const rows=await db.listKv(`guild:${guildId}:configProfiles`,25); return respond.reply(message,'info',null,{description:`📁 **Config profiles**\n${rows.length?rows.map(r=>`• \`${r.key}\``).join('\n'):'I do not have any profiles saved yet.'}`});
    }
    return respond.reply(message,'info','I support `view`, `set`, `reset`, `export`, `import`, `backup`, `restore`, and `profile`.');
  }
};
