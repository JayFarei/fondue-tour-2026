import { isTourerId, type TourerId } from '@/lib/tourers';

export const tourGalleryDays = [
  { key: '2026-09-08', label: 'Warm-up', dateLabel: 'Tue 8 Sep' },
  { key: '2026-09-09', label: 'Day 1', dateLabel: 'Wed 9 Sep' },
  { key: '2026-09-10', label: 'Day 2', dateLabel: 'Thu 10 Sep' },
  { key: '2026-09-11', label: 'Day 3', dateLabel: 'Fri 11 Sep' },
  { key: '2026-09-12', label: 'Day 4', dateLabel: 'Sat 12 Sep' },
  { key: '2026-09-13', label: 'Day 5', dateLabel: 'Sun 13 Sep' },
] as const;

export type TourGalleryDay = (typeof tourGalleryDays)[number]['key'];
export type GalleryDayFilter = 'all' | 'other' | TourGalleryDay;
export type GalleryAuthorFilter = 'all' | 'unknown' | TourerId;
export type GalleryFilter = {
  day: GalleryDayFilter;
  author: GalleryAuthorFilter;
  excludeAuthor: boolean;
};

export const allGalleryFilter: GalleryFilter = { day: 'all', author: 'all', excludeAuthor: false };
export const tourGalleryDayKeys = new Set<string>(tourGalleryDays.map((day) => day.key));

const galleryDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type FilterableMedia = {
  capturedAt: string | null;
  uploadedAt: string;
  authorId: TourerId | null;
};

export function mediaDayKey(item: Pick<FilterableMedia, 'capturedAt' | 'uploadedAt'>) {
  const date = new Date(item.capturedAt || item.uploadedAt);
  if (Number.isNaN(date.valueOf())) return 'other';
  const parts = Object.fromEntries(galleryDateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function filterGalleryMedia<T extends FilterableMedia>(media: T[], filter: GalleryFilter) {
  return media.filter((item) => {
    const dayKey = mediaDayKey(item);
    const matchesDay = filter.day === 'all'
      || (filter.day === 'other' ? !tourGalleryDayKeys.has(dayKey) : dayKey === filter.day);
    if (!matchesDay) return false;
    if (filter.author === 'all') return true;
    const matchesAuthor = filter.author === 'unknown' ? !isTourerId(item.authorId) : item.authorId === filter.author;
    return filter.excludeAuthor ? !matchesAuthor : matchesAuthor;
  });
}

export function galleryFilterFromSearchParams(params: URLSearchParams): GalleryFilter | null {
  const dayValue = params.get('day') ?? 'all';
  const day = dayValue === 'all' || dayValue === 'other' || tourGalleryDayKeys.has(dayValue)
    ? dayValue as GalleryDayFilter
    : null;
  const authorValue = params.get('author') ?? 'all';
  const author = authorValue === 'all' || authorValue === 'unknown' || isTourerId(authorValue)
    ? authorValue as GalleryAuthorFilter
    : null;
  const authorMode = params.get('authorMode') ?? 'only';
  if (!day || !author || (authorMode !== 'only' && authorMode !== 'exclude')) return null;
  return { day, author, excludeAuthor: author !== 'all' && authorMode === 'exclude' };
}

export function galleryFilterSearchParams(filter: GalleryFilter) {
  const params = new URLSearchParams();
  if (filter.day !== 'all') params.set('day', filter.day);
  if (filter.author !== 'all') {
    params.set('author', filter.author);
    if (filter.excludeAuthor) params.set('authorMode', 'exclude');
  }
  return params;
}
