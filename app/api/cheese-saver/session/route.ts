import { apiResponse, requireUnlocked } from '@/lib/cheese-saver/server';

export async function GET(request: Request) {
  return apiResponse({ unlocked: await requireUnlocked(request) });
}
