import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:3000';
const email = process.env.EMAIL ?? 'aaron@eismandigital.com';
const password = process.env.PASSWORD ?? 'ChangeMe123!';
const paths = process.argv.slice(2);
const outDir = process.env.OUT ?? '.data/shots';
const dark = process.env.THEME === 'dark';
const width = Number(process.env.W ?? 1440);
const height = Number(process.env.H ?? 900);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({
  viewport: { width, height },
  colorScheme: dark ? 'dark' : 'light',
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const res = await page.request.post(`${base}/api/auth/sign-in`, { data: { email, password } });
if (!res.ok()) { console.error('login failed', res.status(), await res.text()); process.exit(1); }

const fs = await import('node:fs/promises');
await fs.mkdir(outDir, { recursive: true });

for (const path of paths) {
  const name = (path === '/' ? 'home' : path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')) + (dark ? '-dark' : '');
  const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: process.env.FULL === '1' });
  console.log(`${response?.status()} ${path} → ${outDir}/${name}.png`);
}
if (errors.length) { console.log('\nConsole errors:'); for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e); }
await browser.close();
