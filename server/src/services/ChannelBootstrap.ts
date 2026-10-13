import prisma from "../config/database";
// 默认渠道配置
const DEFAULT_CHANNELS = [
  {
    name: "堂食",
    code: "DINE_IN",
    icon: "🍵",
    commission: 0,
    sortOrder: 1,
    availableDays: "1,2,3,4,5,6,7",
    availableHours: "08:00-22:00",
    minOrderAmount: 0,
    dailyOrderLimit: 0,
  },
  {
    name: "GoFood",
    code: "GOFOOD",
    icon: "🟢",
    commission: 0.2,
    sortOrder: 2,
    availableDays: "1,2,3,4,5,6,7",
    availableHours: "09:00-21:00",
    minOrderAmount: 25000,
    dailyOrderLimit: 50,
  },
  {
    name: "GrabFood",
    code: "GRAB",
    icon: "🟡",
    commission: 0.2,
    sortOrder: 3,
    availableDays: "1,2,3,4,5,6,7",
    availableHours: "09:00-21:00",
    minOrderAmount: 25000,
    dailyOrderLimit: 50,
  },
  {
    name: "ShopeeFood",
    code: "SHOPEE",
    icon: "🟠",
    commission: 0.18,
    sortOrder: 4,
    availableDays: "1,2,3,4,5,6,7",
    availableHours: "09:00-21:00",
    minOrderAmount: 20000,
    dailyOrderLimit: 30,
  },
];

export async function getOrCreateStoreChannels(storeId: string) {
  const channels = await prisma.channel.findMany({
    where: { storeId },
    orderBy: { sortOrder: "asc" },
  });
  if (channels.length) return channels;
  await prisma.channel
    .createMany({
      data: DEFAULT_CHANNELS.map((ch) => ({
        ...ch,
        storeId,
        status: "active",
      })),
    })
    .catch(async (error: unknown) => {
      if ((error as { code?: string })?.code !== "P2002") throw error;
      const existing = await prisma.channel.findMany({ where: { storeId } });
      if (
        !DEFAULT_CHANNELS.every((channel) =>
          existing.some((row) => row.code === channel.code),
        )
      )
        throw error;
    });
  return prisma.channel.findMany({
    where: { storeId },
    orderBy: { sortOrder: "asc" },
  });
}
