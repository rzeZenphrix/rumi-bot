const respond = require('../../utils/respond');
const { geocodeLocation, getForecast } = require('../../services/weather/openMeteo');

function weatherCodeLabel(code) {
  const map = {
    0: 'Clear',
    1: 'Mostly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Freezing fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    80: 'Rain showers',
    81: 'Heavy showers',
    82: 'Violent showers',
    95: 'Thunderstorm'
  };

  return map[Number(code)] || 'Unknown';
}

module.exports = {
  name: 'forecast',
  aliases: ['weatherforecast'],
  category: 'utility',
  description: 'Show a 5-day weather forecast for a location.',
  usage: 'forecast <city>',
  examples: ['forecast London', 'forecast Tokyo'],
  typing: true,

  async execute({ message, args }) {
    const city = args.join(' ').trim();
    if (!city) return respond.reply(message, 'info', 'Send a city name.');

    const loc = await geocodeLocation(city);
    if (!loc) return respond.reply(message, 'bad', 'I could not find that location.');

    const payload = await getForecast(loc);
    const days = payload?.daily?.time || [];
    if (!days.length) return respond.reply(message, 'bad', 'Forecast data is unavailable right now.');

    const lines = days.slice(0, 5).map((date, index) => {
      const high = payload.daily.temperature_2m_max?.[index];
      const low = payload.daily.temperature_2m_min?.[index];
      const rain = payload.daily.precipitation_probability_max?.[index];
      const code = payload.daily.weather_code?.[index];
      return `**${date}** - ${weatherCodeLabel(code)}\nHigh \`${high}C\` | Low \`${low}C\` | Rain \`${rain ?? 0}%\``;
    });

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: `Forecast for ${loc.name}, ${loc.country}`,
      description: lines.join('\n\n')
    });
  }
};
