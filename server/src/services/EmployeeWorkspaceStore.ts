import { Prisma } from "@prisma/client";
import prisma from "../config/database";
export const WORK_PREFIX = "employee.workspace.";
export type WorkDB = Prisma.TransactionClient;
export async function readWork<T = any>(
  storeId: string,
  key: string,
  db: WorkDB = prisma,
): Promise<T | null> {
  const row = await db.config.findUnique({
    where: { storeId_key: { storeId, key: WORK_PREFIX + key } },
  });
  return row ? JSON.parse(row.value) : null;
}
export async function writeWork(
  storeId: string,
  key: string,
  value: any,
  db: WorkDB = prisma,
) {
  const data = JSON.stringify(value);
  await db.config.upsert({
    where: { storeId_key: { storeId, key: WORK_PREFIX + key } },
    create: { storeId, key: WORK_PREFIX + key, value: data, category: "staff" },
    update: { value: data },
  });
  return value;
}
export async function listWork<T = any>(
  storeId: string,
  prefix: string,
  db: WorkDB = prisma,
): Promise<T[]> {
  return (
    await db.config.findMany({
      where: { storeId, key: { startsWith: WORK_PREFIX + prefix } },
      orderBy: { createdAt: "desc" },
    })
  ).map((row) => JSON.parse(row.value));
}
export async function workLock(storeId: string, key: string, db: WorkDB) {
  await writeWork(
    storeId,
    `lock.${key}`,
    { lockedAt: new Date().toISOString() },
    db,
  );
}
