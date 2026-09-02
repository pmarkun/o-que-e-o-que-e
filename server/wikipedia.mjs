const WIKIPEDIA_API = 'https://pt.wikipedia.org/w/api.php'

export async function findWikipediaReference(topic, fetchImpl = fetch) {
  const url = new URL(WIKIPEDIA_API)
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    titles: topic,
  }).toString()

  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'OQueEOQueE/1.0 (Wikipedia reference checker)' },
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) return []
    const body = await response.json()
    const page = body?.query?.pages?.[0]
    if (!page || page.missing || page.invalid || page.ns !== 0 || !page.pageid) return []

    const articleUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
    return [{ title: `${page.title} — Wikipédia`, url: articleUrl }]
  } catch {
    return []
  }
}
