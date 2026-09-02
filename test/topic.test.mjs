import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidHttpUrl, normalizeTopic, topicFromSlug } from '../server/topic.mjs'

test('normalizeTopic cria slugs estáveis em português', () => {
  assert.equal(normalizeTopic('  Inteligência Artificial  '), 'inteligencia-artificial')
  assert.equal(normalizeTopic('O que é Política?'), 'o-que-e-politica')
  assert.equal(topicFromSlug('direitos-humanos'), 'direitos humanos')
})

test('normalizeTopic rejeita entradas vazias', () => {
  assert.equal(normalizeTopic('???'), null)
  assert.equal(normalizeTopic('   '), null)
  assert.equal(normalizeTopic(null), null)
})

test('normalizeTopic limita busca a 60 caracteres e 6 palavras', () => {
  assert.equal(normalizeTopic('um dois três quatro cinco seis'), 'um-dois-tres-quatro-cinco-seis')
  assert.equal(normalizeTopic('um dois três quatro cinco seis sete'), null)
  assert.equal(normalizeTopic('a'.repeat(61)), null)
})

test('isValidHttpUrl aceita apenas links públicos HTTP(S)', () => {
  assert.equal(isValidHttpUrl('https://example.com/verbete'), true)
  assert.equal(isValidHttpUrl('javascript:alert(1)'), false)
  assert.equal(isValidHttpUrl('/caminho-relativo'), false)
})
