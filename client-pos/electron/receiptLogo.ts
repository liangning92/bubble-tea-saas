import http from 'http'
import https from 'https'

/** Bound the entire download, including redirects, so a first receipt can include its logo. */
export function fetchReceiptLogo(url: string, timeoutMs = 2000, maxBytes = 5 * 1024 * 1024): Promise<Buffer | null> {
  return new Promise(resolve => {
    let request: http.ClientRequest | undefined
    let finished = false
    const finish = (value: Buffer | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      request?.destroy()
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    const download = (target: string, redirects: number) => {
      try {
        const parsed = new URL(target)
        if (!['http:', 'https:'].includes(parsed.protocol)) return finish(null)
        request = (parsed.protocol === 'https:' ? https : http).get(parsed, { headers: { 'User-Agent': 'Mozilla/5.0 YOUME-POS' } }, response => {
          if (finished) return response.destroy()
          if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location && redirects < 3) {
            response.resume()
            try { download(new URL(response.headers.location, parsed).href, redirects + 1) } catch { finish(null) }
            return
          }
          if (response.statusCode !== 200 || Number(response.headers['content-length'] || 0) > maxBytes) {
            response.destroy()
            return finish(null)
          }
          let size = 0
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > maxBytes) { response.destroy(); finish(null) }
            else chunks.push(chunk)
          })
          response.on('end', () => finish(size ? Buffer.concat(chunks) : null))
          response.on('error', () => finish(null))
          response.on('aborted', () => finish(null))
        })
        request.on('error', () => finish(null))
      } catch { finish(null) }
    }
    download(url, 0)
  })
}
