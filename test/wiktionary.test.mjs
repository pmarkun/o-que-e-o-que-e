import assert from 'node:assert/strict'
import test from 'node:test'
import { findWiktionaryEntry } from '../server/wiktionary.mjs'

test('Wikcionário ancora palavra válida mesmo quando a busca perdeu o acento', async () => {
  const entry = await findWiktionaryEntry('pernostico', async () => ({
    ok: true,
    json: async () => ({ query: { pages: [{
      pageid: 1,
      title: 'pernóstico',
      extract: '= Português =\n\n== Adjetivo ==\n\npetulante, pretensioso, presumido, pedante\n\n== Etimologia ==\nCorruptela de prognóstico.',
    }] } }),
  }))

  assert.equal(entry.title, 'pernóstico')
  assert.match(entry.extract, /pretensioso/)
  assert.doesNotMatch(entry.extract, /Etimologia/)
  assert.match(entry.reference.url, /Wikcion%C3%A1rio|pern%C3%B3stico/)
})

test('Wikcionário não trata resultado apenas parecido como a palavra pesquisada', async () => {
  const entry = await findWiktionaryEntry('pernicioco', async () => ({
    ok: true,
    json: async () => ({ query: { pages: [{ pageid: 2, title: 'pernóstico', extract: '= Português =' }] } }),
  }))
  assert.equal(entry, null)
})
