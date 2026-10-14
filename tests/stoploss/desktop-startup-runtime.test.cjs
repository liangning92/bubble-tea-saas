const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('client-pos/electron/main.ts', 'utf8');

// Execute the actual startup preflight with Windows runtime detection unavailable.
// Stop at shortcut registration: later API/window creation has separate upgrade tests.
async function startup(printerLoadFailed) {
  const start = source.indexOf('app.whenReady().then(async () => {');
  const end = source.indexOf('  // 注册全局快捷键', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start + 'app.whenReady().then(async () => {'.length, end);
  const calls = {continued: false, quit: false, registry: 0, dialogs: []};
  const context = {
    process: {platform: 'win32'}, printerLoadFailed,
    windowsPrinter: {warm: async () => {}}, writeCrash() {},
    console: {log() {}, error() {}},
    app: {quit: () => {calls.quit = true;}},
    dialog: {
      showErrorBox: (...args) => calls.dialogs.push(args),
      showMessageBox: options => calls.dialogs.push(options),
    },
    checkWebView2: () => {calls.registry++; return false;},
    require: () => {throw Error('External runtime checks are unavailable');},
    proceed: () => {calls.continued = true;},
  };
  const code = ts.transpileModule('(async () => {' + body + '\nproceed();})()', {
    compilerOptions: {target: ts.ScriptTarget.ES2020},
  }).outputText;
  await vm.runInNewContext(code, context);
  return calls;
}

test('Windows startup continues without WebView2 and without a missing-runtime dialog', async () => {
  const calls = await startup(false);
  assert.equal(calls.continued, true);
  assert.equal(calls.quit, false);
  assert.equal(calls.registry, 0);
  assert.equal(calls.dialogs.length, 0);
  assert.doesNotMatch(source, /function checkWebView2|reg query|WebView2 MISSING/);
});

test('printer startup warning uses Indonesian and keeps POS startup available', async () => {
  const calls = await startup(true);
  assert.equal(calls.continued, true);
  assert.equal(calls.quit, false);
  assert.equal(calls.dialogs.length, 1);
  assert.equal(calls.dialogs[0].title, 'Modul printer gagal dimuat');
  assert.doesNotMatch(JSON.stringify(calls.dialogs), /[\u3400-\u9fff]/);
});

test('ambiguous historical profiles retain the blocking data safety guard in Indonesian', () => {
  const start = source.indexOf("if (process.platform === 'win32') {");
  const end = source.indexOf('function getOrCreateLocalJwtSecret', start);
  const errors = [], exits = [];
  vm.runInNewContext(source.slice(start, end), {
    process: {platform: 'win32', env: {}},
    app: {getPath: () => 'old-profile', exit: code => exits.push(code)},
    resolvePosDataProfile: () => {throw Error('ambiguous profiles');},
    dialog: {showErrorBox: (...args) => errors.push(args)},
  });
  assert.deepEqual(exits, [73]);
  assert.equal(errors[0][0], 'Data POS perlu diperiksa');
  assert.doesNotMatch(JSON.stringify(errors), /[\u3400-\u9fff]/);
});

function secondLaunch(mainWindow) {
  const begin = source.indexOf("app.on('second-instance', () => {");
  const end = source.indexOf('// 应用启动', begin);
  let handler;
  const hiddenReceipt = {focus() {throw Error('Hidden receipt window must never receive cashier focus');}};
  vm.runInNewContext(source.slice(begin, end), {
    app: {on: (_name, callback) => {handler = callback;}}, mainWindow,
    BrowserWindow: {getAllWindows: () => [hiddenReceipt, mainWindow]},
    require: () => ({BrowserWindow: {getAllWindows: () => [hiddenReceipt, mainWindow]}}),
    setTimeout: callback => callback(),
  });
  handler();
}

test('launching POS again restores the cashier even when a hidden receipt window exists first', () => {
  const actions = [];
  secondLaunch({isDestroyed: () => false, isMinimized: () => true,
    restore: () => actions.push('restore'), show: () => actions.push('show'), focus: () => actions.push('focus')});
  assert.deepEqual(actions, ['restore', 'show', 'focus']);
});

test('missing or destroyed cashier is never replaced by a hidden renderer as the focus target', () => {
  secondLaunch(null);
  secondLaunch({isDestroyed: () => true});
});

test('closing Windows cashier exits normally even if a receipt renderer remains alive', () => {
  const begin = source.indexOf("  mainWindow.on('closed', () => {");
  const end = source.indexOf("  console.log('[Electron] Main window created')", begin);
  let handler;
  const actions = [];
  vm.runInNewContext(source.slice(begin, end), {
    mainWindow: {on: (_name, callback) => {handler = callback;}},
    customerWindow: {close: () => actions.push('customer-close')},
    process: {platform: 'win32'}, app: {quit: () => actions.push('normal-quit')},
  });
  handler();
  assert.deepEqual(actions, ['customer-close', 'normal-quit']);
});
