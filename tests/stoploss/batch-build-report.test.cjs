const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const script = path.resolve(__dirname, '../../scripts/batch-build-report.cjs');

test('inventory includes committed changes and distinguishes uncommitted work', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-build-report-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Synthetic test');
    fs.writeFileSync(path.join(cwd, 'baseline.txt'), 'baseline\n');
    git('add', 'baseline.txt');git('commit', '-qm', 'baseline');
    const base = git('rev-parse', 'HEAD');
    fs.mkdirSync(path.join(cwd, 'shared'));
    fs.writeFileSync(path.join(cwd, 'shared', 'canvas.txt'), 'fill display\n');
    git('add', 'shared/canvas.txt');git('commit', '-qm', 'Fill display');
    const target = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(cwd, 'pending.txt'), 'other task\n');
    const run = (b, t) => JSON.parse(execFileSync(process.execPath, [script, '--base', b, '--target', t], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const report = run(base, target);
    assert.equal(report.targetSha, target);
    assert.deepEqual(report.files, ['shared/canvas.txt']);
    assert.deepEqual(report.components, ['shared']);
    assert.equal(report.commits[0].subject, 'Fill display');
    assert.match(report.currentWorktree.status, /pending.txt/);
    assert.equal(report.diffCheck.passed, true);
    assert.equal(report.approved, false);
    assert.deepEqual(run(target, target).commits, []);
    assert.throws(() => run(target, base), 'A reversed baseline must fail');
    assert.throws(() => run('HEAD', target), 'Unpinned references must fail');
    assert.equal(git('rev-parse', 'HEAD'), target);
    assert.match(git('status', '--short'), /pending.txt/);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('all ordinary builds require manual exact-source confirmation', () => {
  for (const [name, job] of [['ci', 'verify'], ['build-windows', 'build'], ['docker-publish', 'verify']]) {
    const file = path.resolve(__dirname, '../../.github/workflows', `${name}.yml`);
    const workflow = fs.readFileSync(file, 'utf8');
    const triggers = workflow.split('\non:\n')[1].split('\n\n')[0];
    assert.deepEqual([...triggers.matchAll(/^  (\w+):/gm)].map(match => match[1]), ['workflow_dispatch']);
    assert.match(triggers, /      reviewed_sha:\n(?:        .*\n)*        required: true/);
    assert.match(triggers, /      confirmed:\n(?:        .*\n)*        type: boolean\n        default: false/);
    assert.ok(workflow.includes(`  ${job}:\n    if: inputs.confirmed == true && inputs.reviewed_sha == github.sha\n`));
  }
});
