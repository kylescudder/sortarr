export type Profile = {
  name: string
  givenName: string
  familyName: string
  email: string
  emailVerified: boolean
  image: string | null
}

export async function profileRequest(
  path = '/api/profile',
  init?: RequestInit
): Promise<Profile> {
  const response = await fetch(path, init)
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.error ?? 'Unable to load your profile.')
  return body
}

// iOS Safari refuses createImageBitmap for photos above its decode limit
// (recent iPhones shoot 24-48 MP), so fall back to an <img>, which Safari
// downsamples, before drawing onto the small canvas.
async function decodePhoto(file: File) {
  try {
    const bitmap = await createImageBitmap(file)
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close()
    }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return {
        image: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(url)
      }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('This photo could not be read. Try a different photo.')
    }
  }
}

export async function prepareAvatar(file: File) {
  // Safari may report an empty type for library photos; decoding decides.
  if (file.type && !file.type.startsWith('image/'))
    throw new Error('Choose a JPEG, PNG or WebP photo.')
  if (file.size > 30 * 1024 * 1024)
    throw new Error('Choose a photo smaller than 30 MB.')
  const decoded = await decodePhoto(file)
  const image = decoded.image
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not prepare this photo.')
    const side = Math.min(decoded.width, decoded.height)
    context.drawImage(
      image,
      (decoded.width - side) / 2,
      (decoded.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512
    )
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('This photo could not be prepared.')),
        'image/jpeg',
        0.85
      )
    )
  } finally {
    decoded.close()
  }
}
