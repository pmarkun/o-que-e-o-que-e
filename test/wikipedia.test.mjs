import assert from 'node:assert/strict'
import test from 'node:test'
import { findWikipediaReference } from '../server/wikipedia.mjs'

test('Wikipédia existente vira uma referência canônica', async () => {
  const fakeFetch = async (url) => {
    assert.match(String(url), /titles=pol%C3%ADtica/i)
    assert.match(String(url), /redirects=1/)
    return {
      ok: true,
      async json() {
        return { query: { pages: [{ pageid: 123, ns: 0, title: 'Política' }] } }
      },
    }
  }

  assert.deepEqual(await findWikipediaReference('política', fakeFetch), [{
    title: 'Política — Wikipédia',
    url: 'https://pt.wikipedia.org/wiki/Pol%C3%ADtica',
  }])
})

test('página inexistente ou falha de rede não inventa fonte', async () => {
  const missing = async () => ({
    ok: true,
    async json() {
      return { query: { pages: [{ ns: 0, title: 'Coisa inventada', missing: true }] } }
    },
  })
  const failing = async () => { throw new Error('offline') }

  assert.deepEqual(await findWikipediaReference('coisa inventada', missing), [])
  assert.deepEqual(await findWikipediaReference('coisa inventada', failing), [])
})
