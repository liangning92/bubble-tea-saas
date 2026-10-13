const { execFileSync } = require('node:child_process');

function selectScope(files, fullRegression = false) {
  if (fullRegression) return 'legacy';
  const upgradePaths = [
    /^client-pos\/electron\//,
    /^client-pos\/src\/components\/UpdateNotification\.tsx$/,
    /^client-pos\/src\/pages\/LoginPage\.tsx$/,
    /^client-pos\/src\/(electron|types\/electron)\.d\.ts$/,
    /^client-pos\/installer\.nsh$/,
    /^(package|client-pos\/package)(-lock)?\.json$/,
    /^electron-builder\.json$/,
    /^server\/prisma\//,
    /^server\/src\/index\.ts$/,
    /^scripts\/(desktop-db-|prepare-desktop-template|validate-windows-|validate-authentic-295)/,
    /^scripts\/windows-validation-scope\.cjs$/,
    /^tests\/stoploss\/desktop-updater-gate\.test\.cjs$/,
    /^tests\/stoploss\/windows-validation-scope\.test\.cjs$/,
    /^\.github\/workflows\/(build-windows|release-windows)\.yml$/,
    /^\.github\/scripts\/(check-release-source|check-windows-backend|windows-release-tag)\./,
  ];
  return files.some(file => upgradePaths.some(pattern => pattern.test(file))) ? 'installer' : 'core';
}

function needsReceiptCheck(files, fullRegression = false) {
  return fullRegression || files.some(file =>
    /^client-pos\/electron\/main\./.test(file) ||
    /^client-admin\/src\/pages\/SettingsPage\./.test(file) ||
    /(^|\/)[^/]*(receipt|printer|print|logo)[^/]*\./i.test(file)
  );
}

if (require.main === module) {
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA;
  const requested = process.env.FULL_LEGACY_REGRESSION;
  if (!/^[a-f0-9]{40}$/.test(head || '')) throw Error('Expected full source HEAD_SHA');
  const fullRegression = requested === 'true';
  let scope;
  let receiptCheck;
  if (!base || /^0+$/.test(base)) {
    if (!fullRegression) throw Error('Scoped Windows validation requires the confirmed full BASE_SHA');
    scope = 'legacy';
    receiptCheck = true;
  } else {
    if (!/^[a-f0-9]{40}$/.test(base)) throw Error('Expected full comparison BASE_SHA');
    execFileSync('git', ['merge-base', '--is-ancestor', base, head]);
    const changed = execFileSync('git', ['diff', '--no-renames', '--name-only', base, head], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
    scope = selectScope(changed, fullRegression);
    receiptCheck = needsReceiptCheck(changed, fullRegression);
    process.stdout.write(`Changed files: ${changed.join(', ') || '(none)'}\n`);
  }
  process.stdout.write(`Windows validation scope: ${scope}; receipt check: ${receiptCheck}\n`);
  if (process.env.GITHUB_OUTPUT) require('node:fs').appendFileSync(process.env.GITHUB_OUTPUT, `SCOPE=${scope}\nRECEIPT_CHECK=${receiptCheck}\n`);
}

module.exports = { selectScope, needsReceiptCheck };
