import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBotProtection,
  createRateLimiter,
  createSessionManager,
  hashPassword,
  verifyPassword,
} from '../server/security.mjs'

test('senha usa scrypt e comparação segura', () => {
  const hash = hashPassword('senha-segura-de-teste', 'sal-fixo')
  assert.equal(verifyPassword('senha-segura-de-teste', hash), true)
  assert.equal(verifyPassword('senha-errada', hash), false)
})

test('sessão assinada rejeita adulteração', () => {
  const sessions = createSessionManager({ secret: 'segredo-de-teste' })
  const token = sessions.create('admin')
  assert.equal(sessions.verify(token).username, 'admin')
  assert.equal(sessions.verify(`${token}x`), null)
})

test('desafio anti-bot é descartável', () => {
  const protection = createBotProtection({ secret: 'segredo-de-teste', minWaitMs: 0 })
  const token = protection.issue()
  assert.deepEqual(protection.verifyAndConsume(token), { ok: true })
  assert.deepEqual(protection.verifyAndConsume(token), { ok: false, reason: 'used' })
})

test('limitador bloqueia excedente na janela', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 })
  assert.equal(limiter.consume('ip'), true)
  assert.equal(limiter.consume('ip'), true)
  assert.equal(limiter.consume('ip'), false)
})
