import { getOrCreateStoreChannels } from "./ChannelBootstrap";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from "crypto";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import prisma from "../config/database";
import { config as env } from "../config/env";
import {
  listActivities,
  publicActivities,
  records,
  putRecord,
  ACTIVITY_PREFIX,
  displayPrizes,
} from "./ActivityService";
import {
  activityEligible,
  activityWindow,
  bestActivityPrice,
  Activity,
} from "../utils/activities";
import { mediaPath, localUploadPath } from "../utils/mediaFiles";
import { normalizeTvConfig } from "../utils/tvScreenConfig";

export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const pairToken = (id: string) =>
  createHmac("sha256", env.jwt.secret)
    .update("tv-device:" + id)
    .digest("hex");
const ids = z.array(z.string().min(1).max(100)).max(100);
export const screenSettings = z
  .object({
    inherit: z.boolean().default(true),
    channelId: z.string().max(100).default(""),
    orientation: z.enum(["landscape", "portrait"]).default("landscape"),
    layoutTemplate: z
      .enum([
        "product_catalog",
        "menu_full",
        "split_media_menu",
        "media_loop",
        "portrait_promo_menu",
        "portrait_media_loop",
      ])
      .default("split_media_menu"),
    themeStyle: z
      .enum(["international_dark", "creamy_morandi", "dynamic_vivid"])
      .default("international_dark"),
    safeAreaPadding: z.number().min(0).max(5).default(1.5),
    mediaFitMode: z.enum(["cover", "contain_blur"]).default("contain_blur"),
    mediaIntervalSeconds: z.number().int().min(2).max(300).default(8),
    selectedMediaIds: ids.default([]),
    selectedCategoryIds: ids.default([]),
    selectedProductIds: ids.default([]),
    selectedSpecIds: ids.default([]),
    showActivities: z.boolean().default(true),
    activityDisplayType: z
      .enum(["all", "badges_only", "banner_only"])
      .default("all"),
    marqueeText: z.string().max(1000).default(""),
    marqueeSpeed: z.number().min(1).max(5).default(3),
    musicIds: ids.default([]),
    musicEnabled: z.boolean().default(false),
    volume: z.number().min(0).max(1).default(0.4),
    pageSeconds: z.number().int().min(3).max(300).default(12),
  })
  .strict();
export const screenInput = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((x) => x.toUpperCase()),
    name: z.string().trim().min(1).max(100),
    isActive: z.boolean().default(true),
    settings: screenSettings,
  })
  .strict();
export type TvSettings = z.infer<typeof screenSettings>;
export async function validateSettings(
  db: any,
  storeId: string,
  settings: TvSettings,
) {
  for (const [model, values] of [
    ["category", settings.selectedCategoryIds],
    ["product", settings.selectedProductIds],
    ["mediaAsset", [...settings.selectedMediaIds, ...settings.musicIds]],
  ] as const) {
    if (
      values.length &&
      (await db[model].count({
        where: { storeId, id: { in: [...new Set(values)] } },
      })) !== new Set(values).size
    )
      throw Error("TV_STORE_MISMATCH");
  }
  if (
    settings.channelId &&
    !(await db.channel.findFirst({
      where: { id: settings.channelId, storeId, status: "active" },
    }))
  )
    throw Error("TV_CHANNEL_INVALID");
  if (
    settings.selectedSpecIds.length &&
    (await db.spec.count({
      where: {
        id: { in: [...new Set(settings.selectedSpecIds)] },
        product: { storeId },
      },
    })) !== new Set(settings.selectedSpecIds).size
  )
    throw Error("TV_STORE_MISMATCH");
  const assets = await db.mediaAsset.findMany({
    where: {
      id: { in: [...settings.selectedMediaIds, ...settings.musicIds] },
      storeId,
    },
  });
  if (
    assets.some((a: any) =>
      settings.musicIds.includes(a.id)
        ? a.kind !== "audio"
        : !["image", "video"].includes(a.kind),
    )
  )
    throw Error("TV_MEDIA_TYPE_INVALID");
}
export async function references(
  db: any,
  storeId: string,
  key: string,
  settings: TvSettings,
) {
  await db.mediaReference.deleteMany({ where: { storeId, configKey: key } });
  for (const mediaId of new Set([
    ...settings.selectedMediaIds,
    ...settings.musicIds,
  ]))
    await db.mediaReference.create({
      data: { storeId, configKey: key, mediaId },
    });
}
export async function requestPair(db = prisma) {
  await db.tvPairSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  const secret = randomBytes(32).toString("hex");
  for (let attempt = 0; attempt < 10; attempt++)
    try {
      const session = await db.tvPairSession.create({
        data: {
          pin: String(randomInt(100000, 1000000)),
          secretHash: hash(secret),
          expiresAt: new Date(Date.now() + 900000),
        },
      });
      return {
        id: session.id,
        pin: session.pin,
        secret,
        expiresInSeconds: 900,
      };
    } catch (e: any) {
      if (e.code !== "P2002") throw e;
    }
  throw Error("TV_PAIR_CAPACITY");
}
export async function claimPair(
  storeId: string,
  pin: string,
  screenId: string,
  db = prisma,
) {
  return db.$transaction(async (tx) => {
    const screen = await tx.tvScreen.findFirst({
      where: { id: screenId, storeId },
    });
    if (!screen) throw Error("TV_SCREEN_NOT_FOUND");
    const session = await tx.tvPairSession.findUnique({ where: { pin } });
    if (!session) throw Error("TV_PAIR_EXPIRED");
    const changed = await tx.tvPairSession.updateMany({
      where: { id: session.id, claimed: false, expiresAt: { gt: new Date() } },
      data: { claimed: true },
    });
    if (changed.count !== 1) throw Error("TV_PAIR_ALREADY_CLAIMED_OR_EXPIRED");
    const device = await tx.tvDevice.create({
      data: { storeId, screenId, tokenHash: hash(pairToken(session.id)) },
    });
    await tx.tvPairSession.update({
      where: { id: session.id },
      data: { deviceId: device.id },
    });
    return { deviceId: device.id, screenId };
  });
}
export async function checkPair(id: string, secret: string, db = prisma) {
  const session = await db.tvPairSession.findFirst({
    where: { id, secretHash: hash(secret), expiresAt: { gt: new Date() } },
  });
  if (!session) return { expired: true };
  if (!session.claimed) return { paired: false };
  const device =
    session.deviceId &&
    (await db.tvDevice.findFirst({
      where: { id: session.deviceId, revoked: false },
    }));
  if (!device) return { expired: true };
  return { paired: true, deviceId: device.id, token: pairToken(session.id) };
}
// Evaluate individual prices with the exact same candidate selector as POS. A minimum spend is
// re-checked against the evaluated item, so a conditional offer only lowers the shown price when
// that single item already meets it. Member, payment and per-member limits stay advertisements.
export function displaySpecPrice(
  spec: any,
  product: any,
  channel: any,
  activities: Activity[],
  now: Date,
) {
  const adjustment = product.channelPrices?.find(
    (p: any) => p.channelId === channel?.id && p.enabled,
  );
  const basePrice = adjustment
    ? Math.round(spec.price * adjustment.priceAdjustment)
    : spec.price;
  const item = {
    productId: product.id,
    specId: spec.id,
    quantity: 1,
    unitPrice: basePrice,
    addons: [],
  };
  const direct = activities.filter(
    (a) =>
      ["special_price", "percent", "fixed"].includes(a.type) &&
      !a.rule.perMemberLimit &&
      !a.paymentMethods.length &&
      !a.memberOnly &&
      !a.memberLevels.length,
  );
  const result = bestActivityPrice(direct, [item], {
    channel: channel?.code || "DINE_IN",
    now,
  });
  return {
    basePrice,
    displayPrice: result.finalAmount,
    activityId: result.applied?.id || null,
  };
}
const fileDigests = new Map<
  string,
  { mtime: number; size: number; digest: string }
>();
export async function assetManifest(url: string, kind: string) {
  const local = localUploadPath(url);
  if (!local) return null;
  const file = mediaPath(local),
    stat = await fs.stat(file);
  let known = fileDigests.get(file);
  if (!known || known.mtime !== stat.mtimeMs || known.size !== stat.size) {
    known = {
      mtime: stat.mtimeMs,
      size: stat.size,
      digest: hash(await fs.readFile(file)),
    };
    fileDigests.set(file, known);
  }
  return {
    url: "/uploads/" + local,
    kind,
    size: stat.size,
    sha256: known.digest,
  };
}
export async function signageSnapshot(screen: any, db = prisma) {
  const storeId = screen.storeId,
    now = new Date(),
    settings = screenSettings.parse(JSON.parse(screen.config));
  const [store, defaultsRow, oldRow, brandRow, channels, allActivities] =
    await Promise.all([
      db.store.findUnique({ where: { id: storeId } }),
      db.config.findUnique({
        where: { storeId_key: { storeId, key: "tv_signage_defaults" } },
      }),
      db.config.findUnique({
        where: { storeId_key: { storeId, key: "tv_screen_marketing_config" } },
      }),
      db.config.findUnique({
        where: { storeId_key: { storeId, key: "storeInfo" } },
      }),
      getOrCreateStoreChannels(storeId).then((rows) =>
        rows.filter((c) => c.status === "active"),
      ),
      listActivities(storeId),
    ]);
  if (!store) throw Error("TV_STORE_NOT_FOUND");
  let effective = settings;
  if (settings.inherit) {
    if (defaultsRow)
      effective = {
        ...screenSettings.parse(JSON.parse(defaultsRow.value)),
        ...Object.fromEntries(
          [
            "channelId",
            "orientation",
            "layoutTemplate",
            "themeStyle",
            "safeAreaPadding",
            "mediaFitMode",
          ].map((k) => [k, (settings as any)[k]]),
        ),
      };
    else if (oldRow) {
      const old = normalizeTvConfig(JSON.parse(oldRow.value));
      effective = {
        ...settings,
        mediaIntervalSeconds: old.carouselIntervalSeconds,
        marqueeText: old.ticker.enabled ? old.ticker.text : "",
        musicEnabled: old.idleMusic.enabled,
        volume: old.idleMusic.volume,
        selectedProductIds: old.idleProductIds,
      };
    }
  }
  const channel =
    channels.find((c) => c.id === effective.channelId) ||
    (!effective.channelId && channels.find((c) => c.code === "DINE_IN"));
  if (!channel) throw Error("TV_CHANNEL_INVALID");
  const products = await db.product.findMany({
    where: {
      storeId,
      status: "active",
      deletedAt: null,
      ...(effective.selectedCategoryIds.length
        ? { categoryId: { in: effective.selectedCategoryIds } }
        : {}),
      ...(effective.selectedProductIds.length
        ? { id: { in: effective.selectedProductIds } }
        : {}),
    },
    include: { specs: true, category: true, channelPrices: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const errors: string[] = [],
    menu = products.map((p) => {
      const specs = p.specs
        .filter(
          (s) =>
            !effective.selectedSpecIds.length ||
            effective.selectedSpecIds.includes(s.id),
        )
        .map((s) => ({
          id: s.id,
          name: s.name,
          isDefault: s.isDefault,
          ...displaySpecPrice(s, p, channel, allActivities, now),
        }));
      if (!specs.length) errors.push("TV_PRODUCT_PRICE_MISSING:" + p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        image: p.image,
        categoryId: p.categoryId,
        category: p.category.name,
        specs,
      };
    });
  let media = await db.mediaAsset.findMany({
    where: {
      storeId,
      id: { in: [...effective.selectedMediaIds, ...effective.musicIds] },
    },
  });
  let slides = effective.selectedMediaIds
      .map((id) => media.find((m) => m.id === id))
      .filter(Boolean)
      .map((a) => ({ url: a!.url, kind: a!.kind, name: a!.name })),
    music = effective.musicIds
      .map((id) => media.find((m) => m.id === id))
      .filter(Boolean)
      .map((a) => ({ url: a!.url, kind: "audio", name: a!.name }));
  if (settings.inherit && !defaultsRow && oldRow) {
    const old = normalizeTvConfig(JSON.parse(oldRow.value));
    slides = old.mediaFiles.map((m) => ({
      url: m.url,
      kind: m.kind || "image",
      name: m.title || "",
    }));
    music = old.idleMusic.tracks.map((m) => ({
      url: m.url,
      kind: "audio",
      name: m.title || "",
    }));
  }
  const display = await publicActivities(storeId, channel.code);
  const promotions = display.activities.filter((a) =>
    activityEligible(
      allActivities.find((x) => x.id === a.id)!,
      { now, channel: channel.code },
      false,
    ),
  );
  // Daily special board: the running offer plus the next occurrence, independent of the
  // product menu so the board can replace the menu while the offer is live.
  const specialRows = await db.product.findMany({
    where: { storeId, status: "active", deletedAt: null },
    include: { specs: true },
  });
  const specialProducts = (activity: Activity) =>
    activity.productIds
      .map((id) => specialRows.find((p) => p.id === id))
      .filter((p) => !!p)
      .map((p) => {
        const prices = p.specs.map((s) => s.price);
        const originalPrice = prices.length ? Math.min(...prices) : 0;
        const specialPrice = activity.rule.price ?? 0;
        return {
          id: p.id,
          name: p.name,
          image: p.image,
          originalPrice,
          specialPrice,
          saving: Math.max(0, originalPrice - specialPrice),
        };
      })
      .filter((p) => p.originalPrice > 0);
  const specials = allActivities
    .filter(
      (a) =>
        a.type === "special_price" &&
        a.showOnTv &&
        a.status === "published" &&
        (!a.startsAt || now.getTime() >= Date.parse(a.startsAt)) &&
        (!a.endsAt || now.getTime() < Date.parse(a.endsAt)),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        Date.parse(a.startsAt || "0") - Date.parse(b.startsAt || "0"),
    )
    .map((a) => {
      const schedule = activityWindow(a, now);
      const products = specialProducts(a);
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        theme: a.theme || "",
        weekdays: a.weekdays,
        dailyStart: a.dailyStart,
        dailyEnd: a.dailyEnd,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        timezone: a.timezone,
        products,
        upcoming: schedule.nextDate
          ? {
              date: schedule.nextDate,
              weekday: schedule.nextWeekday,
              products,
            }
          : null,
      };
    });
  const hardware = brandRow ? JSON.parse(brandRow.value) : {},
    assets: any[] = [];
  for (const [url, kind] of [
    ...slides,
    ...music,
    ...menu
      .filter((p) => p.image)
      .map((p) => ({ url: p.image!, kind: "image" })),
    ...promotions
      .filter((p) => p.imageUrl)
      .map((p) => ({ url: p.imageUrl!, kind: "image" })),
  ].map((m) => [m.url, m.kind])) {
    try {
      const asset = await assetManifest(url, kind);
      if (asset && !assets.some((a) => a.url === asset.url)) assets.push(asset);
      else if (!asset) errors.push("TV_EXTERNAL_ASSET_NOT_OFFLINE:" + url);
    } catch {
      errors.push("TV_ASSET_MISSING:" + url);
    }
  }
  const canonical = (url: string) => {
    const local = localUploadPath(url);
    return local ? "/uploads/" + local : url;
  };
  for (const m of [...slides, ...music]) m.url = canonical(m.url);
  for (const p of menu) if (p.image) p.image = canonical(p.image);
  for (const p of promotions)
    if (p.imageUrl) p.imageUrl = canonical(p.imageUrl);
  const logo = hardware.storeLogo || "";
  if (logo) {
    try {
      const a = await assetManifest(logo, "image");
      if (a && !assets.some((x) => x.url === a.url)) assets.push(a);
    } catch {
      errors.push("TV_LOGO_MISSING");
    }
  }
  const body = {
    screen: {
      id: screen.id,
      code: screen.code,
      name: screen.name,
      revision: screen.revision,
      isActive: screen.isActive,
    },
    settings: effective,
    store: {
      name: hardware.storeName || store.name,
      locale: store.locale,
      currency: store.currency,
      timezone: store.timezone,
      logo: logo ? canonical(logo) : "",
    },
    channel: { id: channel.id, name: channel.name, code: channel.code },
    menu: screen.isActive ? menu : [],
    media: screen.isActive ? slides : [],
    music: screen.isActive ? music : [],
    promotions: screen.isActive ? promotions : [],
    specials: screen.isActive ? specials : [],
    assets: screen.isActive
      ? assets
      : assets.filter((a) => a.url === canonical(logo)),
    errors,
  };
  return {
    ...body,
    version: hash(JSON.stringify(body)),
    serverTime: now.toISOString(),
    nextEvaluationAt: new Date(now.getTime() + 30000).toISOString(),
    validUntil: new Date(now.getTime() + 86400000).toISOString(),
  };
}
export async function tvEvents(device: any) {
  const chosen = await prisma.config.findUnique({
    where: {
      storeId_key: { storeId: device.storeId, key: "tv_interactive_device" },
    },
  });
  if (chosen?.value !== device.id) return [];
  const acknowledgements = new Set(
    (await records<any>(prisma, device.storeId, "tv-ack.")).map(
      (x) => x.eventId,
    ),
  );
  return (await records<any>(prisma, device.storeId, "grant."))
    .filter(
      (g) =>
        g.prize &&
        ["ready", "fulfilled"].includes(g.status) &&
        (g.eventExpiresAt || g.expiresAt) > new Date().toISOString() &&
        !acknowledgements.has(g.id),
    )
    .map((g) => ({
      eventId: g.id,
      orderNumber: g.orderNumber,
      prizeName: g.prize.name,
      coupon: g.coupon ? { code: g.coupon.code, type: g.coupon.type, value: g.coupon.value, minOrder: g.coupon.minOrder, validUntil: g.coupon.validUntil } : undefined,
      prizeId: g.prize.id,
      prizeIndex: g.prizeIndex,
      prizes: displayPrizes(g.prizes),
      expiresAt: g.eventExpiresAt || g.expiresAt,
    }));
}
export async function acknowledgeTvEvents(device: any, ids: string[]) {
  const valid = new Set((await tvEvents(device)).map((g) => g.eventId));
  for (const id of ids.filter((id) => valid.has(id)))
    await putRecord(prisma, device.storeId, ACTIVITY_PREFIX + "tv-ack." + id, {
      eventId: id,
      deviceId: device.id,
      acknowledgedAt: new Date().toISOString(),
    });
}

// Old store-scoped display clients inherit the same default media/product choices.
export async function legacyTvDefaults(storeId: string, previous: any) {
  const row = await prisma.config.findUnique({
    where: { storeId_key: { storeId, key: "tv_signage_defaults" } },
  });
  if (!row) return previous;
  const settings = screenSettings.parse(JSON.parse(row.value)),
    ids = [...settings.selectedMediaIds, ...settings.musicIds];
  const assets = await prisma.mediaAsset.findMany({
    where: { storeId, id: { in: ids } },
  });
  const file = (id: string) => {
    const a = assets.find((a) => a.id === id);
    return a
      ? { mediaId: a.id, url: a.url, kind: a.kind, title: a.name }
      : null;
  };
  return {
    ...previous,
    carouselIntervalSeconds: settings.mediaIntervalSeconds,
    mediaFiles: settings.selectedMediaIds.map(file).filter(Boolean),
    idleProductsEnabled: true,
    idleProductIds: settings.selectedProductIds,
    ticker: { enabled: !!settings.marqueeText, text: settings.marqueeText },
    idleMusic: {
      enabled: settings.musicEnabled,
      volume: settings.volume,
      tracks: settings.musicIds.map(file).filter(Boolean),
    },
  };
}
