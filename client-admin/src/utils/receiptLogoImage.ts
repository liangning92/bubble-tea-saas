// Produce the actual monochrome image saved for thermal receipt printing.
// Transparent white artwork is treated as an ink mask, rather than white ink.
export async function receiptLogoImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 576 / bitmap.width, 1024 / bitmap.height)
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('LOGO_IMAGE_FAILED')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const data = pixels.data
    let transparent = 0, foreground = 0, white = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) transparent++
      else {
        foreground++
        if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) white++
      }
    }
    const whiteMask = transparent > 0 && foreground > 0 && white / foreground > 0.99
    let ink = 0
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255
      const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) * alpha + 255 * (1 - alpha)
      const visible = whiteMask ? alpha >= 0.5 : brightness < 180
      data[i] = data[i + 1] = data[i + 2] = 0
      data[i + 3] = visible ? 255 : 0
      if (visible) ink++
    }
    if (!ink) throw new Error('LOGO_HAS_NO_INK')
    context.putImageData(pixels, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('LOGO_IMAGE_FAILED')), 'image/png'))
    return new File([blob], 'receipt-logo-black.png', { type: 'image/png' })
  } finally { bitmap.close() }
}
