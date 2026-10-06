#!/usr/bin/env node
// The Tower cockpit: a local web dashboard over every Claude Code session on this machine.
//   node server.mjs [--port 4747] [--open]
// Listens on 127.0.0.1 only. The URL it prints carries a one-time token; the browser
// trades it for a cookie, and every data request needs that cookie.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as actions from './lib/actions.mjs'
import { TOWER, agents, commandsOf, gitOf, knownRepos, prsOf, run, statusOf, worktreesOf } from './lib/collect.mjs'
import { laneOf, reposOf, toAgent, totalsOf } from './lib/model.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const PORT = Number(argv[argv.indexOf('--port') + 1]) || Number(process.env.TOWER_COCKPIT_PORT) || 4747
const TOKEN = randomBytes(24).toString('hex')
const REFRESH_MS = 2000
const HISTORY_MS = 2 * 60 * 60 * 1000

const STATIC = {
  '/': ['web/index.html', 'text/html; charset=utf-8'],
  '/dc-lite.js': ['web/dc-lite.js', 'text/javascript; charset=utf-8'],
  '/cockpit.dc.html': ['web/cockpit.dc.html', 'text/html; charset=utf-8'],
  '/favicon.svg': ['web/favicon.svg', 'image/svg+xml'],
}

const ACTIONS = {
  send: actions.send, answer: actions.answer, launch: actions.launch, stop: actions.stop, jump: actions.jump,
  merge: actions.merge, 'remove-worktree': actions.removeWorktree, 'open-editor': actions.openEditor, 'add-repo': actions.addRepo,
}

// ---- the fleet, refreshed every two seconds --------------------------------------------

const history = new Map()
let snapshot = { agents: [], repos: [], totals: totalsOf([]), error: null, at: 0 }
let snapshotJson = JSON.stringify(snapshot)
const listeners = new Set()

function remember(id, state, now) {
  const samples = history.get(id) ?? []
  if (!samples.length || samples[samples.length - 1][1] !== state) samples.push([now, state])
  while (samples.length > 1 && samples[1][0] < now - HISTORY_MS) samples.shift()
  history.set(id, samples)
}

async function refresh() {
  const now = Date.now()
  try {
    const rows = await agents()
    const list = await Promise.all(rows.map(async row => {
      const [status, git] = await Promise.all([statusOf(row.sessionId), gitOf(row.cwd)])
      const prs = git ? (await prsOf(git.repoRoot)) ?? {} : {}
      return { row, status, git, pr: git ? prs[git.branch] ?? null : null }
    }))
    const built = list.map(({ row, status, git, pr }) => {
      const agent = toAgent({ row, status, git, pr, lane: [], now })
      remember(agent.id, agent.health ? 'stuck' : agent.state, now)
      agent.lane = laneOf(history.get(agent.id), now)
      return agent
    })
    const known = await knownRepos()
    const roots = new Set([...known.map(r => r.root), ...built.map(a => a.repoRoot)])
    const withTrees = await Promise.all([...roots].map(async root => {
      const prs = (await prsOf(root)) ?? {}
      const worktrees = ((await worktreesOf(root)) ?? []).map(w => ({ ...w, pr: prs[w.branch] ?? null }))
      return { root, name: known.find(k => k.root === root)?.name, worktrees }
    }))
    snapshot = { agents: built, repos: reposOf(built, withTrees), totals: totalsOf(built), error: null, at: now }
  } catch (err) {
    snapshot = { ...snapshot, error: String(err.message ?? err), at: now }
  }
  const json = JSON.stringify(snapshot)
  if (json !== snapshotJson) {
    snapshotJson = json
    for (const res of listeners) res.write(`data: ${json}\n\n`)
  }
}

let busy = false
setInterval(async () => {
  if (busy) return
  busy = true
  try { await refresh() } finally { busy = false }
}, REFRESH_MS)
setInterval(() => { for (const res of listeners) res.write(': still here\n\n') }, 15000)

// ---- http --------------------------------------------------------------------------------

function cookieToken(req) {
  return /(?:^|;\s*)tower_token=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1] ?? ''
}

function sameToken(given) {
  const a = Buffer.from(given), b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra })
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

async function body(req) {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 1e6) throw new Error('too large')
  }
  return text ? JSON.parse(text) : {}
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  // Only this machine, by name: refuses a page elsewhere pointing a DNS name at 127.0.0.1.
  if (!new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]).has(req.headers.host)) return send(res, 421, { error: 'wrong host' })

  // The token in the link becomes a same-site cookie, then leaves the address bar.
  if (url.pathname === '/' && url.searchParams.has('t')) {
    if (!sameToken(url.searchParams.get('t'))) return send(res, 403, 'This link is out of date. Run /cockpit again.', 'text/plain; charset=utf-8')
    return send(res, 302, '', 'text/plain', { 'Set-Cookie': `tower_token=${TOKEN}; HttpOnly; SameSite=Strict; Path=/`, Location: '/' })
  }

  const asset = STATIC[url.pathname]
  if (req.method === 'GET' && asset) {
    if (url.pathname === '/' && !sameToken(cookieToken(req))) {
      return send(res, 403, 'Open the cockpit with /cockpit in Claude Code, or the link the server printed.', 'text/plain; charset=utf-8')
    }
    try { return send(res, 200, await readFile(join(HERE, asset[0])), asset[1]) } catch { return send(res, 404, { error: 'missing' }) }
  }

  if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' })
  if (!sameToken(cookieToken(req))) return send(res, 401, { error: 'no session; open the cockpit link again' })

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write(`data: ${snapshotJson}\n\n`)
    listeners.add(res)
    req.on('close', () => listeners.delete(res))
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/commands') {
    return send(res, 200, (await commandsOf(url.searchParams.get('id') ?? '')) ?? [])
  }

  // Actions: POST, JSON, and only from the cockpit's own page.
  const action = ACTIONS[url.pathname.slice('/api/'.length)]
  if (req.method !== 'POST' || !action) return send(res, 404, { error: 'not found' })
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'wrong origin' })
  if (!/^application\/json/.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'json only' })
  try {
    const result = await action(await body(req))
    setTimeout(() => { refresh().catch(() => {}) }, 300)
    return send(res, result.ok ? 200 : 400, result)
  } catch (err) {
    return send(res, 500, { ok: false, message: String(err.message ?? err) })
  }
})

// One cockpit per machine: a second start just prints the running one's link.
async function running() {
  try {
    const info = JSON.parse(await readFile(join(TOWER, 'cockpit.json'), 'utf8'))
    const res = await fetch(`http://127.0.0.1:${info.port}/favicon.svg`, { signal: AbortSignal.timeout(1500) })
    return res.ok ? info : null
  } catch {
    return null
  }
}

async function openBrowser(link) {
  if (process.platform === 'win32') await run('rundll32.exe', ['url.dll,FileProtocolHandler', link])
  else await run(process.platform === 'darwin' ? 'open' : 'xdg-open', [link])
}

const existing = await running()
if (existing) {
  console.log(existing.url)
  if (argv.includes('--open')) await openBrowser(existing.url)
  process.exit(0)
}

server.listen(PORT, '127.0.0.1', async () => {
  const link = `http://127.0.0.1:${PORT}/?t=${TOKEN}`
  await mkdir(TOWER, { recursive: true })
  await writeFile(join(TOWER, 'cockpit.json'), JSON.stringify({ port: PORT, pid: process.pid, url: link, startedAt: new Date().toISOString() }))
  await refresh().catch(() => {})
  console.log(link)
  if (argv.includes('--open')) await openBrowser(link)
})
server.on('error', err => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is taken; start with --port <another>.` : String(err))
  process.exit(1)
})
