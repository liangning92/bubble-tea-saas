/**
 * Update version in package.json with current date and time
 * Format: YYYY.MM.DD.HHMM
 */

const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const now = new Date()
const year = now.getFullYear()
const month = String(now.getMonth() + 1).padStart(2, '0')
const day = String(now.getDate()).padStart(2, '0')
const hours = String(now.getHours()).padStart(2, '0')
const minutes = String(now.getMinutes()).padStart(2, '0')

const newVersion = `${year}.${month}.${day}.${hours}${minutes}`

pkg.version = newVersion

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`Version updated to: ${newVersion}`)
