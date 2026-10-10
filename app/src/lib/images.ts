// Photos are shrunk on the phone before upload (req §21): long side 1600 px, JPEG 0.7.
// A challan or bill stays readable at that size and is usually 150-400 KB.
const MAX_SIDE = 1600
const QUALITY = 0.7

// Formats every browser can show. Anything else is converted, never uploaded as is.
const SHOWABLE = /^image\/(jpeg|png|webp)$/
const HEIC = /\.(heic|heif)$/i

const UNREADABLE = 'This photo could not be read. Take it again with the camera, or pick a JPEG or PNG.'

/**
 * Decode a picked file. Chrome and Firefox cannot read HEIC (iPhone photos copied to a
 * computer), so those go through a converter that is about 3 MB and loads only when needed.
 */
async function decode(file: File): Promise<ImageBitmap | null> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (bitmap || !(/hei[cf]/.test(file.type) || HEIC.test(file.name))) return bitmap
  const { heicTo } = await import('heic-to')
  return heicTo({ blob: file, type: 'bitmap' }).catch(() => null)
}

export async function compressImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file
  const bitmap = await decode(file)
  if (!bitmap) throw new Error(UNREADABLE)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    // JPEG has no transparency: without a white backing, a transparent PNG turns black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  }
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  // Keep the original only when it is already small and in a format every browser shows.
  if (blob && (blob.size < file.size || !SHOWABLE.test(file.type))) return blob
  if (SHOWABLE.test(file.type)) return file
  throw new Error(UNREADABLE)
}

const LOGO_SIDE = 512

/**
 * A company logo, shrunk to 512 px on the long side. Kept as WebP (or PNG where the browser
 * cannot write WebP) so a transparent background stays transparent; JPEG would turn it black.
 */
export async function resizeLogo(file: File): Promise<{ blob: Blob; ext: 'webp' | 'png' | 'jpg' }> {
  const bitmap = await decode(file)
  if (!bitmap) throw new Error('This file is not a picture we can read. Use a PNG, JPEG or WebP image.')
  const scale = Math.min(1, LOGO_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const as = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9))
  const webp = await as('image/webp')
  if (webp?.type === 'image/webp') return { blob: webp, ext: 'webp' }
  const png = await as('image/png')
  if (png) return { blob: png, ext: 'png' }
  return { blob: file, ext: file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg' }
}
