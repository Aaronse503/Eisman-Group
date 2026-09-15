/**
 * Signs in, then crawls every internal link reachable from the app shell.
 * Reports non-200 responses. Used to prove there are no broken nav items or
 * dead links before shipping.
 *
 *   node scripts/dev/crawl.mjs [--max 200] [--email x] [--password y]
 */
const base = process.env.BASE ?? 'http://localhost:3000';
const email = process.env.EMAIL ?? 'aaron@eismandigital.com';
const password = process.env.PASSWORD ?? 'ChangeMe123!';
const maxPages = Number(process.env.MAX ?? 250);
const seeds = process.argv.slice(2).filter((a) => a.startsWith('/'));

const login = await fetch(`${base}/api/auth/sign-in`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
  redirect: 'manual',
});
if (!login.ok) {
  console.error(`login failed ${login.status}: ${(await login.text()).slice(0, 300)}`);
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .join('; ');
if (!cookie) {
  console.error('no session cookie returned');
  process.exit(1);
}

const START = seeds.length
  ? seeds
  : [
      '/', '/companies', '/crm', '/crm/contacts', '/crm/organizations', '/crm/deals',
      '/tasks', '/calendar', '/finances', '/team', '/partnerships', '/investors',
      '/knowledge', '/reports', '/parfax', '/integrations', '/settings',
    ];

const queue = [...START];
const seen = new Set(queue);
const failures = [];
const ok = [];
let visited = 0;

const IGNORE = /^(mailto:|tel:|https?:|#|\/api\/)/;

while (queue.length && visited < maxPages) {
  const path = queue.shift();
  visited++;
  let res;
  try {
    res = await fetch(`${base}${path}`, { headers: { cookie }, redirect: 'manual' });
  } catch (err) {
    failures.push([path, 'fetch error', String(err)]);
    continue;
  }
  if (res.status >= 300 && res.status < 400) {
    ok.push([path, res.status]);
    continue;
  }
  const html = await res.text();
  if (res.status !== 200) {
    const digest = html.match(/"digest":"(\d+)"/)?.[1] ?? '';
    const msg = html.match(/<h2[^>]*>([^<]{0,160})</)?.[1] ?? '';
    failures.push([path, res.status, `${msg} ${digest}`.trim()]);
    continue;
  }
  ok.push([path, res.status]);

  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    let href = m[1];
    if (!href || IGNORE.test(href)) continue;
    href = href.replace(/&amp;/g, '&').split('#')[0];
    if (!href.startsWith('/')) continue;
    if (/^\/_next\//.test(href)) continue;
    if (!seen.has(href)) {
      seen.add(href);
      queue.push(href);
    }
  }
}

console.log(`Crawled ${visited} page(s); ${ok.length} ok, ${failures.length} failing.`);
if (failures.length) {
  console.log('\nFailures:');
  for (const [path, status, detail] of failures) console.log(`  ${status}  ${path}  ${detail ?? ''}`);
  process.exit(1);
}
