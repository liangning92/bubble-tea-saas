#!/usr/bin/env node
/**
 * i18n Lint Script
 * 检查代码中是否存在：
 * 1. t() 调用但 key 不存在于 i18n/index.ts
 * 2. t('key') || 'fallback' 模式（fallback 应移除）
 * 3. 硬编码的中文/英文字符串
 *
 * 用法: node scripts/i18n-check.js <client-path>
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')
const ts = require('typescript')

const clientPath = process.argv[2] || ''

if (require.main === module && !clientPath) {
  console.error('Usage: node scripts/i18n-check.js <client-path>')
  console.error('Example: node scripts/i18n-check.js client-pos')
  process.exit(1)
}

const i18nPath = path.join(clientPath, 'src/i18n/index.ts')
const srcPath = path.join(clientPath, 'src')

// Read literal resource objects without executing application code. AST traversal
// handles inline namespaces, interpolation braces and escaped strings correctly.
function extractI18nKeys(content, language = 'en') {
  const source = ts.createSourceFile('i18n.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let resources
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'resources') resources = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  const unwrap = node => {
    while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression
    return node
  }
  const properties = node => {
    node = unwrap(node)
    if (!node || !ts.isObjectLiteralExpression(node)) return new Map()
    const result = new Map()
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) || ts.isNumericLiteral(prop.name))) result.set(prop.name.text, prop.initializer)
    }
    return result // last duplicate property wins, matching JavaScript resources
  }
  const translation = properties(properties(resources).get(language)).get('translation')
  if (!translation) throw new Error(`Missing literal resources.${language}.translation`)
  const keys = new Set()
  function collect(node, prefix) {
    for (const [name, raw] of properties(node)) {
      const value = unwrap(raw), key = prefix ? `${prefix}.${name}` : name
      if (ts.isObjectLiteralExpression(value)) collect(value, key)
      else if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) keys.add(key)
    }
  }
  collect(translation, '')
  return keys
}

// 提取文件中的所有 t() 调用
function extractTCalls(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const calls = []

  // Match the static translation key (including calls with options/fallback values).
  const regex = /(?<![a-zA-Z0-9_.])t\s*\(\s*(['"])([^'"]+)\1/g
  let match
  while ((match = regex.exec(content)) !== null) {
    const lineEnd = content.indexOf('\n', match.index)
    const statement = content.slice(match.index, lineEnd === -1 ? content.length : lineEnd)
    const fallbackMatch = statement.match(/^t\s*\(\s*['"][^'"]+['"]\s*,\s*(['"])(.*?)\1/)
    if (match[2].endsWith('.')) continue // Ignore dynamic namespace prefixes such as t(`hygiene.${key}`).
    calls.push({
      key: match[2],
      hasChineseFallback: !!fallbackMatch && /[一-龥]/.test(fallbackMatch[2]),
      line: content.substring(0, match.index).split('\n').length,
      file: filePath
    })
  }

  // 匹配直接的硬编码中文（排除注释和 i18n 文件本身）
  if (!filePath.includes('i18n/index')) {
    const chineseRegex = /[一-龥]+/g
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      // 排除注释中的中文（包括 JSX 注释 {/* */}）
      const trimmed = line.trim()
      if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('{/*')) {
        const chinese = line.match(chineseRegex)
        if (chinese) {
          const isComment = line.includes('//') || line.includes('/*')
          if (!isComment) {
            console.log(`  ⚠️  Line ${idx + 1}: 疑似硬编码中文: ${line.trim().substring(0, 50)}`)
          }
        }
      }
    })
  }

  return calls
}

// 主函数
function main() {
  console.log(`\n🔍 i18n Lint: ${clientPath}`)
  console.log('='.repeat(50))

  // 读取 i18n 文件
  if (!fs.existsSync(i18nPath)) {
    console.error(`❌ i18n file not found: ${i18nPath}`)
    process.exit(1)
  }

  const i18nContent = fs.readFileSync(i18nPath, 'utf-8')
  const validKeys = extractI18nKeys(i18nContent)
  const idKeys = extractI18nKeys(i18nContent, 'id')
  console.log(`📚 Found ${idKeys.size} Indonesian translation keys`)

  // 扫描所有 TSX/TS 文件
  const files = glob.sync(`${srcPath}/**/*.{tsx,ts}`, {
    ignore: ['**/node_modules/**', '**/*.d.ts']
  })

  console.log(`\n📂 Scanning ${files.length} files...`)

  let issueCount = 0

  files.forEach(file => {
    const calls = extractTCalls(file)
    calls.forEach(call => {
      if (!idKeys.has(call.key)) {
        console.log(`  ❌ ${path.relative(clientPath, file)}:${call.line}`)
        console.log(`     Missing Indonesian translation: '${call.key}'`)
        issueCount++
      }
    })
  })

  console.log('\n' + '='.repeat(50))
  if (issueCount > 0) {
    console.log(`❌ Found ${issueCount} i18n issues`)
    process.exit(1)
  } else {
    console.log('✅ No i18n issues found')
  }
}

if (require.main === module) main()
module.exports = { extractI18nKeys, extractTCalls }
