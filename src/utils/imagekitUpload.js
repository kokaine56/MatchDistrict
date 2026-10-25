import { getAuthToken } from './getAuthToken';

export async function uploadImage(image) {
  let fileToUpload = image;
  let fileData = '';

  // Convert File/Blob or URLs to base64 or raw URL string
  if (typeof fileToUpload === 'string') {
    if (fileToUpload.startsWith('data:') || fileToUpload.startsWith('http')) {
      fileData = fileToUpload;
    } else if (fileToUpload.startsWith('blob:')) {
      const resp = await fetch(fileToUpload);
      const blob = await resp.blob();
      fileData = await blobToDataURL(blob);
    } else {
      fileData = fileToUpload;
    }
  } else if (fileToUpload instanceof Blob || fileToUpload instanceof File) {
    fileData = await blobToDataURL(fileToUpload);
  } else {
    throw new Error('Unsupported image format provided for upload.');
  }

  try {
    const token = await getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/media/upload', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ file: fileData }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (response.ok && data?.secure_url) {
      return data.secure_url;
    } else {
      console.error('[MediaUpload] API Error response:', data);
      const err = new Error(data?.message || data?.error?.message || 'Media upload failed');
      err.status = response.status;
      err.code = data?.error;
      err.ref = data?.ref || null;
      err.retryAfter = data?.retryAfter || response.headers.get('Retry-After') || null;
      throw err;
    }
  } catch (error) {
    console.error('[MediaUpload] Network/Request failure:', error);
    throw error;
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read blob as Base64'));
    reader.readAsDataURL(blob);
  });
}
