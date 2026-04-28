(async () => {
	require('dotenv').config();

	const { Client, GatewayIntentBits } = require('discord.js');
	const logger = require('./systems/logging/logger');
	const { getSlashCommandData } = require('./systems/slashCommands');

	const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '';
	if (!token) {
		throw new Error('Missing DISCORD_TOKEN or BOT_TOKEN in .env.');
	}

	const client = new Client({ intents: [GatewayIntentBits.Guilds] });
	await client.login(token);

	const commands = getSlashCommandData();
	const guildId = String(process.env.SLASH_COMMAND_GUILD_ID || process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || '').trim();

	if (guildId) {
		const guild = await client.guilds.fetch(guildId);
		await guild.commands.set(commands);
		console.log(`[rumi] deployed ${commands.length} slash commands to guild ${guildId}`);
	} else {
		await client.application.commands.set(commands);
		console.log(`[rumi] deployed ${commands.length} global slash commands`);
	}

	logger.info({ commands: commands.map((command) => command.name), guildId: guildId || null }, 'Slash commands deployed');
	await client.destroy();
})().catch((error) => {
	console.error('[rumi] failed to deploy slash commands:', error);
	process.exitCode = 1;
});
