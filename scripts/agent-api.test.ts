import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

let child: ChildProcess
let dir: string
let base: string
let token: string

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-api-test-'))
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, [path.resolve(__dirname, 'agent-api.mjs')], {
    env: { ...process.env, MERMAID_API_PORT: String(port), MERMAID_SYNC_DIR: dir },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('agent-api did not start')), 5000)
    child.stdout!.on('data', (d: Buffer) => {
      if (d.toString().includes('listening')) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
  token = JSON.parse(fs.readFileSync(path.join(dir, 'auth.json'), 'utf8')).token
})

afterAll(() => {
  child?.kill()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('agent-api SSE push', () => {
  it('issues a token at startup so the web app can read it from auth.json', () => {
    expect(token).toMatch(/^[\w-]{20,}$/)
  })

  it('rejects an events subscription without a valid token', async () => {
    expect((await fetch(`${base}/api/events`)).status).toBe(401)
    expect((await fetch(`${base}/api/events?token=wrong`)).status).toBe(401)
  })

  it('only allows localhost origins via CORS', async () => {
    const ctrl = new AbortController()
    const ok = await fetch(`${base}/api/events?token=${token}`, {
      headers: { Origin: 'http://localhost:5173' },
      signal: ctrl.signal,
    })
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    ctrl.abort()

    const ctrl2 = new AbortController()
    const evil = await fetch(`${base}/api/events?token=${token}`, {
      headers: { Origin: 'https://evil.example' },
      signal: ctrl2.signal,
    })
    expect(evil.headers.get('access-control-allow-origin')).toBeNull()
    ctrl2.abort()
  })

  it('pushes an inbox event to subscribers when a diagram is posted, and still persists it', async () => {
    const ctrl = new AbortController()
    const res = await fetch(`${base}/api/events?token=${token}`, { signal: ctrl.signal })
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    const received = (async () => {
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) throw new Error('stream ended before an inbox event')
        buf += decoder.decode(value)
        if (buf.includes('event: inbox')) return buf
      }
    })()

    const post = await fetch(`${base}/api/diagrams`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 't', type: 'mermaid', source: 'flowchart LR\nA-->B', projectName: 'p' }),
    })
    expect(post.status).toBe(202)
    expect((await post.json()).notified).toBe(1)

    const frame = await received
    expect(frame).toContain('event: inbox')
    expect(fs.readdirSync(path.join(dir, 'inbox')).filter((f) => f.endsWith('.json'))).toHaveLength(1)
    ctrl.abort()
  })
})
