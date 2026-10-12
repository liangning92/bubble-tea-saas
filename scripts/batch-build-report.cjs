// Read-only inventory. Human approval and remote/other-task checks stay with the agent.
const { execFileSync } = require('node:child_process');
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
}
function report(base, target) {
  const resolve = ref => git('rev-parse', '--verify', `${ref}^{commit}`);
  if (![base, target].every(ref => /^[a-f0-9]{40}$/.test(ref || ''))) {
    throw Error('Provide full 40-character --base and --target commit SHAs');
  }
  base = resolve(base);
  target = resolve(target);
  git('merge-base', '--is-ancestor', base, target);
  const commits = git('log', '--reverse', '--format=%H%x09%s', `${base}..${target}`)
    .split('\n').filter(Boolean).map(line => {
      const [sha, ...subject] = line.split('\t');
      return { sha, subject: subject.join('\t') };
    });
  const files = git('diff', '--name-only', '-z', base, target).split('\0').filter(Boolean);
  let diffCheck = { passed: true };
  try { git('diff', '--check', base, target); }
  catch (error) { diffCheck = { passed: false, details: error.stdout?.toString() || error.message }; }
  return {
    baseSha: base, targetSha: target, commits, files,
    components: [...new Set(files.map(file => file.split('/')[0]))].sort(),
    diffCheck,
    currentWorktree: { headSha: git('rev-parse', 'HEAD'), status: git('status', '--short') },
    pendingRemoteAndOtherTaskChecks: ['Unmerged PRs', 'Unpushed commits', 'Other worktrees or clones', 'Component-specific checks'],
    approved: false,
    note: 'Inventory only. Uncommitted files are excluded from targetSha; no build or publication was run.',
  };
}
module.exports = { report };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--base' || args[2] !== '--target') {
      throw Error('Usage: node scripts/batch-build-report.cjs --base <SHA> --target <SHA>');
    }
    console.log(JSON.stringify(report(args[1], args[3]), null, 2));
  } catch (error) { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; }
}
