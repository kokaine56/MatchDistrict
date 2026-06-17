export async function uploadImage(image) {
  let base64 = null

  if (typeof image === 'string') {
    if (image.startsWith('blob:') || image.startsWith('http')) {
      const resp = await fetch(image)
      const blob = await resp.blob()
      base64 = await blobToBase64(blob)
    } else if (image.startsWith('data:')) {
      base64 = image
    } else {
      throw new Error('Invalid image input')
    }
  } else if (image instanceof File || image instanceof Blob) {
    base64 = await blobToBase64(image)
  }

  if (!base64) {
    throw new Error('Could not process image for upload')
  }

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64 }),
  })

  const data = await res.json()
  if (data.success && data.url) {
    return data.url
  }
  throw new Error(data.message || data.error || 'Upload failed')
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
