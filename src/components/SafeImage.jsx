import { sanitizeImageUrl } from '../utils/userStorage.js'

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=500&q=80'

/** Renders an image only when src is a safe http(s) URL; avoids base64/huge URLs crashing the UI */
export default function SafeImage({ src, alt, className, fallback = FALLBACK_AVATAR, ...props }) {
  const safeSrc = sanitizeImageUrl(src) || fallback
  return <img src={safeSrc} alt={alt} className={className} loading="lazy" decoding="async" {...props} />
}
