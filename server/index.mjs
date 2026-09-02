import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createRequestHandler } from './app.mjs'
import { createEntryRepository, openDatabase } from './database.mjs'
import { createDemoGenerator, createGeminiGenerator } from './gemini.mjs'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const rootDirectory = path.resolve(serverDirectory, '..')
const dataDirectory = path.resolve(rootDirectory, process.env.DATA_DIR ?? 'data')
const distDirectory = path.resolve(rootDirectory, 'dist')
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
const isProduction = process.env.NODE_ENV === 'production'

const db = openDatabase(dataDirectory)
const repository = createEntryRepository(db)
const apiKey = process.env.GEMINI_API_KEY
  ?? process.env.GOOGLE_API_KEY
  ?? process.env.HERMES_GEMINI_API_KEY
const generateEntry = process.env.OQEOQE_DEMO === '1'
  ? createDemoGenerator()
  : createGeminiGenerator({ apiKey, model: process.env.GEMINI_MODEL })
const handler = createRequestHandler({
  repository,
  generateEntry,
  distDirectory,
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET ?? 'local-development-session-secret',
  botChallengeSecret: process.env.BOT_CHALLENGE_SECRET ?? 'local-development-bot-secret',
  isProduction,
  preserveGeneratedHistory: process.env.PRESERVE_GENERATED_HISTORY === '1',
})

const server = createServer(handler)
server.listen(port, host, () => {
  console.log(`O que é o que é em http://${host}:${port}`)
})

function close() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', close)
process.on('SIGTERM', close)
