'use client';

// SVG has no native button/group elements; explicit roles make its markers keyboard accessible.
/* eslint-disable jsx-a11y/prefer-tag-over-role */

import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Droplets } from 'lucide-react';
import elevation from '@/data/tour-elevation.json';
import stops from '@/data/profile-stops.json';
import { conditionIcon, StopWeather, useWeather } from '@/components/stop-weather';
import { forecastAt, routeDate, weatherDescription, weatherKey } from '@/lib/weather';

const x = (km: number) => 12 + km / elevation.totalKm * 1176;
const degrees = (n: number) => `${Math.round(n)}°`;
const precipitationLabel = (reading: ReturnType<typeof forecastAt>) => reading
  ? `${reading.rain == null ? '—' : Math.round(reading.rain) + '%'} chance · ${reading.precipitation == null ? '— mm' : reading.precipitation.toFixed(1) + ' mm'}${reading.hour ? ' / hour' : ' / day'}`
  : 'Precipitation unavailable';

export function ProfileWeather({ children }: { children: ReactNode }) {
  const { data, loading, fetchedAt } = useWeather();
  const [selected, setSelected] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  function selectStop(index: number, reveal = false) {
    setSelected(index);
    if (reveal && track.current) {
      const item = track.current.querySelector<HTMLElement>(`[data-stop="${index}"]`);
      if (item) track.current.scrollTo({ left: item.offsetLeft - track.current.clientWidth / 2 + item.clientWidth / 2, behavior: 'smooth' });
    }
  }
  const readings = stops.map((stop) => {
    const date = routeDate(stop.day);
    const forecast = data[`${date}/${weatherKey(stop)}`];
    return forecast ? forecastAt(forecast, date, stop.time) : null;
  });
  const values = readings.flatMap((reading) => reading ? [reading.temperature, reading.low, reading.high].filter((v): v is number => v != null && Number.isFinite(v)) : []);
  const min = Math.floor(Math.min(0, ...values) / 5) * 5;
  const max = Math.max(min + 10, Math.ceil(Math.max(20, ...values) / 5) * 5);
  const y = (temp: number) => 158 - (temp - min) / (max - min) * 105;
  const ticks = Array.from({ length: (max - min) / 5 + 1 }, (_, i) => min + i * 5);
  const stop = stops[selected];
  const reading = readings[selected];
  const { Icon, tone } = conditionIcon(reading?.code);
  const temperature = reading?.temperature != null ? `${degrees(reading.temperature)}C` : reading?.low != null && reading.high != null ? `${degrees(reading.low)}–${degrees(reading.high)}C` : 'Temperature unavailable';
  const dayLabel = (day: string) => day.split(' · ')[0];

  return (
    <>
      <div className="profile-scroll">
        <div className="profile-frame">
          {children}
          <svg className="profile-svg weather-profile" viewBox="0 0 1200 188" role="group" aria-label="Stop-by-stop weather on the same distance scale as the elevation profile. Select a marker for temperature and conditions; all stops are also listed below.">
            <text x="12" y="25" className="weather-profile-heading">WEATHER ALONG THE ROUTE</text>
            <text x="1188" y="25" textAnchor="end" className="weather-profile-key">● nearest hour · │ daily low–high · °C</text>
            {ticks.map((temp) => <g key={temp}>
              <line x1="12" x2="1188" y1={y(temp)} y2={y(temp)} className="profile-grid" />
              <text x="1188" y={y(temp) - 4} textAnchor="end" className="profile-grid-label">{degrees(temp)}</text>
            </g>)}
            {elevation.legs.map((leg) => <line key={leg.id} x1={x(leg.endKm)} x2={x(leg.endKm)} y1="40" y2="166" className="profile-grid" />)}
            {readings.map((value, i) => {
              const point = stops[i];
              const cx = x(point.km);
              const cy = value?.temperature != null ? y(value.temperature) : value?.high != null ? y(value.high) : 174;
              const color = elevation.legs.find((leg) => leg.id === point.leg)!.color;
              const label = `${dayLabel(point.day)} ${point.time || 'untimed'} · ${point.name} · ${value?.temperature != null ? degrees(value.temperature) + 'C' : value?.low != null && value.high != null ? degrees(value.low) + '–' + degrees(value.high) + 'C daily range' : loading ? 'Loading forecast' : 'Forecast unavailable'} · ${weatherDescription(value?.code)}`;
              return <g key={point.id} role="button" tabIndex={0} aria-label={label} aria-pressed={selected === i} className="weather-profile-stop" onClick={() => setSelected(i)} onFocus={() => setSelected(i)} onMouseEnter={() => setSelected(i)} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(i); }
              }}>
                <title>{label}</title>
                <circle cx={cx} cy={cy} r="10" fill="transparent" />
                {value?.temperature == null && value?.low != null && value.high != null ? <g stroke={color} strokeWidth="2" opacity=".65">
                  <line x1={cx} x2={cx} y1={y(value.low)} y2={y(value.high)} />
                  <line x1={cx - 3} x2={cx + 3} y1={y(value.low)} y2={y(value.low)} />
                  <line x1={cx - 3} x2={cx + 3} y1={cy} y2={cy} />
                </g> : null}
                <circle cx={cx} cy={cy} r={selected === i ? 5 : 3} fill={value?.temperature != null ? color : '#fffdf8'} stroke={color} strokeWidth={selected === i ? 2 : 1.3} />
              </g>;
            })}
            <line x1={x(stop.km)} x2={x(stop.km)} y1="39" y2="181" className="weather-profile-selection" />
          </svg>
        </div>
      </div>
      <div className="profile-weather-panel mx-auto max-w-6xl px-5 sm:px-8">
        <div className="weather-glance-heading">
          <h3>Conditions along the route</h3>
          <div className="weather-day-picker" aria-label="Forecast day">
            {elevation.legs.map((leg) => <button key={leg.id} type="button" aria-pressed={stop.leg === leg.id} onClick={() => selectStop(stops.findIndex((point) => point.leg === leg.id), true)}>{leg.label.split(' · ')[0]}</button>)}
          </div>
        </div>
        <p className="weather-glance-note">Swipe through the conditions, or jump to a day. Stops are evenly spaced here, in travel order; the chart above uses distance.</p>
        <div className="conditions-track" ref={track} role="group" aria-label="Weather condition evolution across all 48 stops">
          {stops.map((point, i) => {
            const value = readings[i];
            const { Icon: ConditionIcon, tone: conditionTone } = conditionIcon(value?.code);
            return <button key={point.id} data-stop={i} type="button" className={`condition-step weather-tone-${conditionTone}${i === 0 || point.leg !== stops[i - 1].leg ? ' condition-day-start' : ''}`} aria-pressed={selected === i} onClick={() => selectStop(i)} title={`${point.name} · ${weatherDescription(value?.code)} · ${precipitationLabel(value)}`}>
              <span className="condition-step-date">{dayLabel(point.day)} · {point.time || 'daily'}</span>
              <span className="condition-step-icon"><ConditionIcon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
              <span className="condition-step-name">{point.name}</span>
              <span className="condition-step-description">{value ? weatherDescription(value.code) : loading ? 'Loading…' : 'Unavailable'}</span>
              <span className="condition-step-rain"><Droplets size={13} aria-hidden="true" /> {value?.rain != null ? `${Math.round(value.rain)}%${value.hour ? '' : ' max'}` : '—'}</span>
              <span className="condition-step-amount">{value?.precipitation != null ? `${value.precipitation.toFixed(1)} mm / ${value.hour ? 'hour' : 'day'}` : 'Amount unavailable'}</span>
            </button>;
          })}
        </div>
        <p className="weather-glance-note">Precipitation: chance and amount. Untimed stops show the day’s maximum hourly chance and total amount.</p>
        <div className="profile-weather-selected" aria-live="polite">
          <div className="profile-weather-controls">
            <button type="button" aria-label="Previous weather stop" disabled={selected === 0} onClick={() => selectStop(selected - 1, true)}><ChevronLeft size={18} /></button>
            <span>{selected + 1} / {stops.length}</span>
            <button type="button" aria-label="Next weather stop" disabled={selected === stops.length - 1} onClick={() => selectStop(selected + 1, true)}><ChevronRight size={18} /></button>
          </div>
          <div className="profile-weather-place">
            <p className="profile-weather-meta">{dayLabel(stop.day)} · {stop.time || 'Untimed stop'} · {Math.round(stop.km)} km</p>
            <p>{stop.name}</p>
          </div>
          <div className={`profile-weather-reading weather-tone-${tone}`}>
            <Icon size={22} aria-hidden="true" />
            <div><p>{loading && !reading ? 'Loading forecast…' : temperature}</p><p className="profile-weather-meta">{reading ? `${weatherDescription(reading.code)} · ${reading.hour ? `${reading.hour} CEST forecast` : 'Daily low–high'}` : 'No forecast available for this stop and date'}</p><p className="profile-weather-meta">{precipitationLabel(reading)}</p></div>
          </div>
        </div>
        <p className="profile-weather-help">Tap or hover over a marker, or step through every stop with the arrows. Hollow markers with a bar show daily ranges when an hourly forecast is unavailable or no time is scheduled; hollow markers below the plot have no forecast. Forecasts, not observed conditions. <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>{fetchedAt ? ` · Updated ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(new Date(fetchedAt))} CEST` : ''}.</p>
        <details className="profile-weather-all">
          <summary>All {stops.length} stop forecasts</summary>
          {elevation.legs.map((leg) => <section key={leg.id}>
            <h3>{leg.label.replace(' · Long', '').replace(' · You', '')} · {leg.start} → {leg.end}</h3>
            <div className="profile-weather-list">{stops.map((point, i) => point.leg === leg.id ? <div key={point.id}>
              <button type="button" onClick={() => setSelected(i)} className="profile-weather-stop-name">{point.name}</button>
              <p className="profile-weather-meta">{point.time || 'Untimed'} · {Math.round(point.km)} km</p>
              <StopWeather location={point} date={routeDate(point.day)} time={point.time} />
            </div> : null)}</div>
          </section>)}
        </details>
      </div>
    </>
  );
}
