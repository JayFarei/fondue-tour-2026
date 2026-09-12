export const tourers = [
  { id: 'marco', name: 'Marco', portrait: '/brand/profiles/marco.webp', power: 'Cheese Saber', accent: '#f3bf2b' },
  { id: 'aris', name: 'Aris', portrait: '/brand/profiles/aris.webp', power: 'Fondue Forks', accent: '#4f81d9' },
  { id: 'si', name: 'Si', portrait: '/brand/profiles/simon.webp', power: 'Molten Shield', accent: '#dc6837' },
  { id: 'adrien', name: 'Adrien', portrait: '/brand/profiles/adrien.webp', power: 'Raclette Edge', accent: '#83a77f' },
  { id: 'gabriele', name: 'Gabriele', portrait: '/brand/profiles/gabriele.webp', power: 'Alpine Reactor', accent: '#3ca6a0' },
  { id: 'henry', name: 'Henry', portrait: '/brand/profiles/henry.webp', power: 'Steam Lance', accent: '#c3ced6' },
] as const;

export type TourerId = (typeof tourers)[number]['id'];

export function isTourerId(value: unknown): value is TourerId {
  return typeof value === 'string' && tourers.some((tourer) => tourer.id === value);
}

export function tourerFor(value: unknown) {
  return isTourerId(value) ? tourers.find((tourer) => tourer.id === value) ?? null : null;
}
