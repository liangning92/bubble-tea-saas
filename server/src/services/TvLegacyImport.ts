import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import prisma from "../config/database";
import { saveMediaFiles } from "./MediaService";
import { mediaPath, inspectFile } from "../utils/mediaFiles";
import { screenSettings, hash, references } from "./TvSignageService";
const directory =
  process.env.TV_LEGACY_DATA_PATH || path.resolve(process.cwd(), "data");
async function read(name: string) {
  try {
    return JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
  } catch (e: any) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
export async function legacyScreens() {
  const rows = await read("tv_screens.json");
  return rows.map((row: any) => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
  }));
}
// Stable global IDs make the same legacy screen claimable by only one store.
function legacyId(id: string) {
  const value = hash("legacy-tv:" + id);
  return (
    value.slice(0, 8) +
    "-" +
    value.slice(8, 12) +
    "-4" +
    value.slice(13, 16) +
    "-a" +
    value.slice(17, 20) +
    "-" +
    value.slice(20, 32)
  );
}
export async function importLegacyScreen(
  storeId: string,
  sourceId: string,
  userId: string,
) {
  const rows = await read("tv_screens.json"),
    source = rows.find((s: any) => s.id === sourceId);
  if (!source) throw Error("TV_LEGACY_NOT_FOUND");
  const id = legacyId(sourceId),
    existing = await prisma.tvScreen.findUnique({ where: { id } });
  if (existing) {
    if (existing.storeId !== storeId) throw Error("TV_LEGACY_ALREADY_ASSIGNED");
    return existing;
  }
  const backup = path.join(directory, "tv-import-backups");
  await fs.mkdir(backup, { recursive: true, mode: 0o700 });
  for (const name of ["tv_screens.json", "media_library.json"])
    try {
      await fs.copyFile(
        path.join(directory, name),
        path.join(backup, Date.now() + "-" + name),
      );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  const library = await read("media_library.json"),
    mapped = new Map<string, string>();
  for (const oldId of source.selectedMediaIds || []) {
    const old = library.find((m: any) => m.id === oldId);
    if (!old || !/^\/uploads\/media\/[^/]+$/.test(old.url))
      throw Error("TV_LEGACY_MEDIA_MISSING");
    const input = mediaPath("media/" + path.basename(old.url)),
      type = await inspectFile(input);
    if (!type) throw Error("TV_LEGACY_MEDIA_INVALID");
    // Reuse only when the same explicitly assigned store already owns this file.
    const owned = await prisma.mediaAsset.findUnique({
      where: { storagePath: "media/" + path.basename(old.url) },
    });
    if (owned) {
      if (owned.storeId !== storeId)
        throw Error("TV_LEGACY_MEDIA_STORE_MISMATCH");
      mapped.set(oldId, owned.id);
      continue;
    }
    const dir = mediaPath(".media-pending");
    await fs.mkdir(dir, { recursive: true });
    const pending = path.join(dir, randomUUID());
    await fs.copyFile(input, pending);
    const assets = await saveMediaFiles(storeId, userId, [
      {
        path: pending,
        originalname: old.name || path.basename(old.url),
        size: (await fs.stat(pending)).size,
      },
    ]);
    mapped.set(oldId, assets[0].id);
  }
  const settings = screenSettings.parse({
    inherit: false,
    orientation: source.orientation,
    layoutTemplate: source.layoutTemplate,
    themeStyle: source.themeStyle,
    safeAreaPadding: source.safeAreaPadding,
    mediaFitMode: source.mediaFitMode,
    mediaIntervalSeconds: source.mediaIntervalSeconds,
    selectedMediaIds: [...mapped.values()],
    showActivities: source.showActivities,
    marqueeText: source.marqueeText,
    marqueeSpeed: source.marqueeSpeed,
  });
  // Category/product references from the unscoped file are deliberately not carried
  // across stores. Operators select scoped products after import.
  return prisma.$transaction(async (tx) => {
    const screen = await tx.tvScreen.create({
      data: {
        id,
        storeId,
        code: String(source.code).slice(0, 40),
        name: String(source.name).slice(0, 100),
        config: JSON.stringify(settings),
        isActive: false,
      },
    });
    await references(tx, storeId, "tv.screen." + id, settings);
    return screen;
  });
}
