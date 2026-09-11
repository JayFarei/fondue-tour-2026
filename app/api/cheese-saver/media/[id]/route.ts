import { apiResponse, bindings, requireUnlocked, unauthorized } from '@/lib/cheese-saver/server';

type MediaLocation = { objectKey: string; originalName: string; contentType: string };

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
    'SELECT object_key AS objectKey, original_name AS originalName, content_type AS contentType FROM cheese_media WHERE id = ?',
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
    'cache-control': 'private, max-age=300',
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
