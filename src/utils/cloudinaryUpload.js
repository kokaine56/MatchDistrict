export async function uploadImage(image) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  if (!cloudName || !uploadPreset) {
    throw new Error('VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET must be set in the environment.')
  }

  let fileToUpload = image

  if (typeof fileToUpload === 'string') {
    if (fileToUpload.startsWith('blob:')) {
      const resp = await fetch(fileToUpload)
      fileToUpload = await resp.blob()
    } else if (fileToUpload.startsWith('http')) {
      const resp = await fetch(fileToUpload)
      fileToUpload = await resp.blob()
    } else if (fileToUpload.startsWith('data:')) {
      const resp = await fetch(fileToUpload)
      fileToUpload = await resp.blob()
    }
  }

  const formData = new FormData()
  formData.append('file', fileToUpload)
  formData.append('upload_preset', uploadPreset)

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    })

    const data = await response.json()

    if (response.ok && data.secure_url) {
      return data.secure_url
    } else {
      console.error('[CloudinaryUpload] API Error response:', data)
      throw new Error(data.error?.message || 'Cloudinary upload failed')
    }
  } catch (error) {
    console.error('[CloudinaryUpload] Network/Request failure:', error)
    throw error
  }
}
