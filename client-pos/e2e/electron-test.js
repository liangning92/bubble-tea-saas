// Node.js script to test Electron app via CDP
const http = require('http')

const DEVTOOLS_URL = process.env.DEVTOOLS_URL || 'http://localhost:9222'
const PORT = 9222

async function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}/json`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

async function main() {
  console.log('Fetching DevTools targets...')
  const targets = await getTargets()
  console.log('Targets:', JSON.stringify(targets, null, 2))

  if (targets.length === 0) {
    console.error('No targets found!')
    process.exit(1)
  }

  // Try to find a page target
  const pageTarget = targets.find(t => t.type === 'page')
  if (!pageTarget) {
    console.error('No page target found')
    process.exit(1)
  }

  console.log('Page target URL:', pageTarget.url)
  console.log('Page target title:', pageTarget.title)
  console.log('Page target id:', pageTarget.id)

  // Use webSocketDebuggerUrl to connect via CDP
  console.log('WebSocket URL:', pageTarget.webSocketDebuggerUrl)
}

main().catch(e => {
  console.error('Error:', e)
  process.exit(1)
})
