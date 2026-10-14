// Real production React bundle, owned API fixtures; never touches store data.
const { chromium, expect } = require("@playwright/test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
(async () => {
  let browser;
  const root = path.resolve(process.env.ADMIN_UI_BUILD || "client-admin/dist"),
    out =
      process.env.ADMIN_UI_EVIDENCE || "/tmp/admin-ui-optimization-evidence";
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    let file = path.join(root, new URL(req.url, "http://localhost").pathname);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile())
      file = path.join(root, "index.html");
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const settings = {
    inherit: false,
    channelId: "",
    orientation: "landscape",
    layoutTemplate: "split_media_menu",
    themeStyle: "international_dark",
    safeAreaPadding: 1.5,
    mediaFitMode: "contain_blur",
    mediaIntervalSeconds: 8,
    selectedMediaIds: [],
    selectedCategoryIds: [],
    selectedProductIds: [],
    selectedSpecIds: [],
    showActivities: true,
    activityDisplayType: "all",
    marqueeText: "",
    marqueeSpeed: 3,
    musicIds: [],
    musicEnabled: false,
    volume: 0.4,
    pageSeconds: 12,
  };
  let defaults = settings,
    info = {
      storeName: "Synthetic",
      storeCode: "SYN",
      address: "",
      phone: "",
      email: "",
      storeLogo: "",
      timezone: "Asia/Jakarta",
      dateFormat: "YYYY-MM-DD",
    },
    writes = [],
    fail = false, releaseAccountWrite;
  let prices = [
    {
      productId: "p1",
      productName: "Tea One",
      productCode: "T1",
      category: "Tea",
      basePrice: 20000,
      finalPrice: 20000,
      priceAdjustment: 1,
      enabled: true,
    },
    {
      productId: "p2",
      productName: "Tea Two",
      productCode: "T2",
      category: "Tea",
      basePrice: 30000,
      finalPrice: 30000,
      priceAdjustment: 1,
      enabled: false,
    },
  ];
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await context.addInitScript(() => {
      localStorage.setItem("bubble-tea-language", "en");
      sessionStorage.setItem(
        "auth-storage",
        JSON.stringify({
          state: {
            isAuthenticated: true,
            token: "synthetic",
            user: { id: "owner", role: "admin", storeId: "synthetic-store" },
          },
          version: 0,
        }),
      );
    });
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith("/uploads/"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#fce4ea"/></svg>',
        });
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const p = url.pathname;
      let data = {};
      if (req.method() !== "GET") {
        writes.push({ path: p, body: req.postDataJSON() });
        if (p === "/api/finance/accounts") {
          await new Promise(resolve => { releaseAccountWrite = resolve });
          return route.fulfill({ status: 500, json: { message: "Synthetic save failed" } });
        }
        if (p === "/api/tv/defaults") defaults = req.postDataJSON();
        if (p === "/api/config") info = req.postDataJSON().value;
        if (p.startsWith("/api/channels/dine/products/")) {
          if (fail)
            return route.fulfill({
              status: 500,
              json: { message: "Synthetic save failed" },
            });
          const id = p.split("/").at(-1),
            body = req.postDataJSON();
          prices = prices.map((row) =>
            row.productId === id
              ? {
                  ...row,
                  ...body,
                  finalPrice: Math.round(row.basePrice * body.priceAdjustment),
                }
              : row,
          );
        }
      }
      if (p === "/api/finance/accounts/types") data = { list: [{ key: "expense", label: "Expense", icon: "FileText", color: "text-gray-600", bgColor: "bg-gray-100" }] };
      else if (p === "/api/config") data = { storeInfo: info };
      else if (p === "/api/tv/screens" || p === "/api/tv/legacy") data = [];
      else if (p === "/api/tv/defaults") data = defaults;
      else if (p === "/api/tv/options")
        data = {
          channels: [{ id: "dine", name: "Dine in" }],
          categories: [],
          products: Array.from({ length: 45 }, (_, i) => ({
            id: "tea-" + i,
            name: "Tea " + i,
            specs: [],
          })),
          media: [
            {
              id: "poster",
              name: "Poster",
              kind: "image",
              url: "/uploads/poster.svg",
            },
          ],
        };
      else if (p === "/api/channels")
        data = { list: [{ id: "dine", name: "Dine in" }] };
      else if (p === "/api/channels/dine/products/all") data = { list: prices };
      else if (p === "/api/media")
        data = {
          list: [
            {
              id: "poster",
              name: "Poster",
              kind: "image",
              url: "/uploads/poster.svg",
              size: 512,
            },
          ],
          total: 1,
        };
      else if (p === "/api/inventory") data = { list: [] };
      else if (
        p.includes("suggestions") ||
        p.includes("expiry") ||
        p.includes("alerts")
      )
        data = [];
      else if (
        p.includes("counts") ||
        p.includes("suppliers") ||
        p.includes("purchase-orders")
      )
        data = { list: [] };
      return route.fulfill({ json: { code: 200, data } });
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/marketing/tv-screen");
    await expect(
      page.getByRole("heading", { name: "TV displays", exact: true }),
    ).toBeVisible();
    assert.ok(
      await page
        .locator("aside")
        .evaluate((el) => el.getBoundingClientRect().right <= 0),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.locator("aside")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Menu", exact: true }),
    ).toBeFocused();
    await page.screenshot({ path: path.join(out, "mobile-tv.png") });
    await page
      .getByRole("button", { name: "Store defaults", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Store defaults" });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("searchbox", { name: "Search Products", exact: true })
      .fill("Tea 40");
    await dialog.getByLabel("Tea 40", { exact: true }).check();
    assert.equal(writes.length, 0);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    assert.deepEqual(defaults.selectedProductIds, ["tea-40"]);
    await page
      .getByRole("button", { name: "Store defaults", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Store defaults", exact: true }),
    ).toBeFocused();
    await page.goto(origin + "/marketing/media");
    await page.getByRole("button", { name: "Poster", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Poster" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("512 B", { exact: false })).toBeVisible();
    await page.goto(origin + "/channels/pricing");
    await page.getByRole("combobox").last().selectOption("dine");
    const one = page
      .getByRole("region")
      .filter({ has: page.getByRole("heading", { name: "Tea One" }) });
    const ratio = page.getByRole("spinbutton", { name: "Tea One Price ratio" });
    await ratio.fill("0");
    const before = writes.length;
    await expect(
      page.getByText("After saving: Rp 0", { exact: true }),
    ).toBeVisible();
    assert.equal(writes.length, before);
    await ratio.fill("");
    await expect(
      page.getByRole("button", { name: "Save", exact: true }).first(),
    ).toBeDisabled();
    await ratio.fill("90");
    fail = true;
    await page
      .getByRole("button", { name: "Save", exact: true })
      .first()
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Synthetic save failed",
    );
    fail = false;
    await page
      .getByRole("button", { name: "Save", exact: true })
      .first()
      .click();
    await expect.poll(() => prices[0].priceAdjustment).toBe(0.9);
    await page.getByRole("button", { name: "+10%", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("2 products");
    const count = writes.length;
    await page.getByRole("button", { name: "Fill drafts" }).click();
    assert.equal(writes.length, count);
    await page.getByRole("button", { name: /Save changes/ }).click();
    await expect.poll(() => prices[1].priceAdjustment).toBe(1.1);
    assert.equal(prices[1].enabled, false);
    await page.screenshot({ path: path.join(out, "mobile-pricing.png") });
    await page.goto(origin + "/settings");
    await page
      .getByLabel("Store timezone", { exact: true })
      .selectOption("America/New_York");
    const n = writes.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal(writes.length, n);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm save" })
      .click();
    await expect.poll(() => info.timezone).toBe("America/New_York");
    for (const [url, group] of [
      ["/inventory", "Stock & materials"],
      ["/inventory/restock", "Purchasing"],
      ["/inventory/count", "Count & review"],
      ["/inventory/alerts", "Stock alerts"],
    ]) {
      await page.goto(origin + url);
      await expect(
        page
          .getByRole("navigation", { name: "Inventory groups" })
          .getByRole("link", { name: group, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        url,
      );
    }
    await page.screenshot({ path: path.join(out, "mobile-inventory.png") });
    // Exercise an older async form without its own saving flag. All data is
    // owned by this isolated fixture, and every external request is blocked.
    await page.goto(origin + "/finance/accounts");
    await page.getByRole("button", { name: "Add Account", exact: true }).click();
    let accountDialog = page.getByRole("dialog", { name: "Add Account", exact: true });
    await accountDialog.getByPlaceholder("1001").fill("9999");
    await accountDialog.getByPlaceholder("Account Name", { exact: true }).fill("Isolated draft");
    await accountDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("unsaved");
    await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    accountDialog = page.getByRole("dialog", { name: "Add Account", exact: true });
    await expect(accountDialog.getByPlaceholder("Account Name", { exact: true })).toHaveValue("Isolated draft");
    const accountWrites = writes.length;
    await accountDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(accountDialog).toHaveAttribute("aria-busy", "true");
    await expect(accountDialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(accountDialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(accountDialog).toBeVisible();
    assert.equal(writes.length, accountWrites + 1);
    releaseAccountWrite();
    await expect(accountDialog).toHaveAttribute("aria-busy", "false");
    await expect(accountDialog.getByPlaceholder("Account Name", { exact: true })).toHaveValue("Isolated draft");
    await accountDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Account", exact: true })).toBeFocused();
    await page.screenshot({ path: path.join(out, "mobile-form-protection.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS production UI: full-width mobile drawer, dialog focus/Escape, TV search/drafts, media preview, price zero/empty/failure/bulk review, explicit store save, inventory grouping.",
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
