import { apiResponse, bindings, requireUnlocked, sameOrigin, unauthorized } from '@/lib/cheese-saver/server';
import type { TourerId } from '@/lib/tourers';

type MediaLocation = {
  id: string;
  objectKey: string;
  originalName: string;
  mediaKind: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
  caption: string | null;
  credit: string | null;
  authorId: TourerId | null;
  uploadedAt: string;
};

function safeFilename(value: string) {
  return value.replace(/["\\\r\n]/g, '_').slice(0, 180);
}

function requestedRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid' as const;
  let start = match[1] ? Number(match[1]) : Number.NaN;
  let end = match[2] ? Number(match[2]) : Number.NaN;
  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid' as const;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    if (!Number.isSafeInteger(start)) return 'invalid' as const;
    if (!Number.isSafeInteger(end)) end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return 'invalid' as const;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireUnlocked(request))) return unauthorized();
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiResponse({ error: 'NOT_FOUND' }, { status: 404 });

  const media = await bindings().DB.prepare(
    'SELECT id, object_key AS objectKey, original_name AS originalName, media_kind AS mediaKind, content_type AS contentType, byte_size AS byteSize, width, height, duration_seconds AS durationSeconds, captured_at AS capturedAt, latitude, longitude, location_source AS locationSource, caption, credit, author_id AS authorId, uploaded_at AS uploadedAt FROM cheese_media WHERE id = ?',
  ).bind(id).first<MediaLocation>();
  if (!media) return apiResponse({ error: 'NOT_FOUND' }, { status: 404 });

  const head = await bindings().MEDIA.head(media.objectKey);
  if (!head) return apiResponse({ error: 'NOT_FOUND' }, { status: 404 });

  const range = requestedRange(request.headers.get('range'), head.size);
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${head.size}` } });
  }

  const object = await bindings().MEDIA.get(media.objectKey, range ? { range } : undefined);
  if (!object) return apiResponse({ error: 'NOT_FOUND' }, { status: 404 });

  const headers = new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'content-type': media.contentType,
    'content-disposition': `inline; filename="${safeFilename(media.originalName)}"`,
    'x-content-type-options': 'nosniff',
  });
  if (range) {
    headers.set('content-length', String(range.length));
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
  } else {
    headers.set('content-length', String(head.size));
  }
  if (head.httpEtag) headers.set('etag', head.httpEtag);

  return new Response(object.body, { status: range ? 206 : 200, headers });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireUnlocked(request))) return unauthorized();
  if (!sameOrigin(request)) return apiResponse({ error: 'INVALID_ORIGIN' }, { status: 403 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiResponse({ error: 'NOT_FOUND' }, { status: 404 });

  const media = await bindings().DB.prepare(
    'SELECT id, object_key AS objectKey, original_name AS originalName, media_kind AS mediaKind, content_type AS contentType, byte_size AS byteSize, width, height, duration_seconds AS durationSeconds, captured_at AS capturedAt, latitude, longitude, location_source AS locationSource, caption, credit, author_id AS authorId, uploaded_at AS uploadedAt FROM cheese_media WHERE id = ?',
  ).bind(id).first<MediaLocation>();
  if (!media) return apiResponse({ error: 'NOT_FOUND' }, { status: 404 });

  try {
    await bindings().DB.prepare('DELETE FROM cheese_media WHERE id = ?').bind(id).run();
    try {
      await bindings().MEDIA.delete(media.objectKey);
    } catch {
      await bindings().DB.prepare(
        `INSERT OR IGNORE INTO cheese_media (
          id, object_key, original_name, media_kind, content_type, byte_size,
          width, height, duration_seconds, captured_at, latitude, longitude,
          location_source, caption, credit, author_id, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        media.id,
        media.objectKey,
        media.originalName,
        media.mediaKind,
        media.contentType,
        media.byteSize,
        media.width,
        media.height,
        media.durationSeconds,
        media.capturedAt,
        media.latitude,
        media.longitude,
        media.locationSource,
        media.caption,
        media.credit,
        media.authorId,
        media.uploadedAt,
      ).run();
      throw new Error('OBJECT_DELETE_FAILED');
    }
    return new Response(null, { status: 204 });
  } catch {
    return apiResponse({ error: 'DELETE_FAILED', message: 'This memory could not be deleted.' }, { status: 500 });
  }
}
