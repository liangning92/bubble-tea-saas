// Actual settings and display components; only HTTP boundaries use owned fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, expect } = require('@playwright/test');

(async () => {
  const { createServer } = await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')), 'dist/node/index.js')).href);
  const origin = 'http://127.0.0.1:6218';
  const brand = fs.readFileSync('client-admin/public/youme-logo-red.png');
  const whiteBrand = fs.readFileSync('client-admin/public/youme-logo-white.png');
  const config = {
    storeInfo: { storeName: 'Existing store', address: 'Existing address', phone: '08000', storeLogo: origin + '/images/global.png' },
    posReceipt: { storeLogo: origin + '/images/receipt.png', paperSize: '58mm', footer: 'Keep this footer', showLogo: true },
    hardwareSettings: { dualScreen: { enabled: true, autoSyncPromotions: false, idleLayout: { columns: [{ width: 100, content: 'logo' }] }, logoStyle: { variant: 'red', sources: { red: origin + '/images/screen.png' } } } },
  };
  const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {MemoryRouter} from 'react-router-dom';import '/client-admin/src/index.css';import i18n from '/client-admin/src/i18n';import {POSSettingsPage} from '/client-admin/src/pages/settings/POSSettingsPage';import {SettingsPage} from '/client-admin/src/pages/SettingsPage';
  const params=new URLSearchParams(location.search),mode=params.get('mode');const CustomerDisplayPage=mode==='customer'?(await import('/client-pos/src/pages/CustomerDisplayPage')).CustomerDisplayPage:null;window.electronAPI={onOrderUpdate:()=>()=>{},onOrderClear:()=>()=>{},onOrderComplete:()=>()=>{},onPaymentQr:()=>()=>{}};
  localStorage.setItem('pos_store_logo','${origin}/images/global.png');localStorage.setItem('dualScreenConfig',JSON.stringify({idleLayout:{columns:[{width:100,content:'logo'}]},logoStyle:{variant:params.get('color')||'red',sources:{red:'${origin}/images/red.png',white:'${origin}/images/white.png',black:'${origin}/images/black.png',custom:'${origin}/images/custom.png'}}}));
  await i18n.changeLanguage('en');createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={['/settings']}>{mode==='store'?<SettingsPage/>:mode==='customer'?<CustomerDisplayPage/>:<POSSettingsPage initialTab={mode==='display'?'display':'receipt'}/>}</MemoryRouter></QueryClientProvider>);`;
  const tw = (await import(pathToFileURL(path.resolve('client-admin/tailwind.config.js')).href)).default;
  tw.content = [path.resolve('client-admin/src/**/*.{ts,tsx}'), path.resolve('client-pos/src/**/*.{ts,tsx}'), path.resolve('shared/**/*.{ts,tsx}')];
  const server = await createServer({ configFile: false, root: process.cwd(), publicDir: path.resolve('client-admin/public'), cacheDir: '/tmp/independent-logos-vite', css: { postcss: { plugins: [require('tailwindcss')(tw), require('autoprefixer')()] } }, server: { host: '127.0.0.1', port: 6218, strictPort: true }, plugins: [{ name: 'owned-logo-fixture', resolveId(id) { if (id === '/__logos.tsx') return id; }, load(id) { if (id === '/__logos.tsx') return fixture; }, configureServer(s) { s.middlewares.use((req, res, next) => { if (!req.url.startsWith('/logos')) return next(); res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script type="module" src="/__logos.tsx"></script>'); }); } }] });
  let browser;
  try {
    await server.listen(); browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const writes = [], files = new Map(), errors = [];
    let failSave = false;
    await context.addInitScript(() => {
      localStorage.setItem('bubble-tea-language', 'en');
      sessionStorage.setItem('auth-storage', JSON.stringify({ state: { token: 'synthetic-only', isAuthenticated: true, user: { id: 'fixture', role: 'manager', storeId: 'store-fixture' } }, version: 0 }));
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/images/') || files.has(url.pathname)) return route.fulfill({ status: 200, contentType: 'image/png', body: files.get(url.pathname) || (url.pathname.includes('white') ? whiteBrand : url.pathname.includes('black') ? [...files.values()][0] || brand : brand) });
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data = {}, status = 200;
      if (url.pathname === '/api/config') {
        if (request.method() === 'GET') assert.equal(url.searchParams.get('storeId'), 'store-fixture', 'Settings must read the intended store, not global defaults');
        if (request.method() === 'POST') {
          const body = request.postDataJSON(); assert.equal(body.storeId, 'store-fixture'); writes.push(body);
          if (failSave) status = 500; else config[body.key] = body.value;
        }
        data = config;
      } else if (url.pathname === '/api/config/batch') assert.fail('Logo editing must never use shared/global config writes');
      else if (url.pathname === '/api/receipt-templates') data = [{ id: 'template', name: 'Synthetic template', isDefault: true, content: JSON.stringify({ paperSize: '58mm', blocks: [{ id: 'logo', type: 'logo', enabled: true, order: 0, config: { width: 120, url: origin + '/images/obsolete-override.png' }, style: { align: 'center' } }] }) }];
      else if (url.pathname === '/api/upload/receipt') {
        const body = request.postDataBuffer(); assert.ok(body.includes(Buffer.from('name="receipts"')));
        const image = body.subarray(body.indexOf('\r\n\r\n') + 4, body.lastIndexOf('\r\n--'));
        assert.equal(image.subarray(1, 4).toString(), 'PNG');
        const filePath = `/uploads/receipts/fixture-${files.size}.png`; files.set(filePath, image); data = { urls: [filePath] };
      } else if (request.method() !== 'GET') assert.fail('Unexpected mutation: ' + url.pathname);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, data, message: status === 500 ? 'Synthetic save refusal' : undefined }) });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.dismiss());
    const untouchedStore = structuredClone(config.storeInfo), untouchedScreen = structuredClone(config.hardwareSettings);
    await page.goto(origin + '/logos?mode=receipt');
    await page.getByRole('button', { name: 'Receipt Logo Settings', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const whiteMask = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4; const c = canvas.getContext('2d'); c.fillStyle = 'white'; c.fillRect(1, 1, 2, 2); return canvas.toDataURL('image/png').split(',')[1]; });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'white-transparent-logo.png', mimeType: 'image/png', buffer: Buffer.from(whiteMask, 'base64') });
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).toHaveCount(0);
    assert.equal(writes.length, 1); assert.equal(writes[0].key, 'posReceipt'); assert.equal(config.posReceipt.paperSize, '58mm'); assert.equal(config.posReceipt.footer, 'Keep this footer');
    assert.deepEqual(config.storeInfo, untouchedStore); assert.deepEqual(config.hardwareSettings, untouchedScreen);
    const savedReceipt = structuredClone(config.posReceipt);
    const ink = await page.evaluate(async url => { const image = await createImageBitmap(await (await fetch(url)).blob()); const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); const pixels = ctx.getImageData(0, 0, c.width, c.height).data; return [...pixels].filter((_, n) => n % 4 === 0).map((_, n) => [...pixels.slice(n * 4, n * 4 + 4)]); }, savedReceipt.storeLogo);
    assert.equal(ink.filter(p => p[3] === 255).length, 4); assert.ok(ink.every(p => p[3] === 0 || p.slice(0, 3).every(v => v === 0)));
    console.log('PASS receipt upload: transparent white artwork becomes visible black ink; receipt settings retained; store/display untouched');

    await page.goto(origin + '/logos?mode=display');
    const button = page.getByRole('button', { name: 'Customer Display Logo Settings', exact: true }); try { await button.waitFor({ state: 'attached', timeout: 5000 }); } catch (error) { console.error(await page.locator('body').innerText()); console.error(errors); throw error; }
    await button.click(); dialog = page.getByRole('dialog');
    await dialog.locator('select').selectOption('white'); await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).toHaveCount(0);
    assert.equal(writes.at(-1).key, 'hardwareSettings'); assert.deepEqual(config.posReceipt, savedReceipt); assert.deepEqual(config.storeInfo, untouchedStore);
    assert.ok(config.hardwareSettings.dualScreen.logoStyle.sources.white); assert.equal(config.hardwareSettings.dualScreen.stateAppearance.idle.logoStyle.variant, 'white');
    console.log('PASS display logo: separate white variant saved without changing receipt or store');

    await page.goto(origin + '/logos?mode=store'); await expect(page.locator('input').first()).toHaveValue('Existing store');
    await page.locator('input').first().fill('Changed name'); await page.getByRole('button', { name: /Save/ }).click();
    await page.getByRole('dialog').getByRole('button',{name:'Confirm save',exact:true}).click();
    await expect.poll(() => config.storeInfo.storeName).toBe('Changed name'); await page.waitForTimeout(100);
    assert.equal(config.storeInfo.address, 'Existing address'); assert.deepEqual(config.posReceipt, savedReceipt); assert.equal(writes.at(-1).key, 'storeInfo');
    console.log('PASS store save: correct response envelope loaded; unrelated receipt logo, footer, paper size not overwritten');

    await page.goto(origin + '/logos?mode=receipt'); await page.getByRole('button', { name: /Advanced.*Template/ }).click();
    try { await page.getByText(/^(Logo|posSettings\.blockLogo)$/).last().click({timeout:5000}); } catch (error) { console.error(await page.locator('body').innerText()); console.error(errors); throw error; }
    await expect(page.getByRole('img', { name: 'Current Logo', exact: true })).toHaveAttribute('src', savedReceipt.storeLogo);
    const name = page.locator('input').filter({ visible: true }).first(); await name.fill('Keep unsaved template edit');
    await page.getByRole('button', { name: 'Receipt Logo Settings', exact: true }).click(); dialog = page.getByRole('dialog');
    failSave = true; await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog.getByRole('alert')).toBeVisible();
    assert.deepEqual(config.posReceipt, savedReceipt); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(name).toHaveValue('Keep unsaved template edit');
    console.log('PASS designer: independent receipt logo beats obsolete overrides; logo dialogue preserves unsaved edits; save refusal retains old config');

    for (const color of ['red', 'white', 'black', 'custom']) {
      await page.goto(origin + '/logos?mode=customer&color=' + color);
      await expect(page.getByRole('img', { name: 'Logo', exact: true })).toHaveAttribute('src', origin + '/images/' + color + '.png');
      console.log('PASS real customer display selects its own ' + color + ' source, ignoring receipt/global logo');
    }
    assert.deepEqual(errors, []); await context.close();
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
