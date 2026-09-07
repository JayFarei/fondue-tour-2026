import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { directionsUrl, routeParts } from '../lib/navigation.ts';
import {
  forecastAt,
  forecastUrl,
  routeDate,
  weatherDescription,
  weatherEmoji,
} from '../lib/weather.ts';

const plans = JSON.parse(
  await readFile(new URL('../data/tour-routes.json', import.meta.url)),
);
let links = 0;
for (const plan of plans) {
  const parts = routeParts(plan.stops);
  const recovered = parts.flatMap((part, i) => part.stops.slice(i ? 1 : 0));
  assert.deepEqual(
    recovered,
    plan.stops,
    `${plan.id}: no stops dropped between Maps parts`,
  );
  for (const part of parts) {
    const url = new URL(part.href);
    assert.equal(url.searchParams.get('api'), '1');
    assert.equal(url.searchParams.get('travelmode'), 'driving');
    assert.equal(
      url.searchParams.get('origin'),
      `${part.stops[0].lat},${part.stops[0].lon}`,
    );
    assert.equal(
      url.searchParams.get('destination'),
      `${part.stops.at(-1).lat},${part.stops.at(-1).lon}`,
    );
    assert((url.searchParams.get('waypoints')?.split('|').length ?? 0) <= 3);
    assert(part.href.length <= 2048);
    links++;
  }
  for (let i = 0; i < plan.stops.length; i++) {
    const next = new URL(directionsUrl(plan.stops.slice(i, i + 2)));
    assert.equal(
      next.pathname,
      i === plan.stops.length - 1 ? '/maps/search/' : '/maps/dir/',
    );
    links++;
  }
  assert.match(routeDate(plan.day), /^2026-09-(08|09|10|11|12|13)$/);
}
const fixture = {
  timezone: 'Europe/Zurich',
  daily: {
    time: ['2026-09-10'],
    temperature_2m_min: [0],
    temperature_2m_max: [12],
    weather_code: [61],
    precipitation_probability_max: [80],
    precipitation_sum: [5.5],
  },
  hourly: {
    time: ['2026-09-10T15:00', '2026-09-10T16:00', '2026-09-11T00:00'],
    temperature_2m: [0, 10, 3],
    weather_code: [0, 2, 3],
    precipitation_probability: [0, 50, 20],
    precipitation: [0, 0.4, 0.1],
  },
};
assert.equal(
  forecastAt(fixture, '2026-09-10', '15:14').temperature,
  0,
  'Preserve a real zero temperature',
);
assert.equal(forecastAt(fixture, '2026-09-10', '15:40').temperature, 10);
assert.equal(forecastAt(fixture, '2026-09-10', '23:50').hour, '00:00');
assert.equal(
  forecastAt(fixture, '2026-09-10', 'After return').temperature,
  null,
);
assert.equal(forecastAt(fixture, '2026-09-10', '').low, 0);
assert.equal(
  forecastAt(fixture, '2026-09-11', '15:00'),
  null,
  'Never silently substitute another date',
);
assert.equal(weatherDescription(null), 'Conditions unavailable');
assert.equal(weatherDescription(0), 'Clear');
assert.equal(weatherEmoji(0), '☀️');
assert.equal(weatherEmoji(3), '☁️');
assert.equal(weatherEmoji(61), '🌧️');
assert.equal(weatherEmoji(null), '❔');
assert.equal(forecastAt(fixture, '2026-09-10', '15:14').precipitation, 0);
assert.equal(forecastAt(fixture, '2026-09-10', '15:40').precipitation, 0.4);
assert.equal(forecastAt(fixture, '2026-09-10', '').precipitation, 5.5);
assert.equal(forecastAt(fixture, '2026-09-10', '').rain, 80);
assert.equal(forecastAt({...fixture, daily: {...fixture.daily, precipitation_sum: undefined}}, '2026-09-10', '').precipitation, null);
const url = new URL(forecastUrl([{ lat: 46, lon: 8 }], '2026-09-10'));
assert.equal(url.searchParams.get('start_date'), '2026-09-10');
assert.equal(url.searchParams.get('end_date'), '2026-09-10');
assert.equal(url.searchParams.get('timezone'), 'auto');
console.log(
  `Validated ${links} Maps links, complete waypoint coverage, and weather date/time/missing-data boundaries.`,
);
