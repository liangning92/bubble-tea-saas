const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const pathToRegexp = require('../../server/node_modules/path-to-regexp');

test('all literal API collection routes precede matching object-id routes', () => {
  const problems = [];
  for (const file of fs.readdirSync('server/src/routes').filter(name => name.endsWith('.ts'))) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join('server/src/routes', file), 'utf8'), ts.ScriptTarget.Latest, true);
    const registered = [];
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source) === 'router' && ts.isStringLiteral(node.arguments[0])) {
        const verb = node.expression.name.text, route = node.arguments[0].text;
        if (['get', 'post', 'put', 'patch', 'delete'].includes(verb)) {
          if (!route.includes(':') && !route.includes('*')) {
            for (const earlier of registered) if (earlier.verb === verb && earlier.route.includes(':') && pathToRegexp(earlier.route).test(route)) problems.push(`${file} ${verb} ${route} is shadowed by ${earlier.route}`);
          }
          registered.push({ verb, route });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(problems, []);
});
