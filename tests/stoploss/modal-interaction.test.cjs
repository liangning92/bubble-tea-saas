const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const ts = require('typescript');
test('modal content restores interaction when its fixed backdrop disables pointer events', () => {
  const failures = [];
  const files = execFileSync('git', ['ls-files', 'client-admin/src', 'client-staff/src', 'client-pos/src'], {encoding:'utf8'}).trim().split('\n').filter(f => f.endsWith('.tsx'));
  for (const file of files) {
    const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const classes = node => {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const attr = opening.attributes?.properties.find(p => p.name?.getText(tree) === 'className');
      return attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : '';
    };
    const visit = node => {
      if (ts.isJsxElement(node) && /\bfixed\b/.test(classes(node)) && /\bpointer-events-none\b/.test(classes(node))) {
        for (const child of node.children.filter(ts.isJsxElement)) {
          if (!/\bpointer-events-auto\b/.test(classes(child))) failures.push(`${file}:${tree.getLineAndCharacterOfPosition(child.getStart()).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  assert.deepEqual(failures, [], 'Modal content is unreachable by mouse: ' + failures.join(', '));
});
