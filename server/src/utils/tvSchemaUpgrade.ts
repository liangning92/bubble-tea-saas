import { createHash } from "crypto";
import { mkdir } from "fs/promises";
import path from "path";
export const tvSchemaDDL =
  'CREATE TABLE IF NOT EXISTS "TvScreen" ("id" TEXT PRIMARY KEY NOT NULL, "storeId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "config" TEXT NOT NULL DEFAULT \'{}\', "revision" INTEGER NOT NULL DEFAULT 1, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);\nCREATE UNIQUE INDEX IF NOT EXISTS "TvScreen_storeId_code_key" ON "TvScreen"("storeId", "code");\nCREATE INDEX IF NOT EXISTS "TvScreen_storeId_idx" ON "TvScreen"("storeId");\nCREATE TABLE IF NOT EXISTS "TvDevice" ("id" TEXT PRIMARY KEY NOT NULL, "storeId" TEXT NOT NULL, "screenId" TEXT NOT NULL REFERENCES "TvScreen"("id") ON DELETE CASCADE, "tokenHash" TEXT NOT NULL UNIQUE, "revoked" BOOLEAN NOT NULL DEFAULT false, "report" TEXT NOT NULL DEFAULT \'{}\', "lastSeen" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);\nCREATE INDEX IF NOT EXISTS "TvDevice_storeId_screenId_idx" ON "TvDevice"("storeId", "screenId");\nCREATE TABLE IF NOT EXISTS "TvPairSession" ("id" TEXT PRIMARY KEY NOT NULL, "pin" TEXT NOT NULL UNIQUE, "secretHash" TEXT NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "claimed" BOOLEAN NOT NULL DEFAULT false, "deviceId" TEXT, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);\nCREATE INDEX IF NOT EXISTS "TvPairSession_expiresAt_idx" ON "TvPairSession"("expiresAt");\n';
export const tvModels = ["TvScreen", "TvDevice", "TvPairSession"];
// Additive, transactional, backed up before SQLite changes; PostgreSQL uses migrations.
async function verify(db: any) {
  for (const model of ["tvScreen", "tvDevice", "tvPairSession"])
    await db[model].findFirst();
  const check = await db.$queryRawUnsafe("PRAGMA integrity_check");
  if (check[0]?.integrity_check !== "ok") throw Error("TV_SQLITE_SCHEMA_DRIFT");
}
export async function upgradeTvSchema(db: any, url: string) {
  if (!url.startsWith("file:")) {
    for (const model of ["tvScreen", "tvDevice", "tvPairSession"])
      await db[model].findFirst({ select: { id: true } });
    return;
  }
  const version =
    "tv." + createHash("sha256").update(tvSchemaDDL).digest("hex");
  await db.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "TvSchemaMigration" ("version" TEXT PRIMARY KEY NOT NULL)',
  );
  if (
    (
      await db.$queryRawUnsafe(
        'SELECT version FROM "TvSchemaMigration" WHERE version=?',
        version,
      )
    ).length
  ) {
    await verify(db);
    return;
  }
  const files = await db.$queryRawUnsafe("PRAGMA database_list"),
    file = files.find((x: any) => x.name === "main")?.file;
  if (!file) throw Error("TV_SQLITE_FILE_REQUIRED");
  const dir = path.join(path.dirname(file), "upgrade-backups");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const backup = path.join(dir, "tv-" + Date.now() + ".db");
  await db.$executeRawUnsafe(
    "VACUUM INTO '" + backup.replace(/'/g, "''") + "'",
  );
  await db.$transaction(async (tx: any) => {
    for (const sql of tvSchemaDDL.split(";").filter((x) => x.trim()))
      await tx.$executeRawUnsafe(sql);
    await tx.$executeRawUnsafe(
      'INSERT INTO "TvSchemaMigration" (version) VALUES (?)',
      version,
    );
  });
  await verify(db);
}
