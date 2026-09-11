import {
  apiResponse,
  clearRateLimit,
  createSessionToken,
  passwordHash,
  rateLimitStatus,
  recordRateLimit,
  safeEqual,
  sameOrigin,
  sessionCookie,
  sha256Hex,
} from '@/lib/cheese-saver/server';

const MAXIMUM_FAILURES = 7;
const WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return apiResponse({ error: 'INVALID_ORIGIN' }, { status: 403 });

  try {
    const rate = await rateLimitStatus(request, 'unlock', MAXIMUM_FAILURES, WINDOW_SECONDS);
    if (rate.blocked) {
      return apiResponse(
        { error: 'TOO_MANY_ATTEMPTS', message: 'Too many tries. Wait 15 minutes before trying again.' },
        { status: 429, headers: { 'retry-after': String(WINDOW_SECONDS) } },
      );
    }

    const body = await request.json() as { password?: unknown; website?: unknown };
    const botFieldFilled = typeof body.website === 'string' && body.website.trim().length > 0;
    const suppliedHash = await sha256Hex(typeof body.password === 'string' ? body.password : '');
    const expectedHash = passwordHash();
    const matches = safeEqual(suppliedHash, expectedHash);

    if (botFieldFilled || !matches) {
      await recordRateLimit('unlock', rate.subject, rate.now, WINDOW_SECONDS);
      return apiResponse({ error: 'WRONG_PASSWORD', message: 'That password did not unlock Cheese Saver.' }, { status: 401 });
    }

    await clearRateLimit('unlock', rate.subject);
    const response = apiResponse({ unlocked: true });
    response.headers.set('set-cookie', sessionCookie(request, await createSessionToken()));
    return response;
  } catch {
    return apiResponse({ error: 'NOT_CONFIGURED', message: 'Cheese Saver is not configured yet.' }, { status: 503 });
  }
}
