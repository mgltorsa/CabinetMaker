// Minimal static file server for the `out/` export (next start does not work
// with `output: 'export'`). Used only by Playwright's webServer.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const root = resolve(process.env.E2E_STATIC_DIR ?? 'out')
const port = Number(process.env.E2E_PORT ?? 4319)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

/** Resolve a URL path inside `root`, refusing traversal. */
async function resolveFile(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/')
  } catch {
    return null // malformed percent-encoding
  }
  const candidate = normalize(join(root, decoded))
  if (candidate !== root && !candidate.startsWith(root + sep)) return null
  for (const path of [candidate, join(candidate, 'index.html'), `${candidate}.html`]) {
    try {
      if ((await stat(path)).isFile()) return path
    } catch {
      // try the next candidate
    }
  }
  return null
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? '/')
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not found')
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Serving ${root} at http://127.0.0.1:${port}\n`)
})
