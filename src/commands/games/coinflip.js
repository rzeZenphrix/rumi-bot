const respond=require('../../utils/respond');
module.exports={name:'coinflip',aliases:['coin','flip'],category:'fun',description:'I flip a coin.',usage:'coinflip',examples:['coinflip'],async execute({message}){return respond.reply(message,'info',null,{description:`🪙 **Coin flip**\n${Math.random()<0.5?'Heads':'Tails'}`});}};
