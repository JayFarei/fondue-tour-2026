'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FileArchive, MapPin, Navigation, Route } from 'lucide-react';
import routePlans from '@/data/tour-routes.json';
import { assetPath } from '@/lib/asset-path';
import { directionsUrl, routeParts } from '@/lib/navigation';
import { routeDate } from '@/lib/weather';
import { StopWeather, WeatherStatus } from '@/components/stop-weather';

type Stop = {
  time: string;
  name: string;
  detail: string;
  lat: number;
  lon: number;
};

type RoutePlan = {
  id: string;
  day: string;
  title: string;
  subtitle: string;
  color: string;
  stops: Stop[];
};

type RouteStats = { distanceMetres: number; durationSeconds: number } | null;
type RouteGeoJson = {
  properties: { distanceMetres: number; durationSeconds: number };
  features: Array<{
    properties?: { kind?: string };
    geometry: { coordinates: Array<[number, number]> };
  }>;
};

type FullRouteGeoJson = {
  properties: { distanceMetres: number; durationSeconds: number };
  features: Array<{
    properties: {
      id: string;
      label: string;
      title: string;
      color: string;
      distanceMetres: number;
      start: string;
      end: string;
    };
    geometry: { coordinates: Array<[number, number]> };
  }>;
};

const plans = routePlans as RoutePlan[];

export function FullTourOverview() {
  const mapElement = useRef<HTMLDivElement>(null);
  const [route, setRoute] = useState<FullRouteGeoJson | null>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let map: import('leaflet').Map | undefined;

    async function renderMap() {
      if (!mapElement.current) return;

      try {
        const [L, response] = await Promise.all([
          import('leaflet'),
          fetch(assetPath('/routes/full-tour.geojson')),
        ]);
        if (!response.ok) throw new Error('Full route was not available');
        const geojson = await response.json() as FullRouteGeoJson;
        if (disposed || !mapElement.current) return;

        const compact = window.matchMedia('(max-width: 639px)').matches;
        map = L.map(mapElement.current, {
          dragging: !compact,
          scrollWheelZoom: false,
          touchZoom: !compact,
          zoomControl: false,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        const bounds = L.latLngBounds([]);
        geojson.features.forEach((feature, legIndex) => {
          const coordinates = feature.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]);
          const line = L.polyline(coordinates, {
            color: feature.properties.color,
            weight: 5,
            opacity: 0.92,
            lineJoin: 'round',
          }).bindTooltip(`${feature.properties.label} · ${feature.properties.start} → ${feature.properties.end}`);
          line.addTo(map!);
          bounds.extend(line.getBounds());

          const [startLat, startLon] = coordinates[0];
          L.circleMarker([startLat, startLon], {
            radius: 7,
            color: '#fffdf8',
            weight: 3,
            fillColor: feature.properties.color,
            fillOpacity: 1,
          }).bindTooltip(`${feature.properties.label} · ${feature.properties.start}`, { direction: 'top' }).addTo(map!);

          if (legIndex === geojson.features.length - 1) {
            const [endLat, endLon] = coordinates.at(-1)!;
            L.circleMarker([endLat, endLon], {
              radius: 8,
              color: '#fffdf8',
              weight: 3,
              fillColor: feature.properties.color,
              fillOpacity: 1,
            }).bindTooltip(`Finish · ${feature.properties.end}`, { direction: 'top' }).addTo(map!);
          }
        });

        map.fitBounds(bounds, { padding: [28, 28] });
        setRoute(geojson);
      } catch {
        if (!disposed) setMapError(true);
      }
    }

    void renderMap();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, []);

  const distance = route ? Math.round(route.properties.distanceMetres / 1000).toLocaleString('en-GB') : '1,418';

  return (
    <section id="overview" className="bg-background px-5 py-14 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">Your complete drive</p>
            <h2 className="display-title">Zürich to Lugano,<br className="hidden sm:block" /> the beautiful way.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">The full rental route uses Friday’s longer San Bernardino option. Switch to the shorter Albula route in the daily navigator if weather or timing demands it.</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <span className="stat-pill stat-pill-dark">≈ {distance} km</span>
            <span className="stat-pill stat-pill-green">5 driving days</span>
          </div>
        </div>

        <div className="map-panel">
          <div className="grid min-w-0 lg:grid-cols-[minmax(260px,.54fr)_minmax(0,1.46fr)]">
            <div className="min-w-0 border-b border-border p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Route at a glance</p>
              <div className="mt-4 space-y-1">
                {(route?.features ?? [
                  { properties: { id: 'wednesday', label: 'Wed 09', start: 'Zürich', end: 'La Thuile', color: '#b84a32', distanceMetres: 460000 } },
                  { properties: { id: 'thursday', label: 'Thu 10', start: 'La Thuile', end: 'Goms', color: '#396b67', distanceMetres: 341000 } },
                  { properties: { id: 'friday', label: 'Fri 11', start: 'Goms', end: 'Valbella', color: '#5b637d', distanceMetres: 333000 } },
                  { properties: { id: 'saturday', label: 'Sat 12', start: 'Valbella', end: 'Ascona', color: '#836036', distanceMetres: 241000 } },
                  { properties: { id: 'sunday', label: 'Sun 13', start: 'Ascona', end: 'Lugano', color: '#263d45', distanceMetres: 43000 } },
                ]).map((feature) => (
                  <div key={feature.properties.id} className="full-route-leg">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: feature.properties.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">{feature.properties.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{feature.properties.start} → {feature.properties.end}</span>
                    </span>
                    <span className="leg-km">{Math.round(feature.properties.distanceMetres / 1000)} km</span>
                  </div>
                ))}
              </div>
              <a href={assetPath('/gpx/full-tour.gpx')} download className="map-button map-button-dark mt-6 w-full">
                <Download className="size-4" /> Full-route TomTom GPX
              </a>
              <a href="#navigator" className="mobile-action-link mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-[#b84a32] hover:underline">
                Open daily restart navigator <Navigation className="size-3.5" />
              </a>
            </div>

            <div className="relative min-h-[420px] min-w-0 bg-[#dfe8e0] sm:min-h-[520px]">
              {mapError ? (
                <div className="absolute inset-0 grid place-items-center p-8 text-center">
                  <div><MapPin className="mx-auto size-7 text-[#b84a32]" /><p className="mt-3 font-semibold">The overview map could not load.</p><p className="mt-1 text-xs text-muted-foreground">The full GPX and daily routes still work.</p></div>
                </div>
              ) : null}
              <div ref={mapElement} className="map-canvas absolute inset-0 z-0" aria-label="OpenStreetMap overview of the full Fondue Tour route" />
              <div className="map-note">
                Full route shown with Friday’s longer option. Live closures still take precedence.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);
}

export function TourMap() {
  const [activeId, setActiveId] = useState('wednesday-personal');
  const [stats, setStats] = useState<RouteStats>(null);
  const [mapError, setMapError] = useState(false);
  const mapElement = useRef<HTMLDivElement>(null);
  const activePlan = useMemo(() => plans.find((plan) => plan.id === activeId) ?? plans[0], [activeId]);

  useEffect(() => {
    let disposed = false;
    let map: import('leaflet').Map | undefined;

    async function renderMap() {
      if (!mapElement.current) return;
      setMapError(false);
      setStats(null);

      try {
        const [L, response] = await Promise.all([
          import('leaflet'),
          fetch(assetPath(`/routes/${activePlan.id}.geojson`)),
        ]);
        if (!response.ok) throw new Error('Route file was not available');
        const geojson = await response.json() as RouteGeoJson;
        if (disposed || !mapElement.current) return;

        const routeFeature = geojson.features.find((feature: { properties?: { kind?: string } }) => feature.properties?.kind === 'route');
        if (!routeFeature) throw new Error('Route geometry was not available');
        const coordinates = routeFeature.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]);

        const compact = window.matchMedia('(max-width: 639px)').matches;
        map = L.map(mapElement.current, {
          dragging: !compact,
          scrollWheelZoom: false,
          touchZoom: !compact,
          zoomControl: false,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        const routeLine = L.polyline(coordinates, {
          color: activePlan.color,
          weight: 5,
          opacity: 0.9,
          lineJoin: 'round',
        }).addTo(map);

        activePlan.stops.forEach((stop, index) => {
          const navigateUrl = directionsUrl(activePlan.stops.slice(index, index + 2));
          const gpxUrl = assetPath(`/gpx/continue/${activePlan.id}-from-${String(index + 1).padStart(2, '0')}.gpx`);
          L.circleMarker([stop.lat, stop.lon], {
            radius: index === 0 || index === activePlan.stops.length - 1 ? 8 : 6,
            color: '#fffdf8',
            weight: 3,
            fillColor: activePlan.color,
            fillOpacity: 1,
          })
            .bindTooltip(`${index + 1}. ${stop.name}`, { direction: 'top' })
            .bindPopup(`
              <div class="map-popup">
                <span>${escapeHtml(stop.time || `Stop ${index + 1}`)}</span>
                <strong>${escapeHtml(stop.name)}</strong>
                <small>${escapeHtml(stop.detail)}</small>
                <a href="${navigateUrl}" target="_blank" rel="noreferrer">${index === activePlan.stops.length - 1 ? 'Open destination' : 'Navigate to next stop'} ↗</a>
                ${index < activePlan.stops.length - 1 ? `<a href="${gpxUrl}" download>Download remaining GPX ↓</a>` : ''}
              </div>
            `)
            .addTo(map!);
        });

        map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
        setStats(geojson.properties ?? null);
      } catch {
        if (!disposed) setMapError(true);
      }
    }

    void renderMap();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [activePlan]);

  const distance = stats ? `${Math.round(stats.distanceMetres / 1000)} km` : 'Loading distance';
  const hours = stats ? `${Math.floor(stats.durationSeconds / 3600)}h ${Math.round((stats.durationSeconds % 3600) / 60)}m mapped` : 'Loading time';

  return (
    <section id="navigator" className="border-y border-border bg-[#e8ede4]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">Route navigator</p>
            <h2 className="display-title">Restart from any stop</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Pick a day, then tap your current stop to navigate to the next one. For a longer section, open the numbered Google Maps parts in order. The GPX preserves the full remaining track.
            </p>
          </div>
          <a href={assetPath('/downloads/fondue-tour-2026-tomtom-gpx.zip')} download className="map-button map-button-dark">
            <FileArchive className="size-4" /> Download all TomTom GPX
          </a>
        </div>

        <div className="mb-5"><WeatherStatus /></div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-2" aria-label="Choose route">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setActiveId(plan.id)}
              className={`map-day-tab ${plan.id === activePlan.id ? 'is-active' : ''}`}
              style={plan.id === activePlan.id ? { backgroundColor: plan.color, borderColor: plan.color } : undefined}
            >
              {plan.day}
            </button>
          ))}
        </div>

        <div className="map-panel">
          <div className="grid min-w-0 lg:grid-cols-[minmax(300px,.72fr)_minmax(0,1.28fr)]">
            <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
              <div className="border-b border-border p-5 sm:p-6">
                <div className="eyebrow mb-3 flex items-center gap-2" style={{ color: activePlan.color }}>
                  <Route className="size-4" /> {activePlan.day}
                </div>
                <h3 className="day-title" style={{ fontSize: '1.7rem' }}>{activePlan.title}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{activePlan.subtitle}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="stat-pill">{distance}</span>
                  <span className="stat-pill">{hours}</span>
                  <span className="stat-pill">{activePlan.stops.length} stops</span>
                </div>
                <a href={assetPath(`/gpx/${activePlan.id}.gpx`)} download className="compact-download mt-4 inline-flex items-center gap-2 text-xs font-semibold hover:underline" style={{ color: activePlan.color }}>
                  <Download className="size-3.5" /> Download this full GPX
                </a>
                <div className="mt-3 grid gap-2">
                  {routeParts(activePlan.stops).map((part, i) => <a key={i} href={part.href} target="_blank" rel="noreferrer" className="text-sm underline">Maps part {i + 1}: {part.stops[0].name} → {part.stops.at(-1)!.name}</a>)}
                </div>
              </div>

              <div className="route-restart-scroll max-h-[540px] overflow-y-auto p-2 sm:p-3">
                <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Start from…</p>
                {activePlan.stops.map((stop, index) => {
                  const remaining = activePlan.stops.length - index;
                  return (
                    <div key={`${stop.name}-${index}`} className="route-restart-row flex-wrap">
                      <a href={directionsUrl(activePlan.stops.slice(index, index + 2))} target="_blank" rel="noreferrer" className="route-restart-main">
                        <span className="route-restart-number" style={{ backgroundColor: activePlan.color }}>{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-5">{stop.name}</span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                            {stop.time ? `${stop.time} · ` : ''}{remaining === 1 ? 'Open final stop' : `Next: ${activePlan.stops[index + 1].name}`}
                          </span>
                        </span>
                        <Navigation className="size-4 shrink-0" style={{ color: activePlan.color }} />
                      </a>
                      {remaining > 1 ? <a
                        href={assetPath(`/gpx/continue/${activePlan.id}-from-${String(index + 1).padStart(2, '0')}.gpx`)}
                        download
                        className="route-restart-gpx"
                        aria-label={`Download GPX from ${stop.name}`}
                        title="Download the remaining TomTom GPX"
                      >
                        GPX
                      </a> : null}
                      <div className="w-full pb-2 pl-12 pr-3"><StopWeather location={stop} date={routeDate(activePlan.day)} time={stop.time} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative min-h-[460px] min-w-0 bg-[#dfe8e0] lg:min-h-[680px]">
              {mapError ? (
                <div className="absolute inset-0 grid place-items-center p-8 text-center">
                  <div><MapPin className="mx-auto size-7 text-[#b84a32]" /><p className="mt-3 font-semibold">The map could not load.</p><p className="mt-1 text-xs text-muted-foreground">The restart links and GPX downloads still work.</p></div>
                </div>
              ) : null}
              <div ref={mapElement} className="map-canvas absolute inset-0 z-0" aria-label={`OpenStreetMap route for ${activePlan.title}`} />
              <div className="map-note">
                Indicative OSRM route. Check closures and pass status before driving.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
          <p><strong className="text-foreground">TomTom:</strong> import a downloaded GPX at Plan.TomTom.com → My Items → Routes → Import GPX, then sync it as a track.</p>
          <p><strong className="text-foreground">Google Maps:</strong> each numbered part has at most three intermediate stops for mobile browsers. Open the next part at its starting stop. Google may reroute for closures; the GPX remains an indicative track.</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold">
          <a href="https://plan.tomtom.com/" target="_blank" rel="noreferrer" className="support-link inline-flex items-center gap-1.5 hover:underline">Open TomTom Plan <ExternalLink className="size-3.5" /></a>
          <a href="https://help.tomtom.com/hc/en-gb/articles/360013958599-Importing-items-in-Plan-TomTom-com" target="_blank" rel="noreferrer" className="support-link inline-flex items-center gap-1.5 hover:underline">TomTom GPX instructions <ExternalLink className="size-3.5" /></a>
        </div>
      </div>
    </section>
  );
}
