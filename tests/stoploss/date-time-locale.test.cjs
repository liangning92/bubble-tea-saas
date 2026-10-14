const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { buildSync } = require('esbuild')
const root = path.resolve(__dirname, '../..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'youme-date-locale-'))
let fixture
try {
  const outfile = path.join(temp, 'fixture.cjs')
  buildSync({ stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import i18n from 'i18next';
    import { initReactI18next } from 'react-i18next';
    import { LocalizedDateTimeInput } from './shared/components/LocalizedDateTimeInput';
    i18n.use(initReactI18next).init({ lng:'en', fallbackLng:'en', resources:{ en:{translation:{}}, id:{translation:{}}, zh:{translation:{}} }, initImmediate:false });
    export function render(language, props) { i18n.changeLanguage(language); return renderToStaticMarkup(React.createElement(LocalizedDateTimeInput, props)); }
  `, resolveDir: root, sourcefile: 'date-locale-fixture.tsx', loader: 'tsx' }, outfile, jsx: 'automatic', bundle: true, platform: 'node', format: 'cjs', loader: { '.css': 'empty' }, logLevel: 'silent' })
  fixture = require(outfile)
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

test('date fields follow app locale independently of browser locale', () => {
  for (const language of ['en', 'id', 'zh']) {
    const html = fixture.render(language, { type: 'date', value: '2026-10-15', name: 'date', required: true })
    const locale = language === 'zh' ? 'zh-CN' : language === 'id' ? 'id-ID' : 'en-GB'
    const expected = new Intl.DateTimeFormat(locale, { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(2026, 9, 15, 12))
    assert.ok(html.includes(`value="${expected}"`), html)
    assert.ok(html.includes('type="hidden" name="date" value="2026-10-15"'), html)
    assert.equal((html.match(/name="date"/g) || []).length, 1)
    assert.ok(html.includes('required=""'))
    assert.ok(!html.includes('type="date"'))
  }
})

test('empty dates and month names switch language, including regional locales', () => {
  assert.ok(fixture.render('id-ID', {type:'date', value:''}).includes('aria-label="Pilih tanggal"'))
  assert.ok(fixture.render('en', {type:'month', value:'2026-10'}).includes('October 2026'))
  assert.ok(fixture.render('id', {type:'month', value:'2026-10'}).includes('Oktober 2026'))
  assert.ok(fixture.render('zh', {type:'month', value:'2026-10'}).includes('2026年10月'))
})

test('time and datetime values retain exact API values and disabled state', () => {
  for (const language of ['en', 'id', 'zh']) {
    const time = fixture.render(language, { type:'time', value:'23:45', disabled:true, name:'time' })
    assert.ok(time.includes('value="23:45"'))
    assert.ok(time.includes('disabled=""'))
    assert.ok(!time.includes('type="time"'))
    const datetime = fixture.render(language, { type:'datetime-local', value:'2026-10-15T23:45', name:'startsAt' })
    assert.ok(datetime.includes('type="hidden" name="startsAt" value="2026-10-15T23:45"'))
    assert.ok(!datetime.includes('type="datetime-local"'))
  }
})

test('all three apps use the shared picker for page and modal fields', () => {
  function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [path.join(dir, entry.name)] : []) }
  for (const app of ['client-admin', 'client-pos', 'client-staff']) {
    for (const file of walk(path.join(root, app, 'src'))) {
      const source = fs.readFileSync(file, 'utf8')
      const native = [...source.matchAll(/<input\b(?:[^>]|=>)*?\/>/g)].filter(m => /\btype\s*=\s*['"](?:date|time|month|datetime-local)['"]/.test(m[0]))
      assert.equal(native.length, 0, `${path.relative(root, file)} still delegates locale to the browser`)
    }
  }
})

test('date and time text in pages and dialogs never falls back to browser language', () => {
  const ts = require('typescript')
  function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [path.join(dir, entry.name)] : []) }
  for (const app of ['client-admin', 'client-pos', 'client-staff']) for (const file of walk(path.join(root, app, 'src'))) {
    const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text
        const receiver = node.expression.expression
        const isDate = ['toLocaleDateString', 'toLocaleTimeString'].includes(method) || (method === 'toLocaleString' && ts.isNewExpression(receiver) && receiver.expression.getText(tree) === 'Date')
        if (isDate) {
          assert.ok(node.arguments.length > 0, `${path.relative(root, file)} delegates ${method} to browser language`)
          assert.ok(!(node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'zh-CN'), `${path.relative(root, file)} hardcodes Chinese date display`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
})
