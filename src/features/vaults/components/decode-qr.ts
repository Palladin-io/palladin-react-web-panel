import jsQR from 'jsqr'

/**
 * Decode a QR-code image entirely in the browser and return the embedded text
 * (typically an `otpauth://` URI). The image is rasterised to a canvas and
 * handed to jsQR — nothing leaves the device, matching the zero-knowledge
 * constraint (a 2FA seed must never touch the network or a third-party service).
 *
 * Returns null when no QR is found or the file can't be decoded. `blob:` object
 * URLs created here are always revoked.
 */
export async function decodeQrImage(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx || canvas.width === 0 || canvas.height === 0) return null
    ctx.drawImage(image, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(data, width, height)
    return result?.data ?? null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image load failed'))
    image.src = src
  })
}
