const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY

export async function uploadToImgbb(image) {
  console.log('[ImgBB] Starting upload...')
  console.log('[ImgBB] API Key present:', !!IMGBB_API_KEY, '| length:', IMGBB_API_KEY?.length)
  console.log('[ImgBB] Key prefix:', IMGBB_API_KEY?.substring(0, 4) + '...')
  console.log('[ImgBB] Image type:', typeof image, image instanceof File ? `File(${image.name}, ${image.size}bytes)` : (typeof image === 'string' ? image.substring(0, 50) + '...' : image?.constructor?.name))

  let imageToUpload = image

  if (typeof imageToUpload === 'string' && imageToUpload.startsWith('blob:')) {
    const response = await fetch(imageToUpload)
    imageToUpload = await response.blob()
    console.log('[ImgBB] Blob converted, size:', imageToUpload.size)
  }

  const formData = new FormData()
  formData.append('image', imageToUpload)

  const uploadUrl = `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`
  console.log('[ImgBB] POST', uploadUrl)

  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  })

  console.log('[ImgBB] Response status:', res.status, res.statusText)

  const data = await res.json()
  console.log('[ImgBB] Full response:', JSON.stringify(data, null, 2))

  if (!data.success) {
    console.error('[ImgBB] Upload failed. Error:', data.error?.message || '(no message)')
    console.error('[ImgBB] Error code:', data.error?.code || '(no code)')
    console.error('[ImgBB] Status:', res.status, res.statusText)
    console.error('[ImgBB] API Key present:', !!IMGBB_API_KEY, '| length:', IMGBB_API_KEY?.length)
    throw new Error(data.error?.message || `ImgBB upload failed (HTTP ${res.status})`)
  }

  console.log('[ImgBB] Upload success! URL:', data.data.display_url)
  return data.data.display_url
}
