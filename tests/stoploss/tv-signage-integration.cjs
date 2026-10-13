// Real disposable SQLite + Prisma + Express. Never connects to a store database.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "tv-signage-"));
fs.symlinkSync(
  path.resolve("server/node_modules"),
  root + "/node_modules",
  "dir",
);
const schema = fs
  .readFileSync("server/prisma/schema.prisma", "utf8")
  .replace(
    'provider   = "prisma-client-js"',
    `provider   = "prisma-client-js"\n output = "${root}/client"`,
  )
  .replace(
    'binaryTargets = ["native", "windows"]',
    'binaryTargets = ["native"]',
  )
  .replace('provider = "postgresql"', 'provider = "sqlite"');
fs.writeFileSync(root + "/schema.prisma", schema);
process.env.DATABASE_URL = "file:" + root + "/test.db?connection_limit=1";
process.env.UPLOADS_PATH = root + "/uploads";
process.env.TV_LEGACY_DATA_PATH = root + "/legacy";
process.env.JWT_SECRET = "synthetic-tv-signage-key";
process.env.PRISMA_GENERATE_SKIP_AUTOINSTALL = "true";
for (const args of [["generate"], ["db", "push", "--skip-generate"]])
  execFileSync(
    path.resolve("server/node_modules/.bin/prisma"),
    [...args, "--schema", root + "/schema.prisma"],
    { stdio: "pipe" },
  );
const { PrismaClient } = require(root + "/client");
global.prisma = new PrismaClient({
  transactionOptions: { maxWait: 10000, timeout: 30000 },
});
require("node:module").createRequire(path.resolve("server/package.json"))(
  "tsx/cjs",
);
const db = global.prisma,
  svc = require("../../server/src/services/TvSignageService.ts"),
  activities = require("../../server/src/services/ActivityService.ts");
async function main() {
  await db.tenant.create({ data: { id: "tenant", name: "Synthetic" } });
  for (const id of ["store", "foreign"])
    await db.store.create({ data: { id, tenantId: "tenant", name: id } });
  const owner = await db.user.create({
    data: {
      id: "owner",
      phone: "owner",
      password: "disabled",
      role: "admin",
      storeId: "store",
    },
  });
  await db.category.create({
    data: { id: "cat", storeId: "store", name: "Tea" },
  });
  await db.product.create({
    data: {
      id: "p",
      storeId: "store",
      categoryId: "cat",
      name: "Tea",
      code: "TEST",
    },
  });
  await db.product.create({
    data: {
      id: "empty",
      storeId: "store",
      categoryId: "cat",
      name: "Unpriced",
      code: "EMPTY",
    },
  });
  await db.spec.create({
    data: {
      id: "spec",
      productId: "p",
      name: "Regular",
      price: 15500,
      isDefault: true,
    },
  });
  await db.channel.create({
    data: { id: "dine", storeId: "store", code: "DINE_IN", name: "Dine in" },
  });
  await db.channel.create({
    data: { id: "delivery", storeId: "store", code: "GOFOOD", name: "GoFood" },
  });
  await db.productChannelPrice.create({
    data: { productId: "p", channelId: "delivery", priceAdjustment: 1.2 },
  });
  const settings = svc.screenSettings.parse({
      inherit: false,
      channelId: "dine",
    }),
    screen = await db.tvScreen.create({
      data: {
        storeId: "store",
        code: "TV-01",
        name: "Main",
        config: JSON.stringify(settings),
      },
    }),
    foreign = await db.tvScreen.create({
      data: {
        storeId: "foreign",
        code: "TV-01",
        name: "Foreign",
        config: "{}",
      },
    });
  await assert.rejects(
    svc.claimPair("store", "000000", foreign.id),
    /SCREEN_NOT_FOUND/,
  );
  const session = await svc.requestPair();
  assert.match(session.pin, /^\d{6}$/);
  assert.equal((await svc.checkPair(session.id, "0".repeat(64))).expired, true);
  const claimed = await svc.claimPair("store", session.pin, screen.id);
  await assert.rejects(
    svc.claimPair("store", session.pin, screen.id),
    /ALREADY_CLAIMED/,
  );
  const paired = await svc.checkPair(session.id, session.secret);
  assert.equal(paired.deviceId, claimed.deviceId);
  assert.equal(
    (await db.tvDevice.findUnique({ where: { id: claimed.deviceId } }))
      .tokenHash,
    svc.hash(paired.token),
  );
  const expired = await svc.requestPair();
  await db.tvPairSession.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(0) },
  });
  await assert.rejects(
    svc.claimPair("store", expired.pin, screen.id),
    /EXPIRED/,
  );
  await db.mediaAsset.create({
    data: {
      id: "foreign-media",
      storeId: "foreign",
      uploadedBy: "owner",
      name: "Foreign",
      kind: "image",
      mimeType: "image/png",
      size: 12,
      storagePath: "foreign.png",
      url: "/uploads/foreign.png",
    },
  });
  await assert.rejects(
    svc.validateSettings(
      db,
      "store",
      svc.screenSettings.parse({ selectedMediaIds: ["foreign-media"] }),
    ),
    /STORE_MISMATCH/,
  );
  const direct = await activities.saveActivity("store", {
    name: "Special",
    type: "special_price",
    status: "published",
    productIds: ["p"],
    rule: { price: 12345 },
  });
  await activities.saveActivity("store", {
    name: "Member only",
    type: "member_price",
    status: "published",
    productIds: ["p"],
    memberOnly: true,
    rule: { price: 1 },
  });
  await activities.saveActivity("store", {
    name: "Minimum spend",
    type: "fixed",
    status: "published",
    rule: { minAmount: 50000, amount: 40000 },
  });
  const a = await svc.signageSnapshot(screen),
    b = await svc.signageSnapshot(screen);
  assert.equal(a.version, b.version);
  assert.equal(a.menu.find((p) => p.id === "p").specs[0].displayPrice, 12345);
  assert.ok(a.errors.includes("TV_PRODUCT_PRICE_MISSING:empty"));
  assert.equal(a.menu.find((p) => p.id === "empty").specs.length, 0);
  const quote = await activities.quoteActivities("store", {
    items: [{ productId: "p", specId: "spec", quantity: 1, unitPrice: 15500 }],
    channelId: "dine",
    paymentMethod: "cash",
    taxEnabled: false,
  });
  assert.equal(
    a.menu.find((p) => p.id === "p").specs[0].displayPrice,
    quote.finalAmount,
  );
  const delivery = await db.tvScreen.update({
    where: { id: screen.id },
    data: { config: JSON.stringify({ ...settings, channelId: "delivery" }) },
  });
  const d = await svc.signageSnapshot(delivery);
  assert.equal(d.menu.find((p) => p.id === "p").specs[0].basePrice, 18600);
  const express = require("../../server/node_modules/express"),
    app = express(),
    jwt = require("../../server/node_modules/jsonwebtoken"),
    http = require("../../server/node_modules/supertest");
  app.use(express.json());
  app.use(
    "/api/tv",
    require("../../server/src/middlewares/staffAccessV2.ts").declareAccessRoutes(
      "/api/tv",
      require("../../server/src/routes/tv.ts").tvRouter,
    ),
  );
  assert.equal((await http(app).get("/api/tv/screens")).status, 401);
  assert.equal(
    (await http(app).delete("/api/tv/screens/" + screen.id)).status,
    401,
  );
  assert.equal((await http(app).get("/api/tv/device/content")).status, 401);
  const token = jwt.sign(
    {
      id: owner.id,
      phone: owner.phone,
      role: "admin",
      storeId: "store",
      staffId: "",
      issuedAtMs: owner.updatedAt.getTime(),
    },
    process.env.JWT_SECRET,
  );
  assert.equal(
    (
      await http(app)
        .get("/api/tv/screens/" + foreign.id + "/preview")
        .set("Authorization", "Bearer " + token)
    ).status,
    404,
  );
  const content = await http(app)
    .get("/api/tv/device/content")
    .set("X-TV-Device-Token", paired.token);
  assert.equal(content.status, 200);
  assert.equal(content.body.data.store.name, "store");
  await db.tvDevice.update({
    where: { id: claimed.deviceId },
    data: { revoked: true },
  });
  assert.equal(
    (
      await http(app)
        .get("/api/tv/device/content")
        .set("X-TV-Device-Token", paired.token)
    ).status,
    401,
  );
  // Only the designated device receives authoritative, completed lottery results.
  await db.tvDevice.update({
    where: { id: claimed.deviceId },
    data: { revoked: false },
  });
  const another = await db.tvDevice.create({
    data: {
      storeId: "store",
      screenId: screen.id,
      tokenHash: svc.hash("another-device"),
    },
  });
  await db.config.create({
    data: {
      storeId: "store",
      key: "tv_interactive_device",
      category: "marketing",
      value: claimed.deviceId,
    },
  });
  await activities.putRecord(
    db,
    "store",
    activities.ACTIVITY_PREFIX + "grant.synthetic",
    {
      id: "synthetic",
      status: "ready",
      prize: { name: "Tea" },
      orderNumber: "Synthetic",
      eventExpiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  );
  const device = await db.tvDevice.findUnique({
    where: { id: claimed.deviceId },
    include: { screen: true },
  });
  assert.equal((await svc.tvEvents(device)).length, 1);
  assert.equal((await svc.tvEvents({ ...device, id: another.id })).length, 0);
  await svc.acknowledgeTvEvents(device, ["synthetic"]);
  assert.equal((await svc.tvEvents(device)).length, 0);
  const heartbeat = await http(app)
    .post("/api/tv/device/heartbeat")
    .set("X-TV-Device-Token", paired.token)
    .send({
      appVersion: "test-2",
      version: d.version,
      desiredVersion: d.version,
      cacheState: "ready",
      playbackState: "playing",
      resolution: "1920x1080",
    });
  assert.equal(heartbeat.status, 200);
  const listed = await http(app)
    .get("/api/tv/screens")
    .set("Authorization", "Bearer " + token);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data[0].desiredVersion, d.version);
  // Legacy screens require an explicit store; a repeated import is idempotent.
  const legacyDir = path.join(root, "legacy");
  fs.mkdirSync(legacyDir);
  process.env.TV_LEGACY_DATA_PATH = legacyDir;
  fs.writeFileSync(
    legacyDir + "/tv_screens.json",
    JSON.stringify([
      { id: "old-screen", code: "OLD-1", name: "Legacy", selectedMediaIds: [] },
    ]),
  );
  fs.writeFileSync(legacyDir + "/media_library.json", "[]");
  const legacy = require("../../server/src/services/TvLegacyImport.ts"),
    imported = await legacy.importLegacyScreen("store", "old-screen", "owner");
  assert.equal(imported.isActive, false);
  assert.equal(
    (await legacy.importLegacyScreen("store", "old-screen", "owner")).id,
    imported.id,
  );
  await assert.rejects(
    legacy.importLegacyScreen("foreign", "old-screen", "owner"),
    /ALREADY_ASSIGNED/,
  );
  assert.ok(fs.readdirSync(legacyDir + "/tv-import-backups").length >= 2);
  // Upgrade existing SQLite databases safely and repeatably, not just db-push fixtures.
  await db.tvPairSession.deleteMany();
  await db.tvDevice.deleteMany();
  await db.tvScreen.deleteMany();
  for (const table of ["TvPairSession", "TvDevice", "TvScreen"])
    await db.$executeRawUnsafe('DROP TABLE "' + table + '"');
  const upgrade = require("../../server/src/utils/tvSchemaUpgrade.ts");
  await upgrade.upgradeTvSchema(db, process.env.DATABASE_URL);
  await upgrade.upgradeTvSchema(db, process.env.DATABASE_URL);
  assert.equal(await db.tvScreen.count(), 0);
  const upgraded = await db.tvScreen.create({
    data: {
      storeId: "store",
      code: "UPGRADED",
      name: "Upgraded",
      config: JSON.stringify(settings),
    },
  });
  assert.ok(upgraded.createdAt instanceof Date);
  const upgradedPair = await svc.requestPair();
  await svc.claimPair("store", upgradedPair.pin, upgraded.id);
  assert.equal(
    (await svc.checkPair(upgradedPair.id, upgradedPair.secret)).paired,
    true,
  );
  assert.ok(fs.readdirSync(root + "/upgrade-backups").length > 0);
  console.log(
    "PASS TV signage: real pairing, expiry, credentials, unauthorized writes, tenant isolation, stable versions, POS price parity, channel prices, missing-price handling, revocation and backed-up SQLite upgrade",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    fs.rmSync(root, { recursive: true, force: true });
  });
