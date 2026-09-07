'use client';

/* eslint-disable jsx-a11y/prefer-tag-over-role */
// SVG stop groups use explicit button roles for keyboard access.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import elevation from '@/data/tour-elevation.json';
import stops from '@/data/profile-stops.json';
import { conditionIcon, useWeather } from '@/components/stop-weather';
import { forecastAt, routeDate, weatherDescription, weatherKey } from '@/lib/weather';
import { temperatureColor } from '@/lib/temperature-color';

const WIDTH = 3280;
const HEIGHT = 774;
const LEFT = 0;
const RIGHT = WIDTH - 44;
const x = (km: number) => LEFT + km / elevation.totalKm * (RIGHT - LEFT);
const mountainY = (m: number) => 308 - m / 2800 * 164;
const ridge = elevation.points.map(([km, m]) => `${x(km)},${mountainY(m)}`).join(' ');
const area = `M ${LEFT},308 L ${ridge.replaceAll(' ', ' L ')} L ${RIGHT},308 Z`;
// Keep exact route positions. Stagger crowded labels vertically, never shift their distance.
const laneEnds: number[] = [];
const lanes = stops.map((stop) => {
  const cx = x(stop.km);
  let lane = laneEnds.findIndex((end) => cx - end >= 70);
  if (lane < 0) lane = laneEnds.length;
  laneEnds[lane] = cx;
  return lane;
});
const degrees = (v: number) => `${Math.round(v)}°`;
const dayOffsets = elevation.legs.map((leg) => x(leg.startKm));

export function ProfileWeather() {
  const { data, loading, fetchedAt } = useWeather();
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [currentDay, setCurrentDay] = useState(0);
  const currentDayRef = useRef(0);
  const pendingDay = useRef<number | null>(null);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Give the final short days distinct scroll positions instead of clamping both to the end.
  const tailWidth = Math.max(0, viewportWidth - 68 - (WIDTH - dayOffsets.at(-1)!));
  const nextLeg = elevation.legs[currentDay + 1];
  const navigationColor = nextLeg?.color ?? elevation.legs.at(-1)!.color;
  const changeDay = (day: number) => {
    currentDayRef.current = day;
    setCurrentDay(day);
  };
  const trackScroll = (left: number) => {
    setScrollLeft(left);
    if (pendingDay.current != null) {
      // Ignore intermediate animation frames: another click advances the intended day.
      if (Math.abs(left - dayOffsets[pendingDay.current]) < 3) pendingDay.current = null;
      return;
    }
    changeDay(dayOffsets.reduce((day, offset, i) => left >= offset - 3 ? i : day, 0));
  };
  const interruptPan = () => {
    const element = scroller.current;
    if (!element) return;
    pendingDay.current = null;
    element.scrollTo({ left: element.scrollLeft, behavior: 'instant' });
    trackScroll(element.scrollLeft);
  };
  const jump = (direction: number) => {
    const day = Math.max(0, Math.min(elevation.legs.length - 1, currentDayRef.current + direction));
    pendingDay.current = day;
    changeDay(day);
    setSelected(null);
    scroller.current?.scrollTo({ left: dayOffsets[day], behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const readings = stops.map((stop) => {
    const date = routeDate(stop.day);
    const forecast = data[`${date}/${weatherKey(stop)}`];
    return forecast ? forecastAt(forecast, date, stop.time) : null;
  });
  const values = readings.flatMap((r) => r ? [r.temperature, r.low, r.high].filter((n): n is number => n != null && Number.isFinite(n)) : []);
  const min = Math.floor(Math.min(0, ...values) / 5) * 5;
  const max = Math.max(25, Math.ceil(Math.max(25, ...values) / 5) * 5);
  const tempY = (v: number) => 445 - (v - min) / (max - min) * 100;
  const ticks = Array.from({ length: (max - min) / 5 + 1 }, (_, i) => min + i * 5);
  const temperature = (r: ReturnType<typeof forecastAt>) => r?.temperature != null ? degrees(r.temperature) : r?.low != null && r.high != null ? `${degrees(r.low)}–${degrees(r.high)}` : '—';
  const describe = (i: number) => {
    const stop = stops[i], r = readings[i];
    return `${stop.day.split(' · ')[0]} · ${stop.time || 'Daily forecast'} · ${stop.name} · ${Math.round(stop.km)} km · ${temperature(r)}C · ${weatherDescription(r?.code)} · ${r?.rain != null ? Math.round(r.rain) + '%' : 'Unknown'} precipitation chance${r && !r.hour ? ' (daily maximum)' : ''} · ${r?.precipitation != null ? r.precipitation.toFixed(1) + ' mm' : 'Amount unavailable'}${r ? r.hour ? ' in forecast hour' : ' over day' : ''}`;
  };
  return (
    <div className="journey-chart">
      <div className="journey-toolbar">
        <p className="journey-scroll-hint"><ArrowRight size={18} aria-hidden="true" /> Swipe / scroll right through the road trip</p>
      </div>
      <div className="journey-window">
        <div className="journey-chart-nav" data-current-day={currentDay} aria-label="Chart day navigation" style={{ backgroundColor: `color-mix(in srgb, ${navigationColor} 16%, var(--cream))`, color: navigationColor }}>
          <button type="button" className="journey-previous" aria-label="Previous day in chart" disabled={currentDay === 0 && scrollLeft < 3} onClick={() => jump(-1)}><ArrowLeft size={16} /></button>
          <button type="button" className="journey-next-preview" disabled={!nextLeg} aria-label={nextLeg ? `Next day: ${nextLeg.label.split(' · ')[0]}` : 'End of route'} title={nextLeg ? `Scroll to ${nextLeg.label.split(' · ')[0]}` : 'End of route'} onClick={() => jump(1)}><span>{nextLeg?.label.split(' · ')[0] ?? 'Lugano'}</span><ArrowRight size={14} /></button>
        </div>
        <div className="journey-scroll" ref={scroller} onScroll={(event) => trackScroll(event.currentTarget.scrollLeft)} onWheel={interruptPan} onTouchStart={interruptPan} role="group" aria-label="Scrollable elevation, temperature, conditions and precipitation chart">
          <svg className="journey-axis" style={{ boxShadow: scrollLeft < 1 ? 'none' : undefined }} width="68" height={HEIGHT} viewBox={`0 0 68 ${HEIGHT}`} aria-label="Pinned elevation and temperature scales">
            <text x="8" y="24" className="journey-axis-title">ROUTE</text>
            <text x="8" y="134" className="journey-axis-title">METRES</text>
            {[0, 1000, 2000].map((m) => <text key={m} x="58" y={mountainY(m) + 4} textAnchor="end">{m.toLocaleString('en-GB')}</text>)}
            <text x="8" y="332" className="journey-axis-title">TEMP °C</text>
            {ticks.map((v) => <text key={v} x="58" y={tempY(v) + 4} textAnchor="end" style={{ fill: temperatureColor(v) }}>{degrees(v)}</text>)}
            <text x="8" y="485" className="journey-axis-title">SKY</text>
            <text x="8" y="503" className="journey-axis-title">RAIN %</text>
            <text x="8" y="521" className="journey-axis-title">mm</text>
            <text x="8" y={HEIGHT - 12} className="journey-axis-title">KM</text>
          </svg>
          <svg className="journey-plot" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="All 48 stops aligned to the same route distance across mountains, temperature and weather">
            <defs>
              <linearGradient id="journey-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f0c14e" /><stop offset="1" stopColor="#e2a92f" /></linearGradient>
              <linearGradient id="journey-temperature" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={tempY(max)} y2={tempY(min)}>
                {[max, 22.01, 22, 18, 17.99, min].map((v) => <stop key={v} offset={(max - v) / (max - min)} stopColor={temperatureColor(v)} />)}
              </linearGradient>
            </defs>
            {elevation.legs.map((leg) => <g key={leg.id}>
              <rect x={x(leg.startKm)} y="0" width={x(leg.endKm) - x(leg.startKm)} height="30" fill={leg.color} opacity=".16" />
              <text x={x(leg.startKm) + 8} y="20" className="journey-day-label" fill={leg.color}>{leg.label.split(' · ')[0]}</text>
              <line x1={x(leg.startKm)} x2={x(leg.startKm)} y1="30" y2={HEIGHT - 30} className="journey-day-edge" />
            </g>)}
            {[0, 1000, 2000].map((m) => <line key={m} x1={LEFT} x2={RIGHT} y1={mountainY(m)} y2={mountainY(m)} className="profile-grid" />)}
            <path d={area} fill="url(#journey-gold)" /><polyline points={ridge} className="profile-ridge" />
            <text x={LEFT + 8} y="62" className="journey-terminus">ZÜRICH</text>
            <text x={RIGHT} y="62" textAnchor="end" className="journey-terminus">LUGANO</text>
            {elevation.summits.map((summit, i) => <g key={i}>
              <line x1={x(summit.km)} x2={x(summit.km)} y1="139" y2={mountainY(summit.sampled)} className="profile-leader" />
              <text x={x(summit.km)} y="122" transform={`rotate(-45 ${x(summit.km)} 122)`} className="journey-summit"><tspan>{summit.name}</tspan><tspan x={x(summit.km)} dy="14">{summit.altitude.toLocaleString('en-GB')} m</tspan></text>
              <circle cx={x(summit.km)} cy={mountainY(summit.sampled)} r="2.5" fill="#8a6410" />
            </g>)}
            <rect x={LEFT} y={tempY(max)} width={RIGHT - LEFT} height={tempY(min) - tempY(max)} fill="url(#journey-temperature)" opacity=".1" />
            <text x={LEFT + 8} y="330" fontSize="11" fill="#52645e">Blue below 18°C · neutral 18–22°C · red above 22°C</text>
            {ticks.map((v) => <line key={v} x1={LEFT} x2={RIGHT} y1={tempY(v)} y2={tempY(v)} className="profile-grid" />)}
            {[18, 22].map((v) => <line key={v} x1={LEFT} x2={RIGHT} y1={tempY(v)} y2={tempY(v)} stroke={temperatureColor(v === 18 ? 17.99 : 22.01)} strokeDasharray="4 5" opacity=".35" />)}
            <line x1={LEFT} x2={RIGHT} y1="464" y2="464" className="journey-day-edge" />
            {stops.map((stop, i) => {
              const r = readings[i], cx = x(stop.km), rowY = 485 + lanes[i] * 62;
              // Inset only the edge annotation; the route and temperature still begin at 0 km.
              const labelX = Math.max(24, cx);
              const { Icon, tone } = conditionIcon(r?.code);
              const cy = r?.temperature != null ? tempY(r.temperature) : r?.high != null ? tempY(r.high) : 454;
              const color = temperatureColor(r?.temperature ?? r?.high);
              return <g key={stop.id} data-km={stop.km} data-weather-stop={i} role="button" tabIndex={0} aria-label={describe(i)} className={`journey-stop weather-tone-${tone}`} onClick={() => setSelected(i)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(i); } }}>
                <title>{describe(i)}</title>
                <line x1={cx} x2={cx} y1={cy + 5} y2={rowY - 12} className="journey-stop-guide" />
                {r?.temperature == null && r?.low != null && r.high != null ? <line x1={cx} x2={cx} y1={tempY(r.low)} y2={tempY(r.high)} stroke="url(#journey-temperature)" strokeWidth="3" /> : null}
                <circle cx={cx} cy={cy} r="4.5" fill={r?.temperature != null ? color : '#f4ecda'} stroke={color} strokeWidth="1.8" />
                <rect x={labelX - 24} y={rowY - 12} width="48" height="58" rx="4" className={selected === i ? 'journey-stop-hit selected' : 'journey-stop-hit'} />
                <Icon x={labelX - 10} y={rowY - 10} width="20" height="20" strokeWidth={1.7} aria-hidden="true" />
                <text x={labelX} y={rowY + 25} textAnchor="middle" className="journey-rain">{r?.rain != null ? Math.round(r.rain) + '%' : '—'}</text>
                <text x={labelX} y={rowY + 41} textAnchor="middle" className="journey-amount">{r?.precipitation != null ? r.precipitation.toFixed(1) : '—'}{r && !r.hour ? '*' : ''}</text>
              </g>;
            })}
            <line x1={LEFT} x2={RIGHT} y1={HEIGHT - 30} y2={HEIGHT - 30} className="journey-day-edge" />
            {Array.from({ length: 15 }, (_, i) => i * 100).map((km) => <text key={km} x={x(km) + (km === 0 ? 8 : 0)} y={HEIGHT - 12} textAnchor={km === 0 ? 'start' : 'middle'} className="journey-distance">{km}</text>)}
          </svg>
          <div className="journey-end-space" aria-hidden="true" style={{ flex: `0 0 ${tailWidth}px` }} />
        </div>
        {selected != null ? <div className="journey-tooltip" role="status"><span>{describe(selected)}</span><button type="button" aria-label="Close stop details" onClick={() => setSelected(null)}><X size={18} /></button></div> : null}
      </div>
      <p className="journey-note">One distance scale · Tap a weather icon for the stop and forecast time · Temperature dots: nearest hour; bars: daily low–high · Rain: chance and mm in forecast hour; * daily maximum chance and day total. {loading ? 'Loading forecasts…' : ''} <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>{fetchedAt ? ` · Updated ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(new Date(fetchedAt))} CEST` : ''}.</p>
    </div>
  );
}
