import type { TourerId } from '@/lib/tourers';

export const mediaTypes = {
  'image/jpeg': { kind: 'image', extension: 'jpg', maximum: 25 * 1024 * 1024 },
  'image/png': { kind: 'image', extension: 'png', maximum: 25 * 1024 * 1024 },
  'image/webp': { kind: 'image', extension: 'webp', maximum: 25 * 1024 * 1024 },
  'image/gif': { kind: 'image', extension: 'gif', maximum: 25 * 1024 * 1024 },
  'image/heic': { kind: 'image', extension: 'heic', maximum: 25 * 1024 * 1024 },
  'image/heif': { kind: 'image', extension: 'heif', maximum: 25 * 1024 * 1024 },
  'video/mp4': { kind: 'video', extension: 'mp4', maximum: 100 * 1024 * 1024 },
  'video/quicktime': { kind: 'video', extension: 'mov', maximum: 100 * 1024 * 1024 },
  'video/webm': { kind: 'video', extension: 'webm', maximum: 100 * 1024 * 1024 },
} as const;

export type AcceptedMediaType = keyof typeof mediaTypes;

export type MediaRecord = {
  id: string;
  originalName: string;
  mediaKind: 'image' | 'video';
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: 'embedded' | 'device' | null;
  caption: string | null;
  credit: string | null;
  authorId: TourerId | null;
  uploadedAt: string;
};

function startsWith(bytes: Uint8Array, expected: number[], offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function hasExpectedSignature(contentType: AcceptedMediaType, bytes: Uint8Array) {
  if (contentType === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === 'image/png') return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6));
  if (contentType === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
  if (contentType === 'video/webm') return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);

  const isIsoMedia = ascii(bytes, 4, 4) === 'ftyp';
  if (!isIsoMedia) return false;
  const brand = ascii(bytes, 8, 4);
  if (contentType === 'image/heic' || contentType === 'image/heif') {
    return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
  }
  return contentType === 'video/mp4' || contentType === 'video/quicktime';
}

export function cleanText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return null;
  const clean = Array.from(value.trim(), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? ' ' : character;
  }).join('');
  return clean ? clean.slice(0, maximum) : null;
}

export function finiteNumber(value: unknown, minimum: number, maximum: number) {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}
