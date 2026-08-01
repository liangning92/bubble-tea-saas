const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  // 删除旧记录（如果存在）
  await prisma.user.deleteMany({ where: { phone: '081234567890' } }).catch(() => {});

  // 用正确密码创建 admin123 的 bcrypt hash
  const hash = await bcrypt.hash('admin123', 10);
  console.log('hash:', hash);

  // 创建 User 记录
  const user = await prisma.user.create({
    data: {
      id: 'cmsa8otei0002clc3y8589px1',
      phone: '081234567890',
      password: hash,
      role: 'admin',
      storeId: 'cmq3cn8py0002ylapuoj05pw9',
    }
  });
  console.log('User created:', user.phone, user.role);

  await prisma.$disconnect();
}
fix().catch(e => { console.error(e); process.exit(1); });
