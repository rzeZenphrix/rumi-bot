const respond = require('../../utils/respond');
function fmt(ms){const s=Math.floor(ms/1000); const d=Math.floor(s/86400); const h=Math.floor((s%86400)/3600); const m=Math.floor((s%3600)/60); const sec=s%60; return `${d}d ${h}h ${m}m ${sec}s`;}
module.exports = { name:'uptime', aliases:['up'], category:'core', description:'I show how long I have been online.', usage:'uptime', examples:['uptime'], async execute({message}){ return respond.reply(message,'info',null,{description:`⏱️ **Uptime**\nI have been online for \`${fmt(process.uptime()*1000)}\`.`}); } };
