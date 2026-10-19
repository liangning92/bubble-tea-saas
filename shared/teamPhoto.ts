// Compress once before outbox persistence so retries always use identical bytes.
export async function prepareTeamPhoto(file: File): Promise<File> {
 if (!['image/jpeg', 'image/png'].includes(file.type) || file.size < 256 * 1024) return file
 const url = URL.createObjectURL(file), image = new Image()
 let timer: ReturnType<typeof setTimeout> | undefined
 try {
  await new Promise<void>((resolve, reject) => {
   timer = setTimeout(() => reject(new Error('PHOTO_DECODE_TIMEOUT')), 10000)
   image.onload = () => resolve(); image.onerror = () => reject(new Error('PHOTO_DECODE_FAILED')); image.src = url
  })
  clearTimeout(timer)
  const width = image.naturalWidth, height = image.naturalHeight
  if (!width || !height || width * height > 50000000) return file
  const scale = Math.min(1, 1600 / Math.max(width, height)), canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d'); if (!context) return file
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  try {
   const blob = await new Promise<Blob | null>(resolve => {
    timer = setTimeout(() => resolve(null), 10000)
    canvas.toBlob(resolve, file.type, file.type === 'image/jpeg' ? 0.78 : undefined)
   })
   if (!blob || !blob.size || blob.type !== file.type || blob.size >= file.size * 0.9) return file
   return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified })
  } finally { canvas.width = 0; canvas.height = 0 }
 } catch { return file }
 finally { clearTimeout(timer); image.onload = null; image.onerror = null; image.src = ''; URL.revokeObjectURL(url) }
}
export async function prepareTeamPhotos(files: File[]) {
 const prepared: File[] = []
 for (const file of files) prepared.push(await prepareTeamPhoto(file))
 return prepared
}
