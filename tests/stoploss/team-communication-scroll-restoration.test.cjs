const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const { execFileSync } = require('node:child_process')
const source = process.env.TEAM_CHAT_SOURCE_REF
 ? execFileSync('git', ['show', process.env.TEAM_CHAT_SOURCE_REF + ':shared/TeamChatMessages.tsx'], { encoding: 'utf8' })
 : fs.readFileSync('shared/TeamChatMessages.tsx', 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText

function fixture(saved = { top: 25237, bottom: false }) {
 const slots = [], positions = new Map(saved ? [['qa', { ...saved }]] : []), assignments = []
 let cursor = 0, layouts = [], effects = [], height = 9145, top = 0, observer
 const element = { clientHeight: 606, get scrollHeight() { return height }, get scrollTop() { return top }, set scrollTop(value) { top = Math.max(0, Math.min(value, height - 606)); assignments.push(top) } }
 const react = {
  Children: { count: children => Array.isArray(children) ? children.length : children == null ? 0 : 1 }, Fragment: Symbol.for('react.fragment'),
  useRef: value => { const index = cursor++; return slots[index] ||= { current: value } },
  useState: value => { const index = cursor++; slots[index] ??= value; return [slots[index], next => { slots[index] = next }] },
  useLayoutEffect: (fn, deps) => schedule(layouts, fn, deps), useEffect: (fn, deps) => schedule(effects, fn, deps)
 }
 function schedule(queue, fn, deps) {
  const index = cursor++, previous = slots[index]
  if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) { slots[index] = deps; queue.push(fn) }
 }
 const scope = { exports: {}, require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? require(name) : name === './teamWorkCopy' ? { teamWorkCopy: () => ({ loading: 'Loading' }) } : name === './teamChatCopy' ? { teamChatCopy: () => ({}) } : { TeamAttachment: () => null }, ResizeObserver: class { constructor(callback) { observer = callback } observe() {} disconnect() {} }, document: { addEventListener() {}, removeEventListener() {} } }
 vm.runInNewContext(code, scope)
 const children = [], base = { client: {}, staffId: 'qa', channelId: 'qa', query: '', language: 'en', children, scrollPositions: positions }
 let log
 function find(node) {
  if (!node || typeof node !== 'object') return
  if (node.props?.['data-testid'] === 'team-messages') return node
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child); if (found) return found }
 }
 return {
  positions, assignments, element,
  render(count, ready, nextHeight, historyFailed = false) {
   height = nextHeight; cursor = 0; layouts = []; effects = []
   const messages = Array.from({ length: count }, (_, i) => ({ id: String(i), seq: i + 1, authorId: 'qa', authorName: 'QA', text: 'Synthetic', files: [], createdAt: '2026-10-19T00:00:00Z' }))
   const tree = scope.exports.TeamChatMessages({ ...base, messages, historyReady: ready, historyFailed })
   log = find(tree); log.ref.current = element; log.props.children.ref.current = {}
   layouts.forEach(fn => fn()); effects.forEach(fn => fn())
   return tree
  },
  scrollEvent() { log.props.onScroll() }, resize() { observer?.() },
  readAt(value, deltaY = -1) { log.props.onWheel({ deltaY }); element.scrollTop = value; log.props.onScroll() }
 }
}

test('saved reading position waits for all 100-message pages without clamping or overwriting the bookmark', () => {
 const f = fixture()
 f.render(100, false, 9145); f.scrollEvent(); f.resize()
 f.render(200, false, 18214); f.scrollEvent(); f.resize()
 assert.deepEqual(f.assignments, [])
 assert.deepEqual({ ...f.positions.get('qa') }, { top: 25237, bottom: false })
 f.render(300, true, 27283); f.scrollEvent()
 assert.deepEqual(f.assignments, [25237])
 assert.equal(f.element.scrollTop, 25237)
 f.render(300, true, 27283); f.resize()
 assert.deepEqual(f.assignments, [25237])
})

test('latest-end preference still follows pages, while intentional reading survives content resize', () => {
 const f = fixture({ top: 0, bottom: true })
 f.render(100, false, 9145); assert.equal(f.element.scrollTop, 8539)
 f.render(200, false, 18214); assert.equal(f.element.scrollTop, 17608)
 f.render(300, true, 27283); assert.equal(f.element.scrollTop, 26677)
 f.readAt(25237); f.render(301, true, 27373); f.resize()
 assert.equal(f.element.scrollTop, 25237)
 assert.deepEqual({ ...f.positions.get('qa') }, { top: 25237, bottom: false })
})

test('default ready history restores directly and shorter completed history clamps only once', () => {
 const f = fixture()
 f.render(100, undefined, 9145)
 assert.deepEqual(f.assignments, [8539])
 const g = fixture({ top: 1061, bottom: false })
 g.render(24, true, 2253); g.scrollEvent(); g.resize()
 assert.deepEqual(g.assignments, [1061])
})


test('history failure reveals available messages without losing the bookmark, and manual reading cancels pending restore', () => {
 const f = fixture()
 const tree = f.render(100, false, 9145, true)
 assert.equal(tree.props['aria-busy'], undefined)
 assert.deepEqual(f.assignments, [])
 assert.deepEqual({ ...f.positions.get('qa') }, { top: 25237, bottom: false })
 f.readAt(1000, 1); f.render(300, true, 27283)
 assert.equal(f.element.scrollTop, 1000)
})
