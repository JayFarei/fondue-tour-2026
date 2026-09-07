// Print the weather stop positions for data/profile-stops.json after route/elevation updates.
// Use each stop's ordered geometry index: nearest-point matching breaks repeated crossings.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const read = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
const elevation = await read('data/tour-elevation.json');
const plans = await read('data/tour-routes.json');
const radians = (n) => n * Math.PI / 180;
function distance([a, b], [c, d]) {
  const h = Math.sin(radians(d - b) / 2) ** 2 + Math.cos(radians(b)) * Math.cos(radians(d)) * Math.sin(radians(c - a) / 2) ** 2;
  return 12742017.6 * Math.asin(Math.sqrt(h));
}
const stops = [];
for (const leg of elevation.legs) {
  const plan = plans.find((p) => p.id === leg.id);
  const route = await read(`public/routes/${leg.id}.geojson`);
  const coordinates = route.features.find((f) => f.geometry.type === 'LineString').geometry.coordinates;
  const indexes = route.properties.stopGeometryIndexes;
  assert.equal(indexes.length, plan.stops.length);
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) cumulative.push(cumulative[i - 1] + distance(coordinates[i - 1], coordinates[i]));
  plan.stops.forEach((stop, index) => {
    assert(indexes[index] >= (indexes[index - 1] ?? 0) && indexes[index] < coordinates.length);
    const km = leg.startKm + cumulative[indexes[index]] / cumulative.at(-1) * (leg.endKm - leg.startKm);
    stops.push({ ...stop, id: `${leg.id}-${index}`, leg: leg.id, day: plan.day, km: Math.round(km * 1000) / 1000 });
  });
}
assert.equal(stops.length, elevation.legs.reduce((n, leg) => n + plans.find((p) => p.id === leg.id).stops.length, 0));
console.log(JSON.stringify(stops, null, 2));
