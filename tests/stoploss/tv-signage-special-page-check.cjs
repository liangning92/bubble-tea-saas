const {
  chromium,
  expect,
} = require("@playwright/test"),
  http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve("server/public/tv"),
  out =
    process.env.TV_SPECIAL_EVIDENCE || "/tmp/tv-special-evidence";
fs.mkdirSync(out, { recursive: true });
let apiCalls = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    apiCalls++;
    res.writeHead(500);
    return res.end();
  }
  if (url.pathname.startsWith("/product-")) {
    res.setHeader("Content-Type", "image/svg+xml");
    return res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="900"><rect width="700" height="900" fill="#f4c7d2"/></svg>',
    );
  }
  const file = path.join(
    root,
    url.pathname.replace(/^\/tv\//, "") || "index.html",
  );
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.setHeader(
    "Content-Type",
    file.endsWith(".js")
      ? "application/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  res.end(fs.readFileSync(file));
});
(async () => {
  let browser;
  try {
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "http://127.0.0.1:" + server.address().port + "/tv/?preview=1",
    );
    const today = new Date().getDay(),
      other = (today + 3) % 7;
    const snapshot = {
      screen: { isActive: true },
      settings: {
        orientation: "landscape",
        themeStyle: "international_dark",
        layoutTemplate: "product_catalog",
        safeAreaPadding: 1.5,
        showActivities: true,
        activityDisplayType: "all",
        musicEnabled: false,
        pageSeconds: 1,
        mediaIntervalSeconds: 2,
        marqueeText: "Welcome",
        marqueeSpeed: 3,
      },
      store: {
        name: "YOUME",
        locale: "id",
        timezone: "Asia/Jakarta",
        currency: "IDR",
      },
      channel: { name: "Dine in" },
      menu: [
        {
          id: "p1",
          name: "Peach Sundae",
          category: "Es Krim",
          image: "/product-1.svg",
          specs: [{ name: "Default", basePrice: 16000, displayPrice: 16000 }],
        },
        {
          id: "p2",
          name: "Matcha MilkShake",
          category: "Es Krim",
          image: "/product-2.svg",
          specs: [{ name: "Default", basePrice: 16000, displayPrice: 16000 }],
        },
        {
          id: "p3",
          name: "Lemon Black Tea",
          category: "Teh Buah",
          specs: [{ name: "Default", basePrice: 12000, displayPrice: 12000 }],
        },
      ],
      media: [],
      music: [],
      promotions: [],
      specials: [
        {
          id: "special-1",
          name: "Menu Spesial Harian",
          description: "Setiap Senin & Jumat",
          weekdays: [today],
          dailyStart: "00:00",
          dailyEnd: "23:59",
          timezone: "Asia/Jakarta",
          products: [
            {
              id: "p1",
              name: "Peach Sundae",
              image: "/product-1.svg",
              originalPrice: 16000,
              specialPrice: 12000,
              saving: 4000,
            },
          ],
          upcoming: {
            date: "2026-10-23",
            weekday: 5,
            products: [
              {
                id: "p1",
                name: "Peach Sundae",
                image: "/product-1.svg",
                originalPrice: 16000,
                specialPrice: 12000,
                saving: 4000,
              },
            ],
          },
        },
      ],
      assets: [],
      version: "a".repeat(64),
      serverTime: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86400000).toISOString(),
    };
    const apply = async () => {
      await page.evaluate(
        (s) => window.postMessage({ type: "tv-preview", snapshot: s }, location.origin),
        snapshot,
      );
      await page.waitForSelector("#specials .special-stage");
    };
    // A running daily special replaces the product menu with its own board.
    await apply();
    await expect(page.locator("#specials")).toBeVisible();
    await expect(page.locator("#content")).toBeHidden();
    await expect(page.locator(".special-head h2")).toHaveText("Menu Spesial Harian");
    await expect(page.locator(".special-badge")).toHaveText("Promo Harian");
    await expect(page.locator(".special-stage")).toBeVisible();
    await expect(page.locator(".special-card")).toHaveCount(0);
    const card = page.locator(".special-copy");
    assert.match(await card.innerText(), /Peach Sundae/);
    assert.match(await card.innerText(), /16\.000/);
    assert.match(await card.innerText(), /12\.000/);
    assert.match(await card.innerText(), /Hemat/);
    assert.match(await card.innerText(), /4\.000/);
    assert.equal(await page.locator(".special-photo img").count(), 1);
    assert.ok(
      await page.locator(".special-photo img").first().evaluate(
        (e) => e.complete && e.naturalWidth > 0,
      ),
    );
    // The single photo fills its column and the offer text stays on the right.
    const photo = await page.locator(".special-photo").boundingBox();
    const copy = await page.locator(".special-copy").boundingBox();
    assert.ok(photo.width > copy.width, "photo column should dominate");
    assert.ok(photo.height > 200, "photo should be large");
    await expect(page.locator(".promotion-preview")).toBeVisible();
    assert.match(await page.locator(".promotion-preview").innerText(), /Besok/);
    await page.screenshot({ path: path.join(out, "special-1920.png") });
    // The board keeps every card visible on tablet and phone widths.
    for (const [width, height] of [
      [1024, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await expect(page.locator(".special-stage")).toBeVisible();
      await page.screenshot({ path: path.join(out, "special-" + width + ".png") });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    // Outside the offer days the product menu returns and the preview stays visible.
    snapshot.specials[0].weekdays = [other];
    snapshot.version = "b".repeat(64);
    await page.evaluate(
      (s) => window.postMessage({ type: "tv-preview", snapshot: s }, location.origin),
      snapshot,
    );
    await expect(page.locator("#specials")).toBeHidden();
    await expect(page.locator("#content")).toBeVisible();
    await expect(page.locator(".catalog-product")).toHaveCount(3);
    await expect(page.locator("#promotions .promotion-preview")).toBeVisible();
    await page.screenshot({ path: path.join(out, "menu-1920.png") });
    // A snapshot without specials keeps the original product-only screen.
    snapshot.specials = [];
    snapshot.version = "c".repeat(64);
    await page.evaluate(
      (s) => window.postMessage({ type: "tv-preview", snapshot: s }, location.origin),
      snapshot,
    );
    await expect(page.locator("#specials")).toBeHidden();
    await expect(page.locator(".catalog-product")).toHaveCount(3);
    assert.equal(apiCalls, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS daily special board replaces the product menu while running, shows original price, special price, saving and the next-day preview, and restores the product menu afterwards",
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
