const { AttachmentBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const { geocodeLocation, getCurrentWeather, getForecast } = require('../../services/weather/openMeteo');
const { weatherCodeLabel, buildWeatherCard } = require('../../services/weather/weatherCard');

function fmt(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';

  return `${Math.round(number)}${suffix}`;
}

module.exports = {
  name: 'weather',
  aliases: ['w'],
  category: 'utility',
  description: 'Show current weather with a generated visual weather card.',
  usage: 'weather <city>',
  examples: [
    'weather London',
    'weather Belfast',
    'weather Nairobi'
  ],
  typing: true,

  async execute({ message, args }) {
    const city = args.join(' ').trim();

    if (!city) {
      return respond.reply(message, 'info', 'Use `weather <city>`.');
    }

    const loc = await geocodeLocation(city);

    if (!loc) {
      return respond.reply(message, 'bad', 'I could not find that location.');
    }

    const [payload, forecast] = await Promise.all([
      getCurrentWeather(loc),
      getForecast(loc)
    ]);

    const current = payload?.current;

    if (!current) {
      return respond.reply(message, 'bad', 'Weather data is unavailable right now.');
    }

    const [condition, emoji] = weatherCodeLabel(current.weather_code);
    const place = [loc.name, loc.admin1, loc.country].filter(Boolean).join(', ');

    let files = [];
    let image = null;

    const card = await buildWeatherCard({
      location: loc,
      current,
      forecast,
      timezone: payload.timezone
    }).catch(() => null);

    if (card) {
      files = [
        new AttachmentBuilder(card, {
          name: 'weather-card.png'
        })
      ];

      image = 'attachment://weather-card.png';
    }

    return respond.reply(message, 'info', null, {
      title: `${emoji} Weather | ${place}`,
      allowTitle: true,
      mentionUser: false,
      description: [
        `**${condition}**`,
        `Temperature: **${fmt(current.temperature_2m, '°C')}**`,
        `Feels like: **${fmt(current.apparent_temperature, '°C')}**`,
        `Humidity: **${fmt(current.relative_humidity_2m, '%')}**`,
        `Wind speed: **${fmt(current.wind_speed_10m, ' km/h')}**`,
        `Timezone: \`${payload.timezone || 'auto'}\``
      ].join('\n'),
      fields: [
        {
          name: 'Today high',
          value: fmt(forecast?.daily?.temperature_2m_max?.[0], '°C'),
          inline: true
        },
        {
          name: 'Today low',
          value: fmt(forecast?.daily?.temperature_2m_min?.[0], '°C'),
          inline: true
        },
        {
          name: 'Rain chance',
          value: fmt(forecast?.daily?.precipitation_probability_max?.[0], '%'),
          inline: true
        }
      ],
      image,
      files,
    });
  }
};