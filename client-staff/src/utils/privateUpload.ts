const MAX_PRIVATE_FILE_BYTES = 8 * 1024 * 1024

// A queued File may be restored from IndexedDB long after the picker closes.
// Read its bytes before opening the request, and send one complete in-memory
// multipart body instead of asking the browser to stream a file-backed File.
// The API still authenticates the owner, checks the signature/size and applies
// the original uploadRequestId; this does not change or remove the outbox item.
export async function privateUploadBody(file: File, purpose?: 'team', uploadRequestId?: string): Promise<Blob> {
  if (purpose !== undefined && purpose !== 'team') throw new Error('STAFF_UPLOAD_PURPOSE_INVALID')
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_PRIVATE_FILE_BYTES) {
    throw new Error('STAFF_FILE_SIZE_INVALID')
  }
  if (uploadRequestId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[0-4]$/i.test(uploadRequestId)) {
    throw new Error('STAFF_UPLOAD_REQUEST_INVALID')
  }
  let bytes: ArrayBuffer
  let readTimer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<ArrayBuffer>((_resolve, reject) => {
      readTimer = setTimeout(() => reject(new Error('STAFF_FILE_READ_FAILED')), 15000)
    })
    bytes = await Promise.race([file.arrayBuffer(), deadline])
  } catch { throw new Error('STAFF_FILE_READ_FAILED') }
  finally { if (readTimer !== undefined) clearTimeout(readTimer) }
  if (bytes.byteLength !== file.size) throw new Error('STAFF_FILE_READ_FAILED')

  const boundary = 'youme-private-' + crypto.randomUUID()
  const contentType = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) ? file.type : 'application/octet-stream'
  const parts: BlobPart[] = []
  const field = (name: string, value: string) => parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
  if (purpose) field('purpose', purpose)
  if (uploadRequestId) field('uploadRequestId', uploadRequestId)
  // No caller-controlled filename/header text is interpolated into the body.
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="attachment"\r\nContent-Type: ${contentType}\r\n\r\n`)
  parts.push(bytes, `\r\n--${boundary}--\r\n`)
  return new Blob(parts, { type: `multipart/form-data; boundary=${boundary}` })
}
