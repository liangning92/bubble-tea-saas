export interface AttachmentProgress { loaded: number; total?: number }
export interface AttachmentOptions { signal?: AbortSignal; onProgress?: (progress: AttachmentProgress) => void }

// Only the mounted attachment owns these bytes. Nothing is written to browser storage.
export function createTeamAttachmentResource(load: (options: AttachmentOptions) => Promise<Blob>, current: () => boolean) {
  let cached: { blob: Blob; url: string } | undefined
  let pending: Promise<{ blob: Blob; url: string }> | undefined
  let controller: AbortController | undefined, disposed = false
  const valid = () => { if (disposed || !current()) throw new Error('TEAM_IDENTITY_REQUIRED') }
  return {
    read(onProgress?: AttachmentOptions['onProgress']) {
      valid()
      if (cached) return Promise.resolve(cached)
      if (pending) return pending
      controller = new AbortController()
      pending = load({ signal: controller.signal, onProgress }).then(blob => {
        valid()
        if (!blob.size || blob.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'application/pdf'].includes(blob.type.split(';')[0])) throw new Error('TEAM_FILE_INVALID')
        cached = { blob, url: URL.createObjectURL(blob) }
        return cached
      }).finally(() => { pending = undefined; controller = undefined })
      return pending
    },
    cancel() { controller?.abort() },
    dispose() { disposed = true; controller?.abort(); if (cached) URL.revokeObjectURL(cached.url); cached = undefined }
  }
}
