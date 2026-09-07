import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { directionsUrl, routeParts } from '../lib/navigation.ts';
const plans = JSON.parse(await readFile('data/tour-routes.json', 'utf8'));
const html = await readFile('dist-static/index.html', 'utf8');
const links = new Set(
  [...html.matchAll(/href="(https:\/\/www\.google\.com\/maps\/[^\"]+)"/g)].map(
    (m) => m[1].replaceAll('&amp;', '&'),
  ),
);
for (const plan of plans) {
  routeParts(plan.stops).forEach((p) => links.add(p.href));
  plan.stops.forEach((_, i) =>
    links.add(directionsUrl(plan.stops.slice(i, i + 2))),
  );
}
const pending = [...links];
const results = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (pending.length) {
      const url = pending.shift();
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
        });
        const body = await response.text();
        const restricted =
          /unusual traffic|automated queries/i.test(body) ||
          new URL(response.url).hostname === 'consent.google.com';
        results.push({
          url,
          status: response.status,
          finalUrl: response.url,
          ok: response.ok && !restricted,
          restricted,
        });
      } catch (error) {
        results.push({ url, ok: false, error: error.message });
      }
    }
  }),
);
await mkdir('output/playwright', { recursive: true });
await writeFile(
  'output/playwright/maps-link-check.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
);
const failed = results.filter((r) => !r.ok);
console.log(
  JSON.stringify(
    { checked: results.length, passed: results.length - failed.length, failed },
    null,
    2,
  ),
);
if (failed.length) process.exitCode = 1;
