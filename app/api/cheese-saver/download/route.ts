import { createZipArchive } from '@/lib/cheese-saver/zip';
import {
  apiResponse,
  bindings,
  requireUnlocked,
  unauthorized,
} from '@/lib/cheese-saver/server';

type DownloadRow = {
  objectKey: string;
  originalName: string;
  byteSize: number;
  capturedAt: string | null;
  uploadedAt: string;
};

export async function GET(request: Request) {
  if (!(await requireUnlocked(request))) return unauthorized();

  const rows = await bindings()
    .DB.prepare(
      `SELECT object_key AS objectKey,
            original_name AS originalName,
            byte_size AS byteSize,
            captured_at AS capturedAt,
            uploaded_at AS uploadedAt
       FROM cheese_media
      ORDER BY COALESCE(captured_at, uploaded_at) ASC, uploaded_at ASC`,
    )
    .all<DownloadRow>();

  try {
    const archive = createZipArchive(
      rows.results.map((item) => ({
        name: item.originalName,
        size: item.byteSize,
        modifiedAt: item.capturedAt || item.uploadedAt,
        open: async () =>
          (await bindings().MEDIA.get(item.objectKey))?.body ?? null,
      })),
    );
    const date = new Date().toISOString().slice(0, 10);
    return new Response(archive.body, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': `attachment; filename="fondue-tour-cheese-saver-${date}.zip"`,
        'content-length': String(archive.contentLength),
        'content-type': 'application/zip',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ARCHIVE_TOO_LARGE') {
      return apiResponse(
        {
          error: 'ARCHIVE_TOO_LARGE',
          message: 'The full gallery is too large for one ZIP file.',
        },
        { status: 413 },
      );
    }
    return apiResponse(
      {
        error: 'DOWNLOAD_FAILED',
        message: 'The ZIP file could not be prepared.',
      },
      { status: 500 },
    );
  }
}
