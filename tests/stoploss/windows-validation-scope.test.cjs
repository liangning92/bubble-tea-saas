const assert = require('node:assert/strict');
const { selectScope, needsReceiptCheck } = require('../../scripts/windows-validation-scope.cjs');

assert.equal(selectScope(['client-pos/src/pages/POSPage.tsx']), 'core');
assert.equal(selectScope(['client-admin/src/pages/DashboardPage.tsx']), 'core');
assert.equal(selectScope(['client-pos/electron/updater.ts']), 'installer');
assert.equal(selectScope(['client-pos/src/components/UpdateNotification.tsx']), 'installer');
assert.equal(selectScope(['server/src/index.ts']), 'installer');
assert.equal(selectScope(['client-pos/installer.nsh']), 'installer');
assert.equal(selectScope(['server/prisma/schema.prisma']), 'installer');
assert.equal(selectScope(['server/package.json']), 'installer');
assert.equal(selectScope(['server/package-lock.json']), 'installer');
assert.equal(selectScope(['scripts/desktop-db-upgrade.py']), 'installer');
assert.equal(selectScope(['client-pos/src/pages/POSPage.tsx'], true), 'legacy');
assert.equal(needsReceiptCheck(['client-pos/src/pages/POSPage.tsx']), false);
assert.equal(needsReceiptCheck(['client-pos/src/components/ReceiptPreview.tsx']), true);
assert.equal(needsReceiptCheck(['client-pos/electron/main.ts']), true);
assert.equal(needsReceiptCheck(['client-pos/src/pages/POSPage.tsx'], true), true);
console.log('Windows validation scope selection passed');

// Execute the actual evidence parser without importing Windows-only fixture setup.
require('node:child_process').execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', String.raw`
import ast, pathlib, re
tree=ast.parse(pathlib.Path('scripts/validate-windows-manual-upgrade.py').read_text())
helper=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='startup_metrics')
scope={'re':re}
exec(compile(ast.Module(body=[helper],type_ignores=[]),'<actual-startup-evidence>','exec'),scope)
read=scope['startup_metrics']
def marks(pid,values):
    return '\n'.join('[STARTUP] '+name+' pid='+str(pid)+' elapsedMs='+str(value) for name,value in values)
old=marks(10,[('window-created',300),('login-visible',700),('api-ready',3000)])+'\n'
assert read(old,[{'ProcessId':20}]) is None
pending=marks(20,[('window-created',250),('login-visible',600)])+'\n'
assert read(old+pending,[{'ProcessId':20}]) is None
assert read(old+pending+marks(20,[('api-ready',2500)]),[{'ProcessId':20}])=={'window-created':250,'login-visible':600,'api-ready':2500}
# A reused PID cannot inherit the previous launch's API-ready event.
assert read(old+marks(10,[('window-created',200),('login-visible',500)]),[{'ProcessId':10}]) is None
try:
    read(marks(20,[('window-created',300),('login-visible',10001),('api-ready',11000)]),[{'ProcessId':20}])
except AssertionError:
    pass
else:
    raise AssertionError('The 10-second login appearance gate must remain enforced')
print('Startup evidence rejects stale health, old PID and incomplete/reused-PID marks; timing gate retained')
`], {stdio:'inherit'});

require('node:child_process').execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['tests/stoploss/windows-runtime-observation.test.py'], {stdio:'inherit'});
