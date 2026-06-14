const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    include: {
      category: true,
      specs: true,
      bomItems: { include: { inventory: true } }
    }
  });

  console.log('Products in DB:', products.length);
  console.log('');

  products.forEach(p => {
    console.log(`【${p.name}】 ${p.category?.name || 'no category'}`);
    p.specs.forEach(s => console.log(`  Size: ${s.name} - ${s.price}`));
    if (p.bomItems.length) {
      p.bomItems.forEach(b => {
        console.log(`  BOM: ${b.inventory?.name || 'N/A'} x ${b.quantity} ${b.unit || ''}`);
      });
    }
    console.log('');
  });

  // Also check categories
  const cats = await prisma.category.findMany();
  console.log('--- Categories ---');
  cats.forEach(c => console.log(`  ${c.name}`));

  // Check inventory
  const inv = await prisma.inventory.findMany({ select: { name: true, category: true, unit: true } });
  console.log('--- Inventory ---');
  inv.forEach(i => console.log(`  ${i.name} | ${i.category} | ${i.unit}`));
}

main().finally(() => prisma.$disconnect());