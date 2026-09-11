import { apiResponse, expiredSessionCookie, sameOrigin } from '@/lib/cheese-saver/server';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return apiResponse({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const response = apiResponse({ unlocked: false });
  response.headers.set('set-cookie', expiredSessionCookie(request));
  return response;
}
