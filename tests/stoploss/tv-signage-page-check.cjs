const { chromium } = require("@playwright/test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  http = require("node:http"),
  path = require("node:path");
const videoPath=path.resolve('tests/fixtures/tv-long-video.mp4');
const video = fs.readFileSync(videoPath);
const root = path.resolve("server/public/tv");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=",
  "base64",
);
const digest = require("node:crypto")
  .createHash("sha256")
  .update(png)
  .digest("hex");
const server = http.createServer((req, res) => {
  if (new URL(req.url,'http://localhost').pathname === "/uploads/video.mp4") {
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");
    if (req.headers.range) {
      const match = req.headers.range.match(/bytes=(\d+)-(\d*)/),
        start = Number(match[1]),
        end = match[2] ? Number(match[2]) : video.length - 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${video.length}`,
        "Content-Length": end - start + 1,
      });
      return res.end(video.subarray(start, end + 1));
    }
    return res.end(video);
  }
  if (new URL(req.url,'http://localhost').pathname === "/uploads/test.png") {
    res.setHeader("Content-Type", "image/png");
    return res.end(png);
  }
  const file = path.join(
    root,
    req.url.split("?")[0].replace("/tv/", "") || "index.html",
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
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data:;media-src 'self';connect-src 'self'",
  );
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch();
  try {
    const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let offline = false;
    const data = {
      screen: { id: "screen", isActive: true },
      settings: {
        orientation: "landscape",
        themeStyle: "international_dark",
        layoutTemplate: "split_media_menu",
        safeAreaPadding: 1.5,
        mediaFitMode: "contain_blur",
        mediaIntervalSeconds: 30,
        pageSeconds: 12,
        showActivities: true,
        activityDisplayType: "all",
        musicEnabled: false,
        marqueeText: "Welcome",
        marqueeSpeed: 3,
      },
      store: {
        name: "Synthetic TV",
        locale: "en",
        currency: "IDR",
        timezone: "Asia/Jakarta",
      },
      channel: { name: "Dine in" },
      menu: Array.from({ length: 10 }, (_, i) => ({
        id: "p" + i,
        name: "Tea " + i,
        category: "Tea",
        specs: [
          {
            name: "Regular",
            basePrice: 15500,
            displayPrice: 12345,
            activityId: "promo",
          },
        ],
      })),
      media: [
        { url: "/uploads/test.png", kind: "image", name: "First" },
        { url: "/uploads/test.png", kind: "image", name: "Second" },
      ],
      music: [],
      promotions: [
        {
          id: "promo",
          name: "Special",
          description: "Valid price",
          weekdays: [],
          timezone: "Asia/Jakarta",
          endsAt: new Date(Date.now() + 5000).toISOString(),
        },
      ],
      assets: [
        {
          url: "/uploads/test.png",
          kind: "image",
          size: png.length,
          sha256: digest,
        },
      ],
      version: "a".repeat(64),
      serverTime: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86400000).toISOString(),
    };
    await page.route("**/api/tv/device/content", (r) =>
      offline
        ? r.abort()
        : r.fulfill({
            json: {
              success: true,
              data: {
                ...data,
                serverTime: new Date().toISOString(),
                validUntil: new Date(Date.now() + 86400000).toISOString(),
              },
            },
          }),
    );
    await page.route("**/api/tv/device/heartbeat", (r) =>
      r.fulfill({ json: { success: true, data: {} } }),
    );
    await page.route("**/api/tv/device/events", (r) =>
      r.fulfill({ json: { success: true, data: [] } }),
    );
    await page.route("**/*.svg", (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="pink"/></svg>',
      }),
    );
    await page.addInitScript(() =>
      localStorage.setItem(
        "tv.identity",
        JSON.stringify({ token: "b".repeat(64) }),
      ),
    );
    await page.goto(base + "/tv/");
    await page.waitForSelector("#display:not([hidden])");
    assert.equal(await page.locator("article").count(), 8);
    assert.equal(await page.locator("#brand").textContent(), "Synthetic TV");
    // Media must retain its node after multiple content requests with unchanged version.
    await page.evaluate(() => {
      document.querySelector("#media img").dataset.stable = "retained";
    });
    await page.waitForTimeout(8500);
    assert.equal(
      await page.locator("#media img").getAttribute("data-stable"),
      "retained",
    );
    assert.equal(await page.locator("#promotions").textContent(), "");
    data.version = "c".repeat(64);
    data.media = [
      { url: "/uploads/video.mp4", kind: "video", name: "Continuous video" },
    ];
    data.assets = [
      {
        url: "/uploads/video.mp4",
        kind: "video",
        size: video.length,
        sha256: require("node:crypto")
          .createHash("sha256")
          .update(video)
          .digest("hex"),
      },
    ];
    await page.waitForSelector("#media video");
    await page.evaluate(() => {
      document.querySelector("video").dataset.stable = "video-retained";
    });
    await page.waitForTimeout(9000);
    assert.equal(
      await page.locator("video").getAttribute("data-stable"),
      "video-retained",
    );
    assert.ok((await page.locator("video").evaluate((v) => v.currentTime)) > 8);
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem("tv.snapshot"));
      d.checkedAt = Date.now() - 25 * 3600000;
      window.TVTest.apply(d);
    });
    assert.equal(await page.locator("article p").count(), 0);
    assert.match(
      await page.locator("#network").textContent(),
      /Prices temporarily hidden/,
    );
    offline = true;
    await page.context().setOffline(true);
    await page.reload();
    await page.waitForSelector("#display:not([hidden])");
    assert.equal(await page.locator("#brand").textContent(), "Synthetic TV");
    assert.deepEqual(errors, []);
    console.log(
      "PASS TV page under CSP: product paging, unchanged-version media continuity, promotion expiry, 24h price hiding, cached reload with verified media and uninterrupted 16-second video",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));

  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  server.close();
});
