const COMBINING_MARKS = /[\u0300-\u036f]/g
const UNSAFE_SLUG_CHARACTERS = /[^a-z0-9-]/g
const REPEATED_DASHES = /-+/g

export function normalizeTopic(rawTopic) {
  if (typeof rawTopic !== 'string') return null

  const decoded = rawTopic.normalize('NFKC').trim()
  if (!decoded) return null
  if (decoded.length > 60 || decoded.split(/[\s_-]+/).filter(Boolean).length > 6) return null

  const slug = decoded
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[\s_]+/g, '-')
    .replace(UNSAFE_SLUG_CHARACTERS, '')
    .replace(REPEATED_DASHES, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

  return slug || null
}

export function topicFromSlug(slug) {
  return slug.replaceAll('-', ' ')
}

export function isValidHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
