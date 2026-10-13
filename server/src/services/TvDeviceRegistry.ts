import prisma from "../config/database";
export async function hasDesignatedTv(storeId: string) {
  const row = await prisma.config.findUnique({
    where: { storeId_key: { storeId, key: "tv_interactive_device" } },
  });
  if (!row?.value || !/^[a-f0-9-]{36}$/.test(row.value)) return false;
  return !!(await prisma.tvDevice.findFirst({
    where: { id: row.value, storeId, revoked: false },
    select: { id: true },
  }));
}
