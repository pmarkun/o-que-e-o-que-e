import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

function encode(value) {
  return Buffer.from(value).toString('base64url')
}

function decode(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function parseCookies(header = '') {
  const cookies = new Map()
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return cookies
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false
  const [algorithm, salt, expected] = storedHash.split('$')
  if (algorithm !== 'scrypt' || !salt || !expected) return false
  const actual = scryptSync(password, salt, 64).toString('hex')
  return safeEqual(actual, expected)
}

export function createSessionManager({ secret, ttlMs = 12 * 60 * 60 * 1000 }) {
  return {
    create(username) {
      const payload = encode(JSON.stringify({
        username,
        expiresAt: Date.now() + ttlMs,
      }))
      return `${payload}.${sign(payload, secret)}`
    },

    verify(token) {
      if (typeof token !== 'string') return null
      const [payload, signature] = token.split('.')
      if (!payload || !signature || !safeEqual(sign(payload, secret), signature)) return null
      try {
        const session = JSON.parse(decode(payload))
        if (!session.username || session.expiresAt < Date.now()) return null
        return session
      } catch {
        return null
      }
    },
  }
}

export function createBotProtection({
  secret,
  minWaitMs = 2500,
  ttlMs = 30 * 60 * 1000,
}) {
  const consumed = new Map()

  function prune(now) {
    for (const [nonce, expiresAt] of consumed) {
      if (expiresAt < now) consumed.delete(nonce)
    }
  }

  return {
    minWaitMs,

    issue() {
      const now = Date.now()
      const payload = encode(JSON.stringify({
        issuedAt: now,
        expiresAt: now + ttlMs,
        nonce: randomBytes(18).toString('base64url'),
      }))
      return `${payload}.${sign(payload, secret)}`
    },

    verifyAndConsume(token) {
      const now = Date.now()
      prune(now)
      if (typeof token !== 'string') return { ok: false, reason: 'missing' }
      const [payload, signature] = token.split('.')
      if (!payload || !signature || !safeEqual(sign(payload, secret), signature)) {
        return { ok: false, reason: 'invalid' }
      }
      try {
        const challenge = JSON.parse(decode(payload))
        if (!challenge.nonce || challenge.expiresAt < now) return { ok: false, reason: 'expired' }
        if (now - challenge.issuedAt < minWaitMs) return { ok: false, reason: 'too_fast' }
        if (consumed.has(challenge.nonce)) return { ok: false, reason: 'used' }
        consumed.set(challenge.nonce, challenge.expiresAt)
        return { ok: true }
      } catch {
        return { ok: false, reason: 'invalid' }
      }
    },
  }
}

export function createRateLimiter({ limit, windowMs }) {
  const buckets = new Map()
  return {
    consume(key) {
      const now = Date.now()
      const active = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs)
      if (active.length >= limit) {
        buckets.set(key, active)
        return false
      }
      active.push(now)
      buckets.set(key, active)
      return true
    },
  }
}

export function clientIp(request) {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim()
  const realIp = request.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp) return realIp
  return request.socket.remoteAddress ?? 'unknown'
}

export function isSameOrigin(request) {
  const origin = request.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}
