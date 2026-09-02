import { normalizeTopic } from './topic.mjs'

const WIKTIONARY_API = 'https://pt.wiktionary.org/w/api.php'

export async function findWiktionaryEntry(topic, fetchImpl = fetch) {
  const url = new URL(WIKTIONARY_API)
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: topic,
    gsrnamespace: '0',
    gsrlimit: '1',
    prop: 'extracts',
    explaintext: '1',
  }).toString()

  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'OQueEOQueE/1.0 (Wiktionary meaning checker)' },
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) return null
    const page = (await response.json())?.query?.pages?.[0]
    if (!page?.pageid || normalizeTopic(page.title) !== normalizeTopic(topic)) return null

    const portugueseSection = String(page.extract ?? '')
      .split(/==\s*(?:Etimologia|Liga[çc][õo]es externas)\s*==/i)[0]
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 1200)
    if (!portugueseSection || !/=\s*Português\s*=/i.test(portugueseSection)) return null

    return {
      title: String(page.title),
      extract: portugueseSection,
      reference: {
        title: `${page.title} — Wikcionário`,
        url: `https://pt.wiktionary.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`,
      },
    }
  } catch {
    return null
  }
}
