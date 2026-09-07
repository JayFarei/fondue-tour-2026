import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const plans = JSON.parse(await readFile(path.join(root, 'data/tour-routes.json'), 'utf8'));
const geoDir = path.join(root, 'public/routes');
const gpxDir = path.join(root, 'public/gpx');
const continuationDir = path.join(gpxDir, 'continue');
const downloadDir = path.join(root, 'public/downloads');

await Promise.all([
  mkdir(geoDir, { recursive: true }),
  mkdir(continuationDir, { recursive: true }),
  mkdir(downloadDir, { recursive: true }),
]);

const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const builtRoutes = new Map();

function squaredSegmentDistance(point, start, end) {
  let [x, y] = start;
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const progress = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (progress > 1) [x, y] = end;
    else if (progress > 0) {
      x += dx * progress;
      y += dy * progress;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyGeometry(points, tolerance = 0.00008) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const toleranceSquared = tolerance * tolerance;

  while (stack.length) {
    const [start, end] = stack.pop();
    let furthest = toleranceSquared;
    let furthestIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = squaredSegmentDistance(points[index], points[start], points[end]);
      if (distance > furthest) {
        furthest = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex !== -1) {
      keep[furthestIndex] = 1;
      stack.push([start, furthestIndex], [furthestIndex, end]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

async function routeGeometry(plan) {
  const coordinates = plan.stops.map((stop) => `${stop.lon},${stop.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': 'FondueTourPlanner/1.0' }, signal: AbortSignal.timeout(45000) });
    if (response.ok) {
      const body = await response.json();
      if (body.code === 'Ok' && body.routes?.[0]?.geometry?.coordinates?.length) {
        return body.routes[0];
      }
    }
    if (attempt < 3) await sleep(900 * attempt);
  }

  throw new Error(`OSRM could not build ${plan.id}`);
}

function geometryWithStopIndexes(route) {
  const geometry = [];
  const indexes = [0];
  for (const leg of route.legs) {
    const points = leg.steps.flatMap((step) => step.geometry.coordinates);
    const simplified = simplifyGeometry(points.filter((point, i) => !i || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]));
    if (!simplified.length) throw new Error('Missing OSRM leg geometry');
    geometry.push(...(geometry.length ? simplified.slice(1) : simplified));
    indexes.push(geometry.length - 1);
  }
  return { geometry, indexes };
}

function gpxDocument(plan, stops, geometry, suffix = '') {
  const name = `${plan.day} · ${plan.title}${suffix}`;
  const routePoints = stops
    .map((stop) => `    <rtept lat="${stop.lat}" lon="${stop.lon}"><name>${xml(stop.name)}</name></rtept>`)
    .join('\n');
  const trackPoints = geometry
    .map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fondue Tour 2026" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata><name>${xml(name)}</name><desc>Fondue Tour 2026 roadbook route. Verify live pass status before departure.</desc></metadata>
  <rte>
    <name>${xml(name)} stops</name>
${routePoints}
  </rte>
  <trk>
    <name>${xml(name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>
`;
}

for (const plan of plans) {
  process.stdout.write(`Building ${plan.id}... `);
  const route = await routeGeometry(plan);
  const { geometry, indexes } = geometryWithStopIndexes(route);
  builtRoutes.set(plan.id, { plan, route, geometry });
  const featureCollection = {
    type: 'FeatureCollection',
    properties: {
      id: plan.id,
      distanceMetres: route.distance,
      durationSeconds: route.duration,
      generatedBy: 'OSRM using OpenStreetMap data',
      stopGeometryIndexes: indexes,
    },
    features: [
      {
        type: 'Feature',
        properties: { kind: 'route', color: plan.color },
        geometry: { type: 'LineString', coordinates: geometry },
      },
      ...plan.stops.map((stop, index) => ({
        type: 'Feature',
        properties: { kind: 'stop', index, name: stop.name, time: stop.time, detail: stop.detail },
        geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
      })),
    ],
  };

  await writeFile(path.join(geoDir, `${plan.id}.geojson`), `${JSON.stringify(featureCollection)}\n`);
  await writeFile(path.join(gpxDir, `${plan.id}.gpx`), gpxDocument(plan, plan.stops, geometry));

  for (let index = 0; index < plan.stops.length; index += 1) {
    const remainingStops = plan.stops.slice(index);
    const remainingGeometry = geometry.slice(indexes[index]);
    await writeFile(
      path.join(continuationDir, `${plan.id}-from-${String(index + 1).padStart(2, '0')}.gpx`),
      gpxDocument(plan, remainingStops, remainingGeometry, ` · from ${plan.stops[index].name}`),
    );
  }

  process.stdout.write(`${Math.round(route.distance / 1000)} km\n`);
  await sleep(350);
}

const fullRouteIds = [
  'wednesday-personal',
  'thursday-loop',
  'friday-san-bernardino',
  'saturday-ascona',
  'sunday-return',
];
const fullLegs = fullRouteIds.map((id) => builtRoutes.get(id));
const fullStops = fullLegs.flatMap(({ plan }, legIndex) => plan.stops.slice(legIndex ? 1 : 0));
const fullGeometry = fullLegs.flatMap(({ geometry }, legIndex) => geometry.slice(legIndex ? 1 : 0));
const fullPlan = {
  id: 'full-tour',
  day: 'Wed 09 – Sun 13',
  title: 'Full rental route · Zürich to Lugano',
  color: '#b84a32',
  stops: fullStops,
};
const fullFeatureCollection = {
  type: 'FeatureCollection',
  properties: {
    id: fullPlan.id,
    distanceMetres: fullLegs.reduce((sum, { route }) => sum + route.distance, 0),
    durationSeconds: fullLegs.reduce((sum, { route }) => sum + route.duration, 0),
    generatedBy: 'OSRM using OpenStreetMap data',
  },
  features: fullLegs.map(({ plan, geometry, route }) => ({
    type: 'Feature',
    properties: {
      kind: 'route',
      id: plan.id,
      label: plan.day,
      title: plan.title,
      color: plan.color,
      distanceMetres: route.distance,
      start: plan.stops[0].name,
      end: plan.stops.at(-1).name,
    },
    geometry: { type: 'LineString', coordinates: geometry },
  })),
};

await writeFile(path.join(geoDir, 'full-tour.geojson'), `${JSON.stringify(fullFeatureCollection)}\n`);
await writeFile(path.join(gpxDir, 'full-tour.gpx'), gpxDocument(fullPlan, fullStops, fullGeometry));

const zipPath = path.join(downloadDir, 'fondue-tour-2026-tomtom-gpx.zip');
await rm(zipPath, { force: true });
const zip = spawnSync('zip', ['-q', '-j', zipPath, path.join(gpxDir, 'full-tour.gpx'), ...plans.map((plan) => path.join(gpxDir, `${plan.id}.gpx`))]);
if (zip.status !== 0) throw new Error(`zip failed: ${zip.stderr?.toString()}`);
console.log(`Wrote the full tour, ${plans.length} route maps, GPX continuations, and ${zipPath}`);
