import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { normalizeTopic } from './topic.mjs'
import {
  clientIp,
  createBotProtection,
  createRateLimiter,
  createSessionManager,
  isSameOrigin,
  parseCookies,
  verifyPassword,
} from './security.mjs'

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
])

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 16_384) throw new Error('PAYLOAD_TOO_LARGE')
  }
  try {
    return JSON.parse(body || '{}')
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

export function createRequestHandler({
  repository,
  generateEntry,
  distDirectory,
  adminUsername = 'admin',
  adminPasswordHash = '',
  adminSessionSecret = 'local-development-session-secret',
  botChallengeSecret = 'local-development-bot-secret',
  botMinWaitMs = 2500,
  isProduction = false,
  generationVersion = 5,
  preserveGeneratedHistory = false,
}) {
  const generationInFlight = new Map()
  const sessions = createSessionManager({ secret: adminSessionSecret })
  const botProtection = createBotProtection({ secret: botChallengeSecret, minWaitMs: botMinWaitMs })
  const suggestionLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 })
  const loginLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 })

  function adminSession(request) {
    const token = parseCookies(request.headers.cookie).get('oq_admin')
    return sessions.verify(token)
  }

  function requireAdmin(request, response) {
    const session = adminSession(request)
    if (!session) sendJson(response, 401, { error: 'Faça login para continuar.' })
    return session
  }

  function sessionCookie(token, maxAge = 12 * 60 * 60) {
    const secure = isProduction ? '; Secure' : ''
    return `oq_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
  }

  async function findOrGenerate(slug) {
    const cached = repository.findBySlug(slug)
    if (cached && !repository.needsRegeneration(slug, generationVersion)) return cached

    let pending = generationInFlight.get(slug)
    if (!pending) {
      pending = generateEntry(slug)
        .then((generated) => repository.saveGenerated(
          slug,
          generated,
          generationVersion,
          { preserveHistory: preserveGeneratedHistory },
        ))
        .finally(() => generationInFlight.delete(slug))
      generationInFlight.set(slug, pending)
    }
    return pending
  }

  return async function handleRequest(request, response) {
    const url = new URL(request.url, 'http://localhost')
    const entryMatch = url.pathname.match(/^\/api\/entries\/([^/]+)$/)
    const historyMatch = url.pathname.match(/^\/api\/entries\/([^/]+)\/history$/)
    const suggestionMatch = url.pathname.match(/^\/api\/entries\/([^/]+)\/suggestions$/)
    const reviewMatch = url.pathname.match(/^\/api\/admin\/suggestions\/(\d+)\/(approve|reject)$/)

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(response, 200, { ok: true })
      }

      if (request.method === 'GET' && url.pathname === '/api/anti-bot') {
        return sendJson(response, 200, {
          token: botProtection.issue(),
          minWaitMs: botProtection.minWaitMs,
        })
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/session') {
        const session = adminSession(request)
        return sendJson(response, 200, {
          authenticated: Boolean(session),
          username: session?.username ?? null,
        })
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/login') {
        if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem inválida.' })
        const ip = clientIp(request)
        if (!loginLimiter.consume(ip)) {
          return sendJson(response, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' })
        }
        const body = await readJson(request)
        const username = typeof body.username === 'string' ? body.username.trim() : ''
        const password = typeof body.password === 'string' ? body.password : ''
        if (username !== adminUsername || !verifyPassword(password, adminPasswordHash)) {
          return sendJson(response, 401, { error: 'Usuário ou senha inválidos.' })
        }
        const token = sessions.create(adminUsername)
        return sendJson(response, 200, { username: adminUsername }, {
          'set-cookie': sessionCookie(token),
        })
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
        if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem inválida.' })
        return sendJson(response, 200, { ok: true }, {
          'set-cookie': sessionCookie('', 0),
        })
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/suggestions') {
        if (!requireAdmin(request, response)) return
        return sendJson(response, 200, { suggestions: repository.listPendingSuggestions() })
      }

      if (request.method === 'POST' && reviewMatch) {
        if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem inválida.' })
        const session = requireAdmin(request, response)
        if (!session) return
        const reviewed = repository.reviewSuggestion(
          Number(reviewMatch[1]),
          reviewMatch[2],
          session.username,
        )
        if (!reviewed) return sendJson(response, 404, { error: 'Sugestão não encontrada ou já revisada.' })
        return sendJson(response, 200, { suggestion: reviewed })
      }

      if (request.method === 'GET' && entryMatch) {
        const slug = normalizeTopic(safeDecode(entryMatch[1]))
        if (!slug) return sendJson(response, 400, { error: 'Tema inválido.' })
        const entry = await findOrGenerate(slug)
        return sendJson(response, 200, { entry })
      }

      if (request.method === 'GET' && historyMatch) {
        const slug = normalizeTopic(safeDecode(historyMatch[1]))
        const entry = slug ? repository.findBySlug(slug) : null
        if (!entry) return sendJson(response, 404, { error: 'Verbete ainda não existe.' })
        return sendJson(response, 200, { versions: repository.getHistory(entry.id) })
      }

      if (request.method === 'POST' && suggestionMatch) {
        if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem inválida.' })
        const slug = normalizeTopic(safeDecode(suggestionMatch[1]))
        const entry = slug ? repository.findBySlug(slug) : null
        if (!entry) return sendJson(response, 404, { error: 'Verbete ainda não existe.' })

        const body = await readJson(request)
        const website = typeof body.website === 'string' ? body.website.trim() : ''
        if (website) {
          return sendJson(response, 201, {
            suggestion: { id: 0, status: 'pending', createdAt: new Date().toISOString() },
          })
        }
        const botCheck = botProtection.verifyAndConsume(body.antiBotToken)
        if (!botCheck.ok) {
          return sendJson(response, 422, {
            error: botCheck.reason === 'too_fast'
              ? 'Espere alguns segundos antes de enviar.'
              : 'A proteção anti-bot expirou. Reabra o formulário e tente novamente.',
          })
        }
        if (!suggestionLimiter.consume(clientIp(request))) {
          return sendJson(response, 429, { error: 'Limite de sugestões atingido. Tente novamente mais tarde.' })
        }
        const definition = typeof body.definition === 'string'
          ? body.definition.replace(/\s+/g, ' ').trim()
          : ''
        const author = typeof body.author === 'string' ? body.author.trim().slice(0, 80) : ''

        if (definition.length < 40 || definition.length > 600) {
          return sendJson(response, 422, { error: 'A sugestão deve ter entre 40 e 600 caracteres.' })
        }
        if (definition === entry.definition) {
          return sendJson(response, 422, { error: 'Mude o texto antes de enviar a sugestão.' })
        }

        const suggestion = repository.addSuggestion(entry.id, definition, author)
        return sendJson(response, 201, { suggestion })
      }

      if (url.pathname.startsWith('/api/')) {
        return sendJson(response, 404, { error: 'Rota não encontrada.' })
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405)
        return response.end()
      }

      const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname
      const candidate = path.resolve(distDirectory, `.${requestedPath}`)
      const isInsideDist = candidate.startsWith(`${path.resolve(distDirectory)}${path.sep}`)
      const filePath = isInsideDist && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : path.join(distDirectory, 'index.html')

      if (!existsSync(filePath)) {
        response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
        return response.end('Interface ainda não compilada. Rode npm run dev ou npm run build.')
      }

      const extension = path.extname(filePath)
      response.writeHead(200, {
        'content-type': CONTENT_TYPES.get(extension) ?? 'application/octet-stream',
        'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      })
      if (request.method === 'HEAD') return response.end()
      createReadStream(filePath).pipe(response)
    } catch (error) {
      console.error(error)
      if (error.message === 'PAYLOAD_TOO_LARGE') {
        return sendJson(response, 413, { error: 'Conteúdo grande demais.' })
      }
      if (error.message === 'INVALID_JSON') {
        return sendJson(response, 400, { error: 'JSON inválido.' })
      }
      if (error.code === 'GEMINI_NOT_CONFIGURED') {
        return sendJson(response, 503, { error: 'A geração de novos temas está temporariamente indisponível.' })
      }
      return sendJson(response, 500, { error: 'Não foi possível carregar este verbete agora.' })
    }
  }
}
