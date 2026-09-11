// Static hosts such as GitHub Pages serve a project site from a sub-path, so
// every hand-written absolute URL has to carry that prefix. next/image and
// next/link apply `basePath` themselves; these helpers cover the rest.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fondue-tour-2026.jayfarei.chatgpt.site';

export const cheeseSaverUrl = process.env.NEXT_PUBLIC_CHEESE_SAVER_URL
  ?? 'https://fondue-tour-2026.jayfarei.chatgpt.site/cheese-saver';

export function assetPath(path: string) {
  return `${basePath}${path}`;
}
