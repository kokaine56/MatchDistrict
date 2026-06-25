export const generateUniqueUsername = (fullName) => {
  const cleanName = fullName.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const randomSuffix = Math.random().toString(36).substring(2, 8)
  return `${cleanName}_${randomSuffix}`
}
