#!/usr/bin/env node
/**
 * Mermaid Local 笔记库 REST API（零依赖，Node >= 18）
 *
 * 读取 Web 应用「本地 Agent 同步」写入的目录快照，供本地 Coding Agent
 * 通过 HTTP 读取笔记元数据与 mermaid 产物（标准化源码 / SVG / PNG）。
 *
 * 用法：
 *   node scripts/agent-api.mjs [--port 4789] [--dir ~/mermaid-agent-sync]
 *
 * 环境变量：MERMAID_SYNC_DIR / MERMAID_API_PORT 可替代同名参数。
 *
 * 鉴权：
 *   - GET /api/auth/token  仅限本机（127.0.0.1）调用，签发/读取 Token，1 个月过期；
 *   - 其余接口需携带 Authorization: Bearer <token>，过期返回 401。
 *
 * 接口：
 *   GET /api/manifest                     同步元信息
 *   GET /api/diagrams                     图表清单（?days=7 | ?from&to | ?project= 名称过滤）
 *   GET /api/diagrams/:id                 单个图表元数据
 *   GET /api/diagrams/:id/assets/:kind    产物文件（source|standard|svg|png|portable）
 *   POST /api/diagrams                    写回笔记（写入 inbox/，Web 应用下次同步时导入）
 *     body: { name, type: mermaid|markdown|txt, source, projectName? }
 *   ANY /api/ai-proxy/*                   AI 端点 CORS 代理（仅限本机）：转发到
 *     X-Target-Base 头指定的端点，供浏览器调用不支持 CORS 的端点（如 Token 套餐）
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 1 个月

// ─── 参数解析 ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { port: null, dir: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = Number(argv[++i])
    else if (argv[i] === '--dir') args.dir = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('usage: node scripts/agent-api.mjs [--port 4789] [--dir <sync-dir>]')
      process.exit(0)
    }
  }
  return args
}

const cli = parseArgs(process.argv)
const PORT = cli.port || Number(process.env.MERMAID_API_PORT) || 4789
const DIR = path.resolve(
  cli.dir || process.env.MERMAID_SYNC_DIR || path.join(os.homedir(), 'mermaid-agent-sync')
)

// ─── 工具 ────────────────────────────────────────────────────────────────────

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload, null, 2)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function isLocal(req) {
  const addr = req.socket.remoteAddress || ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

// ─── Token 管理 ──────────────────────────────────────────────────────────────

function authFile() {
  return path.join(DIR, 'auth.json')
}

function loadAuth() {
  const data = readJson(authFile())
  if (!data || typeof data.token !== 'string') return null
  return data
}

/** 读取有效 token；无或过期时 issue=true 则重新签发（仅本机接口调用） */
function getOrIssueToken(issue) {
  const existing = loadAuth()
  if (existing && Date.now() <= existing.expiresAt) return existing
  if (!issue) return null
  const fresh = {
    token: crypto.randomBytes(24).toString('base64url'),
    issuedAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  }
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(authFile(), JSON.stringify(fresh, null, 2))
  return fresh
}

function checkBearer(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return { ok: false, code: 401, error: '缺少 Authorization: Bearer <token>' }
  const auth = loadAuth()
  if (!auth) return { ok: false, code: 401, error: '服务端尚未签发 token，请先调用 GET /api/auth/token' }
  if (Date.now() > auth.expiresAt) {
    return { ok: false, code: 401, error: 'token 已过期，请重新调用 GET /api/auth/token' }
  }
  if (match[1] !== auth.token) return { ok: false, code: 401, error: 'token 无效' }
  return { ok: true }
}

// ─── 数据读取 ────────────────────────────────────────────────────────────────

function loadIndex() {
  const index = readJson(path.join(DIR, 'index.json'))
  return Array.isArray(index) ? index : null
}

function parseDay(value, endOfDay = false) {
  const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

const ASSET_CONTENT_TYPES = {
  source: 'text/plain; charset=utf-8',
  standard: 'text/plain; charset=utf-8',
  portable: 'text/markdown; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
}

// ─── 路由 ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const segments = url.pathname.split('/').filter(Boolean) // ['api', ...]

  if (segments[0] !== 'api') {
    return sendJson(res, 404, { error: 'not found' })
  }

  // 鉴权 token 接口：仅限本机
  if (url.pathname === '/api/auth/token' && req.method === 'GET') {
    if (!isLocal(req)) return sendJson(res, 403, { error: 'token 接口仅限本机调用' })
    const auth = getOrIssueToken(true)
    return sendJson(res, 200, auth)
  }

  // AI 端点 CORS 代理：部分端点（如 Token 套餐）不返回 CORS 头，
  // 浏览器无法直连；由本服务转发，仅限本机调用
  if (url.pathname.startsWith('/api/ai-proxy/')) {
    if (!isLocal(req)) return sendJson(res, 403, { error: 'AI 代理仅限本机调用' })

    const corsHeaders = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Headers': 'content-type, authorization, x-target-base',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      return res.end()
    }

    const targetBase = req.headers['x-target-base']
    if (typeof targetBase !== 'string' || !/^https:\/\//.test(targetBase)) {
      return sendJson(res, 400, { error: '缺少合法的 X-Target-Base 头（https://…）' })
    }
    const subPath = url.pathname.slice('/api/ai-proxy'.length) // 以 / 开头
    const targetUrl = targetBase.replace(/\/+$/, '') + subPath + url.search

    let bodyChunks = []
    let bodySize = 0
    req.on('data', (c) => {
      bodyChunks.push(c)
      bodySize += c.length
      if (bodySize > 20 * 1024 * 1024) req.destroy()
    })
    req.on('end', async () => {
      try {
        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers: {
            'Content-Type': req.headers['content-type'] || 'application/json',
            ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
          },
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(bodyChunks),
        })
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
        res.writeHead(upstream.status, { ...corsHeaders, 'Content-Type': contentType })
        if (upstream.body) {
          // 流式透传（SSE 场景）
          for await (const chunk of upstream.body) res.write(chunk)
        }
        res.end()
      } catch (err) {
        if (!res.headersSent) {
          sendJson(res, 502, { error: `转发失败：${err && err.message}` })
        } else {
          res.end()
        }
      }
    })
    return undefined
  }

  // 写回：POST /api/diagrams → inbox/<uuid>.json
  if (url.pathname === '/api/diagrams' && req.method === 'POST') {
    const authResult = checkBearer(req)
    if (!authResult.ok) return sendJson(res, authResult.code, { error: authResult.error })
    if (!fs.existsSync(DIR)) {
      return sendJson(res, 503, { error: `同步目录不存在：${DIR}（请先在 Web 应用中选择同步目录）` })
    }
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 5 * 1024 * 1024) req.destroy()
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        if (
          !payload.name ||
          typeof payload.source !== 'string' ||
          !['mermaid', 'markdown', 'txt'].includes(payload.type)
        ) {
          return sendJson(res, 400, { error: '需要 name / type(mermaid|markdown|txt) / source 字段' })
        }
        const inbox = path.join(DIR, 'inbox')
        fs.mkdirSync(inbox, { recursive: true })
        fs.writeFileSync(path.join(inbox, `${crypto.randomUUID()}.json`), JSON.stringify(payload))
        return sendJson(res, 202, { ok: true, note: '已写入 inbox，Web 应用下次同步时导入' })
      } catch {
        return sendJson(res, 400, { error: 'body 不是合法 JSON' })
      }
    })
    return undefined
  }

  if (req.method !== 'GET') {
    return sendJson(res, 404, { error: 'not found' })
  }

  const authResult = checkBearer(req)
  if (!authResult.ok) return sendJson(res, authResult.code, { error: authResult.error })

  if (!fs.existsSync(DIR)) {
    return sendJson(res, 503, { error: `同步目录不存在：${DIR}（请先在 Web 应用中选择同步目录）` })
  }

  if (url.pathname === '/api/manifest') {
    const manifest = readJson(path.join(DIR, 'manifest.json'))
    return manifest ? sendJson(res, 200, manifest) : sendJson(res, 404, { error: 'manifest.json 不存在' })
  }

  if (url.pathname === '/api/diagrams') {
    const index = loadIndex()
    if (!index) return sendJson(res, 404, { error: 'index.json 不存在（尚未同步）' })

    let list = [...index]
    const days = url.searchParams.get('days')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const project = url.searchParams.get('project')

    let start = null
    let end = null
    if (days) {
      end = Date.now()
      start = end - Number(days) * 24 * 60 * 60 * 1000
    } else if (from || to) {
      start = from ? parseDay(from) : null
      end = to ? parseDay(to, true) : null
    }
    if (start !== null || end !== null) {
      list = list.filter((d) => {
        const hit = (ts) => (start === null || ts >= start) && (end === null || ts <= end)
        return hit(d.createdAt) || hit(d.updatedAt)
      })
    }
    if (project) {
      list = list.filter((d) => (d.projectName || '').includes(project))
    }
    list.sort((a, b) => b.updatedAt - a.updatedAt)
    return sendJson(res, 200, { count: list.length, diagrams: list })
  }

  const diagramMatch = url.pathname.match(/^\/api\/diagrams\/([^/]+)(?:\/assets\/([^/]+))?$/)
  if (diagramMatch) {
    const [, id, kind] = diagramMatch
    const index = loadIndex()
    if (!index) return sendJson(res, 404, { error: 'index.json 不存在（尚未同步）' })
    const entry = index.find((d) => d.id === id) || index.find((d) => d.name === decodeURIComponent(id))
    if (!entry) return sendJson(res, 404, { error: `未找到图表：${id}` })

    if (!kind) return sendJson(res, 200, entry)

    const rel = entry.files?.[kind]
    if (!rel) return sendJson(res, 404, { error: `该图表没有 ${kind} 产物` })
    const file = path.join(DIR, rel)
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: '产物文件不存在' })

    const type = ASSET_CONTENT_TYPES[kind] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    fs.createReadStream(file).pipe(res)
    return undefined
  }

  return sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[agent-api] listening on http://127.0.0.1:${PORT}`)
  console.log(`[agent-api] sync dir: ${DIR}`)
  console.log('[agent-api] 获取 token: curl http://127.0.0.1:' + PORT + '/api/auth/token')
})
