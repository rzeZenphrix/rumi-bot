const respond=require('../../utils/respond');
function score(text){let h=0; for(const c of text)h=(h*31+c.charCodeAt(0))>>>0; return h%101;}
module.exports={name:'ship',aliases:['compatibility'],category:'fun',description:'I calculate deterministic compatibility.',usage:'ship <a> <b>',examples:['ship @a @b'],async execute({message,args}){if(args.length<2)return respond.reply(message,'info','give me two names or users.'); const pct=score(args.join('|')); return respond.reply(message,'info',null,{description:`💞 **Ship score**\n${args[0]} + ${args.slice(1).join(' ')} = **${pct}%**`});}};
