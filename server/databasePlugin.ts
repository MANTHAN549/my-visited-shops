import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { z } from 'zod'

const MAX_BYTES = 50 * 1024 * 1024
const databasePath = resolve(process.cwd(), 'database', 'data.json')
let writes: Promise<void> = Promise.resolve()
const documentSchema = z.object({
  version: z.literal(2),
  updatedAt: z.string().datetime({ offset: true }),
  encryption: z.object({
    kdf: z.literal('PBKDF2-SHA256'),
    iterations: z.number().int().min(600_000),
    salt: z.string().min(1),
    iv: z.string().min(1),
    ciphertext: z.string().min(1),
  }).strict(),
}).strict()

type StoredFile = { document: unknown | null; revision: string | null }

function revisionOf(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function readStoredFile(): Promise<StoredFile> {
  try {
    const contents = await readFile(databasePath, 'utf8')
    return { document: JSON.parse(contents) as unknown, revision: revisionOf(contents) }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { document: null, revision: null }
    throw error
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

function readRequest(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BYTES + 1024 * 1024) {
        reject(new Error('Request is too large.'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function middleware(request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void): void {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname !== '/api/database') { next(); return }

  if (request.method === 'GET') {
    void readStoredFile().then((stored) => sendJson(response, 200, stored)).catch(() => sendJson(response, 500, { error: 'Could not read database/data.json.' }))
    return
  }

  if (request.method !== 'PUT') {
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  void readRequest(request).then((body) => {
    let parsed: unknown
    try { parsed = JSON.parse(body) } catch { sendJson(response, 400, { error: 'Request body must be valid JSON.' }); return }
    if (!parsed || typeof parsed !== 'object' || !('document' in parsed) || !('expectedRevision' in parsed)) {
      sendJson(response, 400, { error: 'Request is missing its document or revision.' })
      return
    }
    const valid = documentSchema.safeParse(parsed.document)
    if (!valid.success) { sendJson(response, 400, { error: 'The encrypted database document is invalid.' }); return }
    const serialized = JSON.stringify(valid.data)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) { sendJson(response, 413, { error: 'database/data.json must be 50 MB or smaller.' }); return }

    const operation = writes.then(async () => {
      const current = await readStoredFile()
      if (parsed.expectedRevision !== current.revision) {
        sendJson(response, 409, { error: 'Database changed since it was read.' })
        return
      }
      await mkdir(dirname(databasePath), { recursive: true })
      const temporaryPath = `${databasePath}.${process.pid}.tmp`
      await writeFile(temporaryPath, serialized, 'utf8')
      await rename(temporaryPath, databasePath)
      sendJson(response, 200, { revision: revisionOf(serialized) })
    })
    writes = operation.then(() => undefined, () => undefined)
    void operation.catch(() => sendJson(response, 500, { error: 'Could not save database/data.json.' }))
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'Request is too large.') sendJson(response, 413, { error: error.message })
    else sendJson(response, 400, { error: 'Could not read the database request.' })
  })
}

export function databasePlugin(): Plugin {
  return {
    name: 'local-json-database',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}
