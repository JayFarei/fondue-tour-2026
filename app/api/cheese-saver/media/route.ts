import { cleanText, finiteNumber, hasExpectedSignature, mediaTypes, type AcceptedMediaType } from '@/lib/cheese-saver/media';
import {
  apiResponse,
  bindings,
  rateLimitStatus,
  recordRateLimit,
  requireUnlocked,
  sameOrigin,
  unauthorized,
  type MediaRecord,
} from '@/lib/cheese-saver/server';

const MAXIMUM_UPLOADS_PER_HOUR = 60;
const UPLOAD_WINDOW_SECONDS = 60 * 60;

type UploadMetadata = {
  uploadId?: unknown;
  name?: unknown;
  size?: unknown;
  width?: unknown;
  height?: unknown;
  durationSeconds?: unknown;
  capturedAt?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  locationSource?: unknown;
  caption?: unknown;
  credit?: unknown;
  website?: unknown;
};

function decodeMetadata(request: Request) {
  const encoded = request.headers.get('x-cheese-metadata');
  if (!encoded || encoded.length > 4_096) throw new Error('INVALID_METADATA');
  return JSON.parse(decodeURIComponent(encoded)) as UploadMetadata;
}

function isoDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function wholeNumber(value: unknown, maximum: number) {
  const number = finiteNumber(value, 0, maximum);
  return number === null ? null : Math.round(number);
}

const mediaColumns = `id,
  original_name AS originalName,
  media_kind AS mediaKind,
  content_type AS contentType,
  byte_size AS byteSize,
  width,
  height,
  duration_seconds AS durationSeconds,
  captured_at AS capturedAt,
  latitude,
  longitude,
  location_source AS locationSource,
  caption,
  credit,
  uploaded_at AS uploadedAt`;

function mediaById(id: string) {
  return bindings().DB.prepare(`SELECT ${mediaColumns} FROM cheese_media WHERE id = ?`).bind(id).first<MediaRecord>();
}

export async function GET(request: Request) {
  if (!(await requireUnlocked(request))) return unauthorized();

  const rows = await bindings().DB.prepare(
    `SELECT ${mediaColumns}
       FROM cheese_media
      ORDER BY COALESCE(captured_at, uploaded_at) DESC, uploaded_at DESC`,
  ).all<MediaRecord>();

  return apiResponse({ media: rows.results });
}

export async function POST(request: Request) {
  if (!(await requireUnlocked(request))) return unauthorized();
  if (!sameOrigin(request)) return apiResponse({ error: 'INVALID_ORIGIN' }, { status: 403 });
  if (!request.body) return apiResponse({ error: 'EMPTY_UPLOAD', message: 'Choose a file to upload.' }, { status: 400 });

  let metadata: UploadMetadata;
  try {
    metadata = decodeMetadata(request);
  } catch {
    return apiResponse({ error: 'INVALID_METADATA', message: 'The file details could not be read.' }, { status: 400 });
  }

  if (typeof metadata.website === 'string' && metadata.website.trim()) {
    return apiResponse({ error: 'UPLOAD_REJECTED' }, { status: 400 });
  }

  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() as AcceptedMediaType;
  const accepted = mediaTypes[contentType];
  if (!accepted) {
    return apiResponse({ error: 'UNSUPPORTED_MEDIA', message: 'Use JPEG, PNG, WebP, GIF, HEIC, MP4, MOV or WebM.' }, { status: 415 });
  }

  const declaredSize = wholeNumber(metadata.size, Number.MAX_SAFE_INTEGER);
  if (declaredSize === null || declaredSize < 1 || declaredSize > accepted.maximum) {
    const limit = accepted.kind === 'image' ? '25 MB' : '100 MB';
    return apiResponse({ error: 'FILE_TOO_LARGE', message: `${accepted.kind === 'image' ? 'Images' : 'Videos'} must be ${limit} or smaller.` }, { status: 413 });
  }

  const uploadId = typeof metadata.uploadId === 'string' && /^[0-9a-f-]{36}$/i.test(metadata.uploadId)
    ? metadata.uploadId
    : crypto.randomUUID();
  const existing = await mediaById(uploadId);
  if (existing) return apiResponse({ media: existing }, { status: 200 });

  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = wholeNumber(Number(contentLengthHeader), Number.MAX_SAFE_INTEGER);
    if (contentLength === null || contentLength !== declaredSize) {
      return apiResponse({ error: 'SIZE_MISMATCH', message: 'The selected file size did not match the upload.' }, { status: 400 });
    }
  }

  const rate = await rateLimitStatus(request, 'upload', MAXIMUM_UPLOADS_PER_HOUR, UPLOAD_WINDOW_SECONDS);
  if (rate.blocked) {
    return apiResponse({ error: 'UPLOAD_LIMIT', message: 'This device has reached the hourly upload limit.' }, { status: 429 });
  }
  await recordRateLimit('upload', rate.subject, rate.now, UPLOAD_WINDOW_SECONDS);

  const id = uploadId;
  const now = new Date();
  const objectKey = `cheese-saver/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${accepted.extension}`;
  const originalName = cleanText(metadata.name, 180) ?? `Fondue Tour ${accepted.kind}`;

  try {
    await bindings().MEDIA.put(objectKey, request.body, {
      httpMetadata: { contentType },
      customMetadata: { mediaId: id },
    });

    const stored = await bindings().MEDIA.head(objectKey);
    if (!stored || stored.size < 1 || stored.size > accepted.maximum || stored.size !== declaredSize) {
      await bindings().MEDIA.delete(objectKey);
      return apiResponse({ error: 'SIZE_MISMATCH', message: 'The upload was incomplete or larger than allowed.' }, { status: 400 });
    }

    const signatureObject = await bindings().MEDIA.get(objectKey, { range: { offset: 0, length: Math.min(32, stored.size) } });
    const signatureBytes = signatureObject ? new Uint8Array(await signatureObject.arrayBuffer()) : new Uint8Array();
    if (!hasExpectedSignature(contentType, signatureBytes)) {
      await bindings().MEDIA.delete(objectKey);
      return apiResponse({ error: 'FILE_SIGNATURE_MISMATCH', message: 'That file does not match its image or video type.' }, { status: 415 });
    }

    const latitude = finiteNumber(metadata.latitude, -90, 90);
    const longitude = finiteNumber(metadata.longitude, -180, 180);
    const hasLocation = latitude !== null && longitude !== null;
    const locationSource = hasLocation && (metadata.locationSource === 'embedded' || metadata.locationSource === 'device')
      ? metadata.locationSource
      : null;
    const capturedAt = isoDate(metadata.capturedAt);
    const uploadedAt = now.toISOString();
    const width = wholeNumber(metadata.width, 100_000);
    const height = wholeNumber(metadata.height, 100_000);
    const durationSeconds = finiteNumber(metadata.durationSeconds, 0, 24 * 60 * 60);
    const caption = cleanText(metadata.caption, 280);
    const credit = cleanText(metadata.credit, 80);

    await bindings().DB.prepare(
      `INSERT INTO cheese_media (
        id, object_key, original_name, media_kind, content_type, byte_size,
        width, height, duration_seconds, captured_at, latitude, longitude,
        location_source, caption, credit, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      objectKey,
      originalName,
      accepted.kind,
      contentType,
      stored.size,
      width,
      height,
      durationSeconds,
      capturedAt,
      hasLocation ? latitude : null,
      hasLocation ? longitude : null,
      locationSource,
      caption,
      credit,
      uploadedAt,
    ).run();

    return apiResponse({
      media: {
        id,
        originalName,
        mediaKind: accepted.kind,
        contentType,
        byteSize: stored.size,
        width,
        height,
        durationSeconds,
        capturedAt,
        latitude: hasLocation ? latitude : null,
        longitude: hasLocation ? longitude : null,
        locationSource,
        caption,
        credit,
        uploadedAt,
      } satisfies MediaRecord,
    }, { status: 201 });
  } catch {
    const committed = await mediaById(id).catch(() => null);
    if (committed) return apiResponse({ media: committed }, { status: 200 });
    await bindings().MEDIA.delete(objectKey).catch(() => undefined);
    return apiResponse({ error: 'UPLOAD_FAILED', message: 'The upload did not finish. Please try again.' }, { status: 500 });
  }
}
