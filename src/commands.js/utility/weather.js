const respond = require('../../utils/respond');
const { geocodeLocation, getCurrentWeather } = require('../../services/weather/openMeteo');

module.exports = {
  name: 'weather',
  aliases: [],
  category: 'utility',
  description: 'I fetch current weather using Open-Meteo.',
  usage: 'weather <city>',
  examples: ['weather London'],
  typing: true,

  async execute({ message, args }) {
    const city = args.join(' ').trim();
    if (!city) return respond.reply(message, 'info', 'Send a city name.');

    const loc = await geocodeLocation(city);
    if (!loc) return respond.reply(message, 'bad', 'I could not find that location.');

    const payload = await getCurrentWeather(loc);
    const current = payload?.current;
    if (!current) return respond.reply(message, 'bad', 'Weather data is unavailable right now.');

    return respond.reply(message, 'info', null, {
      description: `**Weather: ${loc.name}, ${loc.country}**\n**Temperature:** \`${current.temperature_2m}°C\`\n**Humidity:** \`${current.relative_humidity_2m}%\`\n**Wind:** \`${current.wind_speed_10m} km/h\`\n**Timezone:** \`${payload.timezone || 'auto'}\``,
      mentionUser: false
    });
  }
};
