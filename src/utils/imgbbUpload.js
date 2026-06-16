function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function uploadToImgbb(image) {
  console.log('[ImgBB] Starting upload...')
  console.log('[ImgBB] Image type:', typeof image, image instanceof File ? `File(${image.name}, ${image.size}bytes)` : (typeof image === 'string' ? image.substring(0, 60) + '...' : image?.constructor?.name))

  let imageToUpload = image

  if (typeof imageToUpload === 'string' && imageToUpload.startsWith('blob:')) {
    const response = await fetch(imageToUpload)
    imageToUpload = await response.blob()
    console.log('[ImgBB] Blob fetched, converted to blob, size:', imageToUpload.size)
  }

  // Try proxy first
  try {
    let base64Data
    if (typeof imageToUpload === 'string') {
      // Already base64 or data URL
      if (imageToUpload.startsWith('data:')) {
        base64Data = imageToUpload
      } else {
        // It's a remote URL, fetch and convert
        const resp = await fetch(imageToUpload)
        const blob = await resp.blob()
        base64Data = await blobToBase64(blob)
      }
    } else {
      // Blob/File → base64
      base64Data = await blobToBase64(imageToUpload)
    }

    console.log('[ImgBB] Attempting server proxy upload...')
    const proxyRes = await fetch('/api/imgbb-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data }),
    })
    const proxyData = await proxyRes.json()
    if (proxyData.success && proxyData.url) {
      console.log('[ImgBB] Proxy upload success! URL:', proxyData.url)
      return proxyData.url
    }
    console.warn('[ImgBB] Proxy returned error, falling back to direct:', proxyData.message || proxyData.error)
  } catch (proxyErr) {
    console.warn('[ImgBB] Proxy upload failed, falling back to direct:', proxyErr.message)
  }

  // Fallback: direct ImgBB upload
  console.log('[ImgBB] Falling back to direct ImgBB API upload...')
  const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY
  if (!IMGBB_API_KEY) {
    throw new Error('VITE_IMGBB_API_KEY is not configured. Cannot upload images.')
  }

  let fileToUpload = imageToUpload
  if (typeof fileToUpload === 'string') {
    const resp = await fetch(fileToUpload)
    fileToUpload = await resp.blob()
  }

  const formData = new FormData()
  formData.append('image', fileToUpload)

  const uploadUrl = `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`
  console.log('[ImgBB] POST (direct):', uploadUrl)

  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  })

  console.log('[ImgBB] Direct response status:', res.status, res.statusText)
  const data = await res.json()
  console.log('[ImgBB] Direct response:', JSON.stringify(data, null, 2))

  if (!data.success) {
    console.error('[ImgBB] Direct upload failed:', data.error?.message || '(no message)')
    throw new Error(data.error?.message || `ImgBB upload failed (HTTP ${res.status})`)
  }

  console.log('[ImgBB] Direct upload success! URL:', data.data.display_url)
  return data.data.display_url
}
