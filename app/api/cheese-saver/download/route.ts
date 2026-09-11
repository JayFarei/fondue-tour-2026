import { createZipArchive } from '@/lib/cheese-saver/zip';
import {
  apiResponse,
  bindings,
  consumeRateLimit,
  requireUnlocked,
  unauthorized,
} from '@/lib/cheese-saver/server';

const MAXIMUM_DOWNLOADS_PER_HOUR = 20;
const MAXIMUM_PREFLIGHTS_PER_HOUR = 60;
const DOWNLOAD_WINDOW_SECONDS = 60 * 60;

type DownloadRow = {
  objectKey: string;
  originalName: string;
  byteSize: number;
  capturedAt: string | null;
  uploadedAt: string;
};

async function prepareArchive() {
  const rows = await bindings().DB.prepare(
    `SELECT object_key AS objectKey,
            original_name AS originalName,
            byte_size AS byteSize,
            captured_at AS capturedAt,
            uploaded_at AS uploadedAt
       FROM cheese_media
      ORDER BY COALESCE(captured_at, uploaded_at) ASC, uploaded_at ASC`,
  ).all<DownloadRow>();

  const sources = [];
  for (const item of rows.results) {
    const stored = await bindings().MEDIA.head(item.objectKey);
    if (!stored || stored.size !== item.byteSize) throw new Error('ARCHIVE_SOURCE_INVALID');
    sources.push({
      name: item.originalName,
      size: item.byteSize,
      modifiedAt: item.capturedAt || item.uploadedAt,
      open: async () => (await bindings().MEDIA.get(item.objectKey))?.body ?? null,
    });
  }
  return createZipArchive(sources);
}

function downloadHeaders(contentLength: number) {
  const date = new Date().toISOString().slice(0, 10);
  return {
    'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="fondue-tour-cheese-saver-${date}.zip"`,
    'content-length': String(contentLength),
    'content-type': 'application/zip',
    'x-content-type-options': 'nosniff',
  };
}

function downloadError(error: unknown) {
  if (error instanceof Error && error.message === 'ARCHIVE_TOO_LARGE') {
    return apiResponse({ error: 'ARCHIVE_TOO_LARGE', message: 'The full gallery is too large for one ZIP file.' }, { status: 413 });
  }
  return apiResponse({ error: 'DOWNLOAD_FAILED', message: 'The ZIP file could not be prepared.' }, { status: 500 });
}

function limitResponse() {
  return apiResponse({ error: 'DOWNLOAD_LIMIT', message: 'Too many full-gallery downloads. Try again later.' }, { status: 429 });
}

export async function HEAD(request: Request) {
  if (!(await requireUnlocked(request))) return unauthorized();
  const rate = await consumeRateLimit(request, 'download-preflight', MAXIMUM_PREFLIGHTS_PER_HOUR, DOWNLOAD_WINDOW_SECONDS);
  if (rate.blocked) return limitResponse();
  try {
    const archive = await prepareArchive();
    return new Response(null, { headers: downloadHeaders(archive.contentLength) });
  } catch (error) {
    return downloadError(error);
  }
}

export async function GET(request: Request) {
  if (!(await requireUnlocked(request))) return unauthorized();
  const rate = await consumeRateLimit(request, 'download', MAXIMUM_DOWNLOADS_PER_HOUR, DOWNLOAD_WINDOW_SECONDS);
  if (rate.blocked) return limitResponse();
  try {
    const archive = await prepareArchive();
    return new Response(archive.body, { headers: downloadHeaders(archive.contentLength) });
  } catch (error) {
    return downloadError(error);
  }
}
