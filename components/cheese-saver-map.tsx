'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { assetPath } from '@/lib/asset-path';
import type { MediaRecord } from '@/lib/cheese-saver/media';

export type GalleryMedia = MediaRecord;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

export function CheeseSaverMap({ media, onSelect }: { media: GalleryMedia[]; onSelect: (media: GalleryMedia) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const geotagged = useMemo(
    () => media.filter((item) => item.latitude !== null && item.longitude !== null),
    [media],
  );

  useEffect(() => {
    let disposed = false;
    let map: import('leaflet').Map | undefined;

    async function render() {
      if (!element.current) return;
      setFailed(false);
      try {
        const [L, response] = await Promise.all([
          import('leaflet'),
          fetch(assetPath('/routes/full-tour.geojson')),
        ]);
        if (!response.ok) throw new Error('Route unavailable');
        const route = await response.json() as {
          features: Array<{ geometry: { coordinates: [number, number][] }; properties: { color: string } }>;
        };
        if (disposed || !element.current) return;

        map = L.map(element.current, { scrollWheelZoom: false, zoomControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        const bounds = L.latLngBounds([]);
        route.features.forEach((feature) => {
          const coordinates = feature.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
          const line = L.polyline(coordinates, {
            color: feature.properties.color,
            weight: 4,
            opacity: 0.68,
            lineJoin: 'round',
          }).addTo(map!);
          bounds.extend(line.getBounds());
        });

        geotagged.forEach((item) => {
          const marker = L.circleMarker([item.latitude!, item.longitude!], {
            radius: 8,
            color: '#fffdf8',
            weight: 3,
            fillColor: item.mediaKind === 'video' ? '#396b67' : '#d9572b',
            fillOpacity: 1,
          }).addTo(map!);
          marker.bindTooltip(escapeHtml(item.caption || item.originalName), { direction: 'top' });
          marker.on('click', () => onSelect(item));
          bounds.extend(marker.getLatLng());
        });

        if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
      } catch {
        if (!disposed) setFailed(true);
      }
    }

    void render();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [geotagged, onSelect]);

  return (
    <div className="cheese-map-shell">
      {failed ? (
        <div className="absolute inset-0 z-10 grid place-items-center p-8 text-center">
          <div><MapPin className="mx-auto size-7 text-[#d9572b]" /><p className="mt-3 font-semibold">The memory map could not load.</p></div>
        </div>
      ) : null}
      <div ref={element} className="absolute inset-0" aria-label="Fondue Tour route with geotagged photos and videos" />
      <p className="cheese-map-count">{geotagged.length} mapped {geotagged.length === 1 ? 'memory' : 'memories'}</p>
    </div>
  );
}
