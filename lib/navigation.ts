export type RouteStop = { name: string; lat: number; lon: number };

export function directionsUrl(stops: RouteStop[]) {
  if (!stops.length) throw new Error('A Maps link needs a stop');
  if (stops.length > 5)
    throw new Error(
      'Split Maps routes into at most three intermediate waypoints',
    );
  const coordinate = (stop: RouteStop) => `${stop.lat},${stop.lon}`;
  if (stops.length === 1) {
    return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: coordinate(stops[0]) })}`;
  }
  const params = new URLSearchParams({
    api: '1',
    origin: coordinate(stops[0]),
    destination: coordinate(stops.at(-1)!),
    travelmode: 'driving',
  });
  if (stops.length > 2)
    params.set('waypoints', stops.slice(1, -1).map(coordinate).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

// Adjacent parts share their endpoint, preserving every stop on mobile browsers.
export function routeParts(stops: RouteStop[]) {
  if (stops.length === 1) return [{ href: directionsUrl(stops), stops }];
  const parts = [];
  for (let i = 0; i < stops.length - 1; i += 4) {
    const part = stops.slice(i, i + 5);
    parts.push({ href: directionsUrl(part), stops: part });
  }
  return parts;
}
