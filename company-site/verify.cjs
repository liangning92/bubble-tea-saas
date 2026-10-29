const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const url = process.argv[2];
assert(url && /^https?:\/\//.test(url), 'Supply the deployed website URL');
const output = path.resolve(process.argv[3] || 'output/lumba-website-checks');
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(__dirname, 'public/index.html'));
const publicCheck = process.env.LUMBA_PUBLIC_CHECK === '1';

(async () => {
  const response = await fetch(url);
  assert.equal(response.status, 200, 'Website must return HTTP 200');
  const received = Buffer.from(await response.arrayBuffer());
  if (!publicCheck) assert.deepEqual(received, source, 'Origin must serve exact committed HTML');
  assert(response.headers.get('content-security-policy'), 'Origin CSP must be present');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('cache-control') || '', /\bno-transform\b/, 'CDN must preserve the static payload without injecting analytics');
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  try {
    for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['phone', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [], externalRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text());
      });
      page.on('request', request => {
        if (new URL(request.url()).origin !== new URL(url).origin) externalRequests.push(request.url());
      });
      await page.goto(url, { waitUntil: 'networkidle' });
      const initial = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        overflow: document.documentElement.scrollWidth > innerWidth,
        forms: document.forms.length,
        fields: document.querySelectorAll('input,textarea,select').length,
        storage: localStorage.length + sessionStorage.length,
        draft: /\bdraft\b|\bdraf\b|Belum dipublikasikan/i.test(document.body.innerText),
        company: document.body.innerText.includes('PT LUMBA MERAH NIAGA INDONESIA'),
      }));
      assert.deepEqual(initial, { lang: 'id', overflow: false, forms: 0, fields: 0, storage: 0, draft: false, company: true });
      await page.screenshot({ path: path.join(output, `${name}-id.png`), fullPage: true });
      await page.getByRole('button', { name: 'English', exact: true }).click();
      const english = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        overflow: document.documentElement.scrollWidth > innerWidth,
        heading: document.querySelector('h1').innerText,
        pressed: document.querySelector('[data-set-language="en"]').getAttribute('aria-pressed'),
        visibleIndonesian: [...document.querySelectorAll('[data-language="id"]')].some(el => !el.hidden),
      }));
      assert.equal(english.lang, 'en');
      assert.equal(english.overflow, false);
      assert.equal(english.pressed, 'true');
      assert.equal(english.visibleIndonesian, false);
      assert(english.heading.includes('store management'));
      await page.screenshot({ path: path.join(output, `${name}-en.png`), fullPage: true });
      for (const target of ['services', 'company', 'privacy']) {
        await page.locator(`a[href="#${target}"]`).first().click();
        await page.waitForFunction(id => location.hash === '#' + id, target);
      }
      await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
      assert.equal(await page.locator('html').getAttribute('lang'), 'id');
      assert.deepEqual(errors, [], 'Browser errors or blocked page scripts');
      assert.deepEqual(externalRequests, [], 'Unexpected external resource requests');
      checks.push({ viewport: name, width, height, languages: ['id', 'en'], languageReturn: true, anchors: true, overflow: false, browserErrors: 0, externalRequests: 0 });
      for (const [file, heading] of [['youme-privacy.html', 'Kebijakan Privasi YOUME'], ['youme-data-deletion.html', 'Penghapusan Data YOUME']]) {
        const legalUrl = new URL(file, url).href;
        const legalResponse = await page.goto(legalUrl, { waitUntil: 'networkidle' });
        assert.equal(legalResponse.status(), 200);
        assert(await page.getByRole('heading', { name: heading, exact: true }).isVisible());
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Legal page overflow');
        assert(await page.locator('section[lang="en"]').isVisible(), 'English policy must be accessible');
        assert(await page.locator('a[href="mailto:kangningfushou@gmail.com"]').count() > 0);
        const styled = await page.locator('main').evaluate(el => getComputedStyle(el).maxWidth);
        assert.equal(styled, '860px', 'Legal stylesheet must load under CSP');
        await page.getByRole('link', { name: 'English', exact: true }).click();
        assert.equal(new URL(page.url()).hash, '#en');
        await page.screenshot({ path: path.join(output, `${name}-${file}.png`), fullPage: true });
      }
      assert.deepEqual(errors, [], 'Legal pages must not trigger browser/CSP errors');
      assert.deepEqual(externalRequests, [], 'Legal pages must not load third-party resources');
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const report = { status: 'passed', url, publicCheck, sourceHtmlSha256: crypto.createHash('sha256').update(source).digest('hex'), receivedHtmlSha256: crypto.createHash('sha256').update(received).digest('hex'), checks };
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
