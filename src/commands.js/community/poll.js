const { PermissionFlagsBits }=require('discord.js'); const respond=require('../../utils/respond');
const letters=['🇦','🇧','🇨','🇩','🇪','🇫','🇬','🇭','🇮','🇯'];
module.exports={
    name:'poll',
    aliases:[],
    category:'community',
    description:'Create simple reaction polls.',
    usage:'poll create question | option 1 | option 2',
    examples:['poll create Best color? | red | blue'],
    guildOnly:true,botPermissions:[PermissionFlagsBits.AddReactions],
    
    async execute({message,args}){const sub=(args[0]||'create').toLowerCase(); 

        if(sub==='create')args.shift(); const raw=args.join(' '); 

        const parts=raw.split('|').map(x=>x.trim()).filter(Boolean); 

        if(parts.length<2)return respond.reply(message,'info','use `poll create question | option 1 | option 2`.'); 

        const question=parts.shift(); const opts=parts.slice(0,10); 
        
        const sent=await respond.reply(message,'',null,{description:`\n${question}\n\n${opts.map((o,i)=>`${letters[i]} ${o}`).join('\n')}`}); for(let i=0;i<opts.length;i++)await sent.react(letters[i]).catch(()=>null);}};
