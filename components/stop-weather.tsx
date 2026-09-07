'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { CloudSun, Sun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, CloudHail, CircleHelp } from 'lucide-react';
import plans from '@/data/tour-routes.json';
import {
  extraWeatherLocations,
  forecastAt,
  forecastUrl,
  routeDate,
  weatherDescription,
  weatherKey,
  type Forecast,
  type WeatherLocation,
} from '@/lib/weather';

type WeatherState = {
  data: Record<string, Forecast>;
  fetchedAt: string | null;
  loading: boolean;
  failed: boolean;
  refresh: () => void;
};
const WeatherContext = createContext<WeatherState>({
  data: {},
  fetchedAt: null,
  loading: true,
  failed: false,
  refresh: () => {},
});
const dateLocations = new Map<string, Map<string, WeatherLocation>>();
for (const plan of [
  ...plans,
  { day: 'Sun 13', stops: [extraWeatherLocations.bellinzona] },
  { day: 'Thu 17', stops: Object.values(extraWeatherLocations) },
]) {
  const date = routeDate(plan.day);
  const locations = dateLocations.get(date) ?? new Map();
  plan.stops.forEach((p) => locations.set(weatherKey(p), p));
  dateLocations.set(date, locations);
}
const cacheKey = 'fondue-weather-v2';

export const useWeather = () => useContext(WeatherContext);

export function conditionIcon(code: number | null | undefined) {
  if (code === 0 || code === 1) return { Icon: Sun, tone: 'sun' };
  if (code === 2) return { Icon: CloudSun, tone: 'sun' };
  if (code === 3) return { Icon: Cloud, tone: 'cloud' };
  if (code === 45 || code === 48) return { Icon: CloudFog, tone: 'cloud' };
  if ([51, 53, 55].includes(code ?? -1)) return { Icon: CloudDrizzle, tone: 'rain' };
  if ([56, 57, 66, 67].includes(code ?? -1)) return { Icon: CloudHail, tone: 'rain' };
  if ([61, 63, 65, 80, 81, 82].includes(code ?? -1)) return { Icon: CloudRain, tone: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return { Icon: CloudSnow, tone: 'rain' };
  if ([95, 96, 99].includes(code ?? -1)) return { Icon: CloudLightning, tone: 'storm' };
  return { Icon: CircleHelp, tone: 'cloud' };
}

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<WeatherState, 'refresh'>>({
    data: {},
    fetchedAt: null,
    loading: true,
    failed: false,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setState((s) => ({ ...s, loading: true, failed: false }));
    async function load() {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Zurich',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const requests = [...dateLocations].filter(
        ([date]) =>
          date >= today && Date.parse(date) - Date.parse(today) < 16 * 86400000,
      );
      if (!revision) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null');
          if (
            cached?.fetchedAt &&
            Date.now() - Date.parse(cached.fetchedAt) < 30 * 60 * 1000 &&
            requests.every(([date, locations]) =>
              [...locations.keys()].every((key) =>
                cached.data?.[`${date}/${key}`]?.daily?.time?.includes(date),
              ),
            )
          ) {
            setState({ ...cached, loading: false, failed: false });
            return;
          }
        } catch {
          /* Storage can be disabled; live forecasts still work. */
        }
      }
      const data: Record<string, Forecast> = {};
      let failures = 0;
      // Small batches keep requests below URL limits and isolate partial failures.
      for (const [date, keyedLocations] of requests) {
        const locations = [...keyedLocations.values()];
        for (let i = 0; i < locations.length; i += 15) {
          const batch = locations.slice(i, i + 15);
          try {
            const response = await fetch(forecastUrl(batch, date), {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(20000),
              ]),
            });
            if (!response.ok) throw new Error('Forecast unavailable');
            const body = await response.json();
            const forecasts = Array.isArray(body) ? body : [body];
            if (forecasts.length !== batch.length)
              throw new Error('Incomplete forecast response');
            forecasts.forEach((forecast: Forecast, index: number) => {
              if (
                !Array.isArray(forecast.hourly?.time) ||
                !Array.isArray(forecast.daily?.time)
              )
                throw new Error('Incomplete forecast');
              data[`${date}/${weatherKey(batch[index])}`] = forecast;
            });
          } catch {
            failures++;
          }
          if (disposed) return;
        }
      }
      if (!disposed) {
        const next = {
          data,
          fetchedAt: Object.keys(data).length ? new Date().toISOString() : null,
          loading: false,
          failed: failures > 0,
        };
        setState(next);
        if (!failures)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(next));
          } catch {
            /* Optional cache. */
          }
      }
    }
    void load();
    const timer = window.setInterval(
      () => setRevision((n) => n + 1),
      30 * 60 * 1000,
    );
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [revision]);
  return (
    <WeatherContext.Provider
      value={{ ...state, refresh: () => setRevision((n) => n + 1) }}
    >
      {children}
    </WeatherContext.Provider>
  );
}

export function WeatherStatus() {
  const { fetchedAt, loading, failed, refresh } = useContext(WeatherContext);
  return (
    <div className="weather-status text-sm leading-6 text-muted-foreground">
      <p>
        <CloudSun className="mr-2 inline size-4" />
        Forecasts for each travel date, in °C and local time (CEST on tour, BST
        at Gatwick). Timed stops use the nearest forecast hour; untimed stops
        show the daily low–high. Mountain conditions can change quickly.
      </p>
      <p className="mt-1">
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Weather: Open-Meteo
        </a>
        {' · '}
        {loading
          ? 'Loading forecasts…'
          : fetchedAt
            ? `Retrieved ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(new Date(fetchedAt))} CEST`
            : 'Forecast service unavailable'}
        {failed && fetchedAt ? ' · Some locations unavailable' : ''}
        {' · '}
        <button
          type="button"
          className="underline disabled:opacity-50"
          disabled={loading}
          onClick={refresh}
        >
          Refresh forecasts
        </button>
      </p>
    </div>
  );
}

export function StopWeather({
  location,
  date,
  time,
  area,
}: {
  location?: WeatherLocation;
  date: string;
  time?: string;
  area?: string;
}) {
  const { data, loading, fetchedAt } = useContext(WeatherContext);
  const forecast = location
    ? data[`${date}/${weatherKey(location)}`]
    : undefined;
  const at = forecast ? forecastAt(forecast, date, time) : null;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: forecast?.timezone ?? 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (date < today)
    return (
      <p className="stop-weather text-sm text-muted-foreground">
        {date.slice(8)} Sep · Travel date has passed
      </p>
    );
  if (!location)
    return (
      <p className="stop-weather text-sm text-muted-foreground">
        Forecast needs a confirmed stop
      </p>
    );
  if (!at)
    return (
      <p className="stop-weather text-sm text-muted-foreground">
        {loading
          ? 'Loading forecast…'
          : `Forecast unavailable for ${date.slice(8)} Sep`}
      </p>
    );
  const temperature =
    at.temperature == null
      ? `${Math.round(at.low!)}–${Math.round(at.high!)}°C`
      : `${Math.round(at.temperature)}°C`;
  const stale =
    fetchedAt && Date.now() - Date.parse(fetchedAt) > 60 * 60 * 1000;
  const { Icon, tone } = conditionIcon(at.code);
  return (
    <div
      className={`stop-weather weather-grid weather-tone-${tone}`}
      aria-label={`Forecast ${date}${area ? `, ${area}` : ''}`}
    >
      <Icon className="weather-condition-icon" aria-hidden="true" strokeWidth={1.7} />
      <strong className="weather-temperature">{temperature}</strong>
      <p className="weather-condition">{weatherDescription(at.code)}</p>
      <div className="weather-details">
        <p>{date.slice(8)} Sep · {at.hour ? `~${at.hour}` : 'daily low–high'}</p>
        {at.rain != null ? <p>{Math.round(at.rain)}% precip. chance{at.hour ? '' : ' · daily max'}</p> : null}
        {area ? <p>{area}</p> : null}
        {stale ? <p>Older forecast</p> : null}
      </div>
    </div>
  );
}
