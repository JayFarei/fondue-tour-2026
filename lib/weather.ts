export type WeatherLocation = { lat: number; lon: number };
export type Forecast = {
  timezone: string;
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    weather_code: (number | null)[];
    precipitation_probability: (number | null)[];
    precipitation?: (number | null)[];
  };
  daily: {
    time: string[];
    temperature_2m_min: (number | null)[];
    temperature_2m_max: (number | null)[];
    weather_code: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
  };
};
export const weatherKey = ({ lat, lon }: WeatherLocation) => `${lat},${lon}`;
export const routeDate = (day: string) =>
  `2026-09-${day.match(/\d{2}/)?.[0] ?? '08'}`;
export const weatherDescription = (code: number | null | undefined) => {
  if (code == null) return 'Conditions unavailable';
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([56, 57, 66, 67].includes(code)) return 'Freezing rain / drizzle';
  if ([61, 63, 65].includes(code)) return 'Rain';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([85, 86].includes(code)) return 'Snow showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return 'Conditions unavailable';
};

export function forecastAt(forecast: Forecast, date: string, time?: string) {
  const dayIndex = forecast.daily.time.indexOf(date);
  if (dayIndex < 0) return null;
  const low = forecast.daily.temperature_2m_min[dayIndex];
  const high = forecast.daily.temperature_2m_max[dayIndex];
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    // Round the roadbook's local arrival to the nearest model hour, including midnight rollover.
    const target = new Date(`${date}T${time}:00Z`);
    target.setUTCMinutes(Math.round(target.getUTCMinutes() / 60) * 60, 0, 0);
    const hour = target.toISOString().slice(0, 16);
    const index = forecast.hourly.time.indexOf(hour);
    if (index >= 0 && forecast.hourly.temperature_2m[index] != null) {
      return {
        temperature: forecast.hourly.temperature_2m[index],
        low,
        high,
        code: forecast.hourly.weather_code[index],
        rain: forecast.hourly.precipitation_probability[index],
        precipitation: forecast.hourly.precipitation?.[index] ?? null,
        hour: hour.slice(11),
      };
    }
  }
  if (low == null || high == null) return null;
  return {
    temperature: null,
    low,
    high,
    code: forecast.daily.weather_code[dayIndex],
    rain: forecast.daily.precipitation_probability_max?.[dayIndex] ?? null,
    precipitation: forecast.daily.precipitation_sum?.[dayIndex] ?? null,
    hour: null,
  };
}

export function forecastUrl(locations: WeatherLocation[], date: string) {
  return `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
    latitude: locations.map((p) => p.lat).join(','),
    longitude: locations.map((p) => p.lon).join(','),
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation',
    daily: 'temperature_2m_min,temperature_2m_max,weather_code,precipitation_probability_max,precipitation_sum',
    precipitation_unit: 'mm',
    temperature_unit: 'celsius',
    timezone: 'auto',
    start_date: date,
    end_date: date,
  })}`;
}

export const extraWeatherLocations = {
  bellinzona: { lat: 46.195, lon: 9.029 },
  malpensa: { lat: 45.63, lon: 8.723 },
  gatwick: { lat: 51.1537, lon: -0.1821 },
};
