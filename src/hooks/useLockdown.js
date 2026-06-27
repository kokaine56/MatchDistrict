import { useEffect } from 'react'

export function useLockdown() {
  useEffect(() => {
    const handleContextMenu = (e) => e.preventDefault()
    document.addEventListener('contextmenu', handleContextMenu)

    const handleCopyCutPaste = (e) => e.preventDefault()
    document.addEventListener('copy', handleCopyCutPaste)
    document.addEventListener('cut', handleCopyCutPaste)

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('copy', handleCopyCutPaste)
      document.removeEventListener('cut', handleCopyCutPaste)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('wheel', handleWheel)
    }
  }, [])
}
