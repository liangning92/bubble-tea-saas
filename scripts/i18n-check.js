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

const clientPath = process.argv[2]

if (!clientPath) {
  console.error('Usage: node scripts/i18n-check.js <client-path>')
  console.error('Example: node scripts/i18n-check.js client-pos')
  process.exit(1)
}

const i18nPath = path.join(clientPath, 'src/i18n/index.ts')
const srcPath = path.join(clientPath, 'src')

// 解析 i18n 文件，提取所有 key
// 结构: resources = { id: { translation: { ... } }, en: { translation: { ... } }, zh: { translation: { ... } } }
// 只解析 en 段即可，因为所有语言的 key 是相同的
function extractI18nKeys(content) {
  const keys = new Set()
  const lines = content.split('\n')

  // 找到 en: { } 块
  let enStartLine = -1, enEndLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'en: {') { enStartLine = i; break }
  }
  if (enStartLine === -1) return keys

  // 找 en 块的结束行
  let depth = 0
  for (let i = enStartLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++
      if (ch === '}') depth--
    }
    if (depth === 0 && i > enStartLine) { enEndLine = i; break }
  }

  // 提取 en 块中 translation 块的起止
  let transStartLine = -1, transEndLine = -1
  depth = 0
  for (let i = enStartLine; i < enEndLine; i++) {
    if (/translation:\s*\{/.test(lines[i])) { transStartLine = i; break }
  }
  if (transStartLine === -1) return keys

  for (let i = transStartLine; i < enEndLine; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++
      if (ch === '}') depth--
    }
    if (depth === 0 && i > transStartLine) { transEndLine = i; break }
  }

  // 逐字符解析，跳过字符串内的 {}
  const nsStack = []
  for (let i = transStartLine; i <= transEndLine; i++) {
    const line = lines[i]

    // 命名空间声明（行首的 "xxx: {" 模式）
    const nsMatch = line.match(/^(\s*)([a-zA-Z0-9_]+):\s*\{/)
    if (nsMatch) {
      nsStack.push(nsMatch[2])
      continue
    }

    // 逐字符处理，追踪是否在字符串内
    let inString = false
    let stringChar = ''
    let i2 = 0
    while (i2 < line.length) {
      const ch = line[i2]

      if (!inString && (ch === "'" || ch === '"')) {
        inString = true
        stringChar = ch
      } else if (inString && ch === stringChar && (ch !== '"' || line[i2 - 1] !== '\\')) {
        inString = false
        stringChar = ''
      } else if (!inString && ch === '}') {
        if (nsStack.length > 0) nsStack.pop()
      }

      i2++
    }

    // 提取 key: 'value' 或 key: "value"
    const kvMatch = line.match(/^\s*([a-zA-Z0-9_]+):\s*(['"])([^\2]*)\2/)
    if (kvMatch) {
      const stackWithoutTranslation = nsStack.filter(n => n !== 'translation')
      const fullKey = [...stackWithoutTranslation, kvMatch[1]].join('.')
      keys.add(fullKey)
    }
  }

  return keys
}

// 提取文件中的所有 t() 调用
function extractTCalls(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const calls = []

  // 匹配 t('key') 或 t("key")
  const regex = /(?<![a-zA-Z0-9_.])t\s*\(\s*['"]([^'"]+)['"]\s*(?:\|\||\))/g
  let match
  while ((match = regex.exec(content)) !== null) {
    calls.push({
      key: match[1],
      hasFallback: content.substring(match.index + match[0].length, match.index + match[0].length + 2).includes('||'),
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
  console.log(`📚 Found ${validKeys.size} translation keys`)

  // 扫描所有 TSX/TS 文件
  const files = glob.sync(`${srcPath}/**/*.{tsx,ts}`, {
    ignore: ['**/node_modules/**', '**/*.d.ts']
  })

  console.log(`\n📂 Scanning ${files.length} files...`)

  let issueCount = 0

  files.forEach(file => {
    const calls = extractTCalls(file)
    calls.forEach(call => {
      if (!validKeys.has(call.key)) {
        console.log(`  ❌ ${path.relative(clientPath, file)}:${call.line}`)
        console.log(`     Missing i18n key: '${call.key}'`)
        issueCount++
      } else if (call.hasFallback) {
        console.log(`  ⚠️  ${path.relative(clientPath, file)}:${call.line}`)
        console.log(`     Redundant fallback for key: '${call.key}'`)
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

main()
