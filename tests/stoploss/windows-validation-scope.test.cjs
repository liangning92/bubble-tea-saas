const assert = require('node:assert/strict');
const { selectScope, needsReceiptCheck } = require('../../scripts/windows-validation-scope.cjs');

assert.equal(selectScope(['client-pos/src/pages/POSPage.tsx']), 'core');
assert.equal(selectScope(['client-admin/src/pages/DashboardPage.tsx']), 'core');
assert.equal(selectScope(['client-pos/electron/updater.ts']), 'installer');
assert.equal(selectScope(['client-pos/src/components/UpdateNotification.tsx']), 'installer');
assert.equal(selectScope(['server/src/index.ts']), 'installer');
assert.equal(selectScope(['client-pos/installer.nsh']), 'installer');
assert.equal(selectScope(['server/prisma/schema.prisma']), 'installer');
assert.equal(selectScope(['scripts/desktop-db-upgrade.py']), 'installer');
assert.equal(selectScope(['client-pos/src/pages/POSPage.tsx'], true), 'legacy');
assert.equal(needsReceiptCheck(['client-pos/src/pages/POSPage.tsx']), false);
assert.equal(needsReceiptCheck(['client-pos/src/components/ReceiptPreview.tsx']), true);
assert.equal(needsReceiptCheck(['client-pos/electron/main.ts']), true);
assert.equal(needsReceiptCheck(['client-pos/src/pages/POSPage.tsx'], true), true);
console.log('Windows validation scope selection passed');
