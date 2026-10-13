import { legacyScreens, importLegacyScreen } from "../services/TvLegacyImport";
import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import prisma from "../config/database";
import { authenticate, AuthRequest } from "../middlewares/auth";
import { mediaAccess } from "./media";
import {
  screenInput,
  screenSettings,
  validateSettings,
  references,
  requestPair,
  claimPair,
  checkPair,
  hash,
  signageSnapshot,
  tvEvents,
  acknowledgeTvEvents,
} from "../services/TvSignageService";
const router = Router();
const run = (fn: (req: any) => Promise<any>) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    const code =
      e instanceof z.ZodError
        ? 400
        : e.code === "P2002"
          ? 409
          : e.message?.includes("NOT_FOUND")
            ? 404
            : e.message?.startsWith("TV_")
              ? 409
              : 500;
    res.status(code).json({
      success: false,
      message:
        e instanceof z.ZodError
          ? "TV_INVALID_INPUT"
          : e.message?.startsWith("TV_")
            ? e.message
            : "TV_REQUEST_FAILED",
    });
  }
};
const management = (req: AuthRequest, res: any, next: any) => {
  req.query.scene = "tv";
  return authenticate(req, res, () => mediaAccess(req, res, next));
};
const pairLimiter = rateLimit({
  windowMs: 60000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
});
const claimLimiter = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
router.post(
  "/pair/request",
  pairLimiter,
  run(async () => requestPair()),
);
router.get(
  "/pair/check/:id",
  rateLimit({
    windowMs: 60000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  run(async (req) =>
    checkPair(
      z.string().uuid().parse(req.params.id),
      z.string().length(64).parse(req.get("X-TV-Pair-Secret")),
    ),
  ),
);
router.post(
  "/pair/claim",
  management,
  claimLimiter,
  run(async (req) => {
    const input = z
      .object({ pin: z.string().regex(/^\d{6}$/), screenId: z.string().uuid() })
      .strict()
      .parse(req.body);
    return claimPair(req.user.storeId, input.pin, input.screenId);
  }),
);
const deviceAccess = async (req: any, res: any, next: any) => {
  const token = req.get("X-TV-Device-Token");
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    return res
      .status(401)
      .json({ success: false, message: "TV_DEVICE_AUTH_REQUIRED" });
  try {
    const device = await prisma.tvDevice.findUnique({
      where: { tokenHash: hash(token) },
      include: { screen: true },
    });
    if (!device || device.revoked)
      return res
        .status(401)
        .json({ success: false, message: "TV_DEVICE_REVOKED" });
    req.tvDevice = device;
    next();
  } catch (e) {
    next(e);
  }
};
router.get(
  "/device/content",
  deviceAccess,
  run(async (req) => signageSnapshot(req.tvDevice.screen)),
);
router.get(
  "/device/events",
  deviceAccess,
  run(async (req) => tvEvents(req.tvDevice)),
);
router.post(
  "/device/heartbeat",
  deviceAccess,
  run(async (req) => {
    const input = z
      .object({
        appVersion: z.string().max(100),
        sourceSha: z.string().max(40).default(""),
        version: z.string().max(64).default(""),
        desiredVersion: z.string().max(64).default(""),
        cacheState: z.enum(["empty", "downloading", "ready", "failed"]),
        playbackState: z.enum(["playing", "standby", "failed"]),
        resolution: z.string().max(50),
        errors: z.array(z.string().max(300)).max(20).default([]),
        acknowledged: z.array(z.string().max(200)).max(100).default([]),
      })
      .strict()
      .parse(req.body);
    await acknowledgeTvEvents(req.tvDevice, input.acknowledged);
    await prisma.tvDevice.update({
      where: { id: req.tvDevice.id },
      data: { lastSeen: new Date(), report: JSON.stringify(input) },
    });
    return { serverTime: new Date().toISOString() };
  }),
);
router.get(
  "/screens",
  management,
  run(async (req) => {
    const [screens, chosen] = await Promise.all([
      prisma.tvScreen.findMany({
        where: { storeId: req.user.storeId },
        include: {
          devices: {
            select: { id: true, revoked: true, lastSeen: true, report: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.config.findUnique({
        where: {
          storeId_key: {
            storeId: req.user.storeId,
            key: "tv_interactive_device",
          },
        },
      }),
    ]);
    return Promise.all(
      screens.map(async (s) => {
        let content: any;
        try {
          content = await signageSnapshot(s);
        } catch (e: any) {
          content = { version: "", errors: [e.message] };
        }
        return {
          ...s,
          desiredVersion: content.version,
          configurationErrors: content.errors,
          settings: JSON.parse(s.config),
          devices: s.devices.map((d) => ({
            ...d,
            report: JSON.parse(d.report),
            interactive: chosen?.value === d.id,
          })),
        };
      }),
    );
  }),
);
router.get(
  "/legacy",
  management,
  run(async () => legacyScreens()),
);
router.post(
  "/legacy/import",
  management,
  run(async (req) =>
    importLegacyScreen(
      req.user.storeId,
      z.string().min(1).max(100).parse(req.body.sourceId),
      req.user.id,
    ),
  ),
);
router.get(
  "/options",
  management,
  run(async (req) => {
    const storeId = req.user.storeId;
    return {
      channels: await prisma.channel.findMany({
        where: { storeId, status: "active" },
        orderBy: { sortOrder: "asc" },
      }),
      categories: await prisma.category.findMany({
        where: { storeId },
        orderBy: { sortOrder: "asc" },
      }),
      products: await prisma.product.findMany({
        where: { storeId, status: "active", deletedAt: null },
        include: { specs: true },
        orderBy: { sortOrder: "asc" },
      }),
      media: await prisma.mediaAsset.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
      }),
    };
  }),
);
router.get(
  "/defaults",
  management,
  run(async (req) => {
    const row = await prisma.config.findUnique({
      where: {
        storeId_key: { storeId: req.user.storeId, key: "tv_signage_defaults" },
      },
    });
    return screenSettings.parse(row ? JSON.parse(row.value) : {});
  }),
);
router.put(
  "/defaults",
  management,
  run(async (req) => {
    const settings = screenSettings.parse(req.body),
      storeId = req.user.storeId;
    await validateSettings(prisma, storeId, settings);
    return prisma.$transaction(async (tx) => {
      await references(tx, storeId, "tv_signage_defaults", settings);
      return tx.config.upsert({
        where: { storeId_key: { storeId, key: "tv_signage_defaults" } },
        create: {
          storeId,
          key: "tv_signage_defaults",
          value: JSON.stringify(settings),
          category: "marketing",
        },
        update: { value: JSON.stringify(settings) },
      });
    });
  }),
);
router.post(
  "/screens",
  management,
  run(async (req) => {
    const input = screenInput.parse(req.body),
      storeId = req.user.storeId;
    await validateSettings(prisma, storeId, input.settings);
    return prisma.$transaction(async (tx) => {
      const screen = await tx.tvScreen.create({
        data: {
          storeId,
          code: input.code,
          name: input.name,
          isActive: input.isActive,
          config: JSON.stringify(input.settings),
        },
      });
      await references(tx, storeId, "tv.screen." + screen.id, input.settings);
      return screen;
    });
  }),
);
router.put(
  "/screens/:id",
  management,
  run(async (req) => {
    const input = screenInput
        .extend({ revision: z.number().int().min(1) })
        .parse(req.body),
      storeId = req.user.storeId;
    await validateSettings(prisma, storeId, input.settings);
    return prisma.$transaction(async (tx) => {
      const changed = await tx.tvScreen.updateMany({
        where: { id: req.params.id, storeId, revision: input.revision },
        data: {
          code: input.code,
          name: input.name,
          isActive: input.isActive,
          config: JSON.stringify(input.settings),
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw Error("TV_SCREEN_CHANGED_OR_NOT_FOUND");
      await references(
        tx,
        storeId,
        "tv.screen." + req.params.id,
        input.settings,
      );
      return tx.tvScreen.findUnique({ where: { id: req.params.id } });
    });
  }),
);
router.delete(
  "/screens/:id",
  management,
  run(async (req) =>
    prisma.$transaction(async (tx) => {
      const found = await tx.tvScreen.findFirst({
        where: { id: req.params.id, storeId: req.user.storeId },
      });
      if (!found) throw Error("TV_SCREEN_NOT_FOUND");
      await tx.mediaReference.deleteMany({
        where: {
          storeId: req.user.storeId,
          configKey: "tv.screen." + found.id,
        },
      });
      await tx.tvDevice.updateMany({
        where: { screenId: found.id },
        data: { revoked: true },
      });
      return tx.tvScreen.delete({ where: { id: found.id } });
    }),
  ),
);
router.post(
  "/screens/:id/push",
  management,
  run(async (req) => {
    const found = await prisma.tvScreen.findFirst({
      where: { id: req.params.id, storeId: req.user.storeId },
    });
    if (!found) throw Error("TV_SCREEN_NOT_FOUND");
    return { desiredVersion: (await signageSnapshot(found)).version };
  }),
);
router.get(
  "/screens/:id/preview",
  management,
  run(async (req) => {
    const found = await prisma.tvScreen.findFirst({
      where: { id: req.params.id, storeId: req.user.storeId },
    });
    if (!found) throw Error("TV_SCREEN_NOT_FOUND");
    return signageSnapshot(found);
  }),
);
router.post(
  "/devices/:id/revoke",
  management,
  run(async (req) => {
    const result = await prisma.tvDevice.updateMany({
      where: { id: req.params.id, storeId: req.user.storeId },
      data: { revoked: true },
    });
    if (!result.count) throw Error("TV_DEVICE_NOT_FOUND");
    return result;
  }),
);
router.post(
  "/devices/:id/interactive",
  management,
  run(async (req) => {
    const device = await prisma.tvDevice.findFirst({
      where: { id: req.params.id, storeId: req.user.storeId, revoked: false },
    });
    if (!device) throw Error("TV_DEVICE_NOT_FOUND");
    return prisma.config.upsert({
      where: {
        storeId_key: { storeId: device.storeId, key: "tv_interactive_device" },
      },
      create: {
        storeId: device.storeId,
        key: "tv_interactive_device",
        value: device.id,
        category: "marketing",
      },
      update: { value: device.id },
    });
  }),
);
// Old code-only links intentionally cannot obtain device data.
router.get(
  "/display/:code",
  management,
  run(async () => {
    throw Error("TV_PAIR_DEVICE_REQUIRED");
  }),
);
export { router as tvRouter };
