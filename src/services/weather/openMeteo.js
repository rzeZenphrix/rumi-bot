async function geocodeLocation(query) {
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`)
    .then((res) => res.json())
    .catch(() => null);
  return response?.results?.[0] || null;
}

async function getCurrentWeather(location) {
  return fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`
  ).then((res) => res.json()).catch(() => null);
}

async function getForecast(location) {
  return fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m&forecast_days=5&timezone=auto`
  ).then((res) => res.json()).catch(() => null);
}

module.exports = {
  geocodeLocation,
  getCurrentWeather,
  getForecast
};
