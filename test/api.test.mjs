import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequestHandler } from '../server/app.mjs'
import { createEntryRepository, openDatabase } from '../server/database.mjs'
import { hashPassword } from '../server/security.mjs'

function fixtureEntry(slug) {
  return {
    title: slug,
    definition: `Uma definição simples e suficientemente longa sobre ${slug}, escrita especialmente para os testes automatizados do projeto.`,
    references: [
      { title: 'Fonte um', url: 'https://example.com/um' },
      { title: 'Fonte dois', url: 'https://example.com/dois' },
    ],
  }
}

async function withServer(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'oqeoque-test-'))
  const db = openDatabase(directory)
  const repository = createEntryRepository(db)
  let generations = 0
  const generateEntry = async (slug) => {
    generations += 1
    await new Promise((resolve) => setTimeout(resolve, 15))
    return fixtureEntry(slug)
  }
  const handler = createRequestHandler({
    repository,
    generateEntry,
    distDirectory: path.join(directory, 'dist'),
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('uma-senha-segura'),
    adminSessionSecret: 'session-secret-for-tests',
    botChallengeSecret: 'bot-secret-for-tests',
    botMinWaitMs: 0,
  })
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    await run({ baseUrl, repository, getGenerations: () => generations })
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
}

async function antiBotToken(baseUrl) {
  const response = await fetch(`${baseUrl}/api/anti-bot`)
  return (await response.json()).token
}

async function submitSuggestion(baseUrl, slug, definition, author = '') {
  return fetch(`${baseUrl}/api/entries/${slug}/suggestions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      definition,
      author,
      antiBotToken: await antiBotToken(baseUrl),
      website: '',
    }),
  })
}

async function adminCookie(baseUrl) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'uma-senha-segura' }),
  })
  assert.equal(response.status, 200)
  return response.headers.get('set-cookie').split(';')[0]
}

test('primeiro acesso gera e acessos seguintes usam cache', async () => {
  await withServer(async ({ baseUrl, getGenerations }) => {
    const first = await fetch(`${baseUrl}/api/entries/politica`)
    assert.equal(first.status, 200)
    const firstBody = await first.json()
    assert.equal(firstBody.entry.slug, 'politica')

    const second = await fetch(`${baseUrl}/api/entries/politica`)
    assert.equal(second.status, 200)
    assert.equal(getGenerations(), 1)
  })
})

test('acessos simultâneos compartilham a mesma geração', async () => {
  await withServer(async ({ baseUrl, getGenerations }) => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/entries/amor`),
      fetch(`${baseUrl}/api/entries/amor`),
      fetch(`${baseUrl}/api/entries/amor`),
    ])
    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200])
    assert.equal(getGenerations(), 1)
  })
})

test('correção explícita devolve o título canônico para o redirecionamento do cliente', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'oqeoque-correction-test-'))
  const db = openDatabase(directory)
  const repository = createEntryRepository(db)
  const handler = createRequestHandler({
    repository,
    generateEntry: async () => ({
      title: 'pernicioso',
      definition: 'Vai causando dano grave de maneira lenta e pouco visível, como algo que corrói por dentro antes que suas consequências apareçam por completo.',
      references: [],
      corrected: true,
    }),
    distDirectory: path.join(directory, 'dist'),
  })
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/entries/pernicioco`)
    const body = await response.json()
    assert.equal(body.entry.slug, 'pernicioco')
    assert.equal(body.entry.title, 'pernicioso')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('durante o desenvolvimento, prompt novo substitui gerações automáticas antigas', async () => {
  await withServer(async ({ baseUrl, repository, getGenerations }) => {
    repository.saveGenerated('marxismo', {
      title: 'marxismo',
      definition: 'Marxismo é uma teoria social e econômica suficientemente longa, mas ainda vaga para representar a versão antiga do gerador.',
      references: [{ title: 'Fonte antiga', url: 'https://example.com/antiga' }],
    }, 1)
    repository.saveGenerated('marxismo', {
      title: 'marxismo',
      definition: 'A segunda versão ainda é uma revisão criada pelo Gemini e também precisa ser atualizada quando o prompt muda novamente.',
      references: [{ title: 'Fonte antiga', url: 'https://example.com/antiga' }],
    }, 2)

    const updated = await fetch(`${baseUrl}/api/entries/marxismo`).then((response) => response.json())
    assert.notEqual(updated.entry.definition, 'Marxismo é uma teoria social e econômica suficientemente longa, mas ainda vaga para representar a versão antiga do gerador.')
    assert.equal(getGenerations(), 1)

    await fetch(`${baseUrl}/api/entries/marxismo`)
    assert.equal(getGenerations(), 1)
    const history = await fetch(`${baseUrl}/api/entries/marxismo/history`).then((response) => response.json())
    assert.equal(history.versions.length, 1)
    assert.equal(history.versions[0].kind, 'generated')
    assert.equal(history.versions[0].isCurrent, true)
  })
})

test('modo de lançamento pode preservar revisões automáticas', async () => {
  await withServer(async ({ repository }) => {
    repository.saveGenerated('historia', fixtureEntry('historia antiga'), 1)
    repository.saveGenerated('historia', fixtureEntry('historia nova'), 2, { preserveHistory: true })
    const entry = repository.findBySlug('historia')
    const history = repository.getHistory(entry.id)
    assert.equal(history.length, 2)
    assert.equal(history[0].kind, 'revision')
    assert.equal(history[1].kind, 'generated')
  })
})

test('sugestão válida entra no histórico sem substituir o verbete', async () => {
  await withServer(async ({ baseUrl }) => {
    const original = await fetch(`${baseUrl}/api/entries/democracia`).then((response) => response.json())
    const proposed = 'Uma nova explicação clara e completa sobre democracia, com linguagem acessível para qualquer pessoa que esteja começando no assunto.'

    const suggestionResponse = await submitSuggestion(baseUrl, 'democracia', proposed, 'Ana')
    assert.equal(suggestionResponse.status, 201)

    const history = await fetch(`${baseUrl}/api/entries/democracia/history`).then((response) => response.json())
    assert.equal(history.versions.length, 2)
    assert.equal(history.versions[0].status, 'pending')
    assert.equal(history.versions[0].definition, proposed)

    const current = await fetch(`${baseUrl}/api/entries/democracia`).then((response) => response.json())
    assert.equal(current.entry.definition, original.entry.definition)
  })
})

test('sugestão idêntica é rejeitada', async () => {
  await withServer(async ({ baseUrl }) => {
    const original = await fetch(`${baseUrl}/api/entries/cidadania`).then((response) => response.json())
    const response = await submitSuggestion(baseUrl, 'cidadania', original.entry.definition)
    assert.equal(response.status, 422)
  })
})

test('proteção anti-bot exige desafio válido e aceita apenas uma vez', async () => {
  await withServer(async ({ baseUrl }) => {
    await fetch(`${baseUrl}/api/entries/estado`)
    const proposed = 'Estado é uma organização política que administra um território e cria regras coletivas para a população que vive nele.'
    const missing = await fetch(`${baseUrl}/api/entries/estado/suggestions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ definition: proposed }),
    })
    assert.equal(missing.status, 422)

    const token = await antiBotToken(baseUrl)
    const body = JSON.stringify({ definition: proposed, antiBotToken: token, website: '' })
    const first = await fetch(`${baseUrl}/api/entries/estado/suggestions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    })
    const repeated = await fetch(`${baseUrl}/api/entries/estado/suggestions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    })
    assert.equal(first.status, 201)
    assert.equal(repeated.status, 422)
  })
})

test('admin autenticado aprova sugestão e publica o novo texto', async () => {
  await withServer(async ({ baseUrl }) => {
    await fetch(`${baseUrl}/api/entries/politica`)
    const proposed = 'Política é a forma como grupos decidem regras, distribuem poder e resolvem conflitos que afetam a vida em sociedade.'
    await submitSuggestion(baseUrl, 'politica', proposed, 'Bia')

    const unauthorized = await fetch(`${baseUrl}/api/admin/suggestions`)
    assert.equal(unauthorized.status, 401)

    const cookie = await adminCookie(baseUrl)
    const queue = await fetch(`${baseUrl}/api/admin/suggestions`, { headers: { cookie } }).then((response) => response.json())
    assert.equal(queue.suggestions.length, 1)
    assert.equal(queue.suggestions[0].author, 'Bia')

    const approved = await fetch(`${baseUrl}/api/admin/suggestions/${queue.suggestions[0].id}/approve`, {
      method: 'POST',
      headers: { cookie },
    })
    assert.equal(approved.status, 200)

    const current = await fetch(`${baseUrl}/api/entries/politica`).then((response) => response.json())
    assert.equal(current.entry.definition, proposed)
    const history = await fetch(`${baseUrl}/api/entries/politica/history`).then((response) => response.json())
    assert.equal(history.versions[0].isCurrent, true)
    assert.equal(history.versions[1].isCurrent, false)
  })
})

test('admin pode rejeitar sem expor a sugestão no histórico público', async () => {
  await withServer(async ({ baseUrl }) => {
    await fetch(`${baseUrl}/api/entries/amor`)
    const proposed = 'Amor é um vínculo de cuidado e afeto que pode existir em relações, comunidades e escolhas feitas ao longo da vida.'
    await submitSuggestion(baseUrl, 'amor', proposed)
    const cookie = await adminCookie(baseUrl)
    const queue = await fetch(`${baseUrl}/api/admin/suggestions`, { headers: { cookie } }).then((response) => response.json())
    const rejected = await fetch(`${baseUrl}/api/admin/suggestions/${queue.suggestions[0].id}/reject`, {
      method: 'POST', headers: { cookie },
    })
    assert.equal(rejected.status, 200)
    const history = await fetch(`${baseUrl}/api/entries/amor/history`).then((response) => response.json())
    assert.equal(history.versions.length, 1)
  })
})
