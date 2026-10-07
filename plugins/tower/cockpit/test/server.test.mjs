import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

// The real server on a spare port, with a throwaway TOWER_HOME.
const home = mkdtempSync(join(tmpdir(), 'tower-test-'))
const PORT = 4790 + Math.floor(Math.random() * 100)
const base = `http://127.0.0.1:${PORT}`
let server, link, cookie

before(async () => {
  server = spawn(process.execPath, ['server.mjs', '--port', String(PORT)], { cwd: join(import.meta.dirname, '..'), env: { ...process.env, TOWER_HOME: home } })
  link = await new Promise((resolve, reject) => {
    server.stdout.on('data', d => { const m = /http:\S+/.exec(String(d)); if (m) resolve(m[0]) })
    server.on('exit', code => reject(new Error(`server exited ${code}`)))
    setTimeout(() => reject(new Error('server did not start')), 15000)
  })
})

after(() => {
  server.kill()
  rmSync(home, { recursive: true, force: true })
})

test('the page needs the token, and the token becomes a same-site cookie', async () => {
  assert.equal((await fetch(`${base}/`)).status, 403)
  assert.equal((await fetch(`${base}/?t=nope`, { redirect: 'manual' })).status, 403)
  const res = await fetch(link, { redirect: 'manual' })
  assert.equal(res.status, 302)
  cookie = res.headers.get('set-cookie').split(';')[0]
  assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)
  assert.equal((await fetch(`${base}/`, { headers: { cookie } })).status, 200)
})

test('another host name is refused, which stops DNS rebinding', async () => {
  // fetch() will not send a Host of our choosing; a raw request will.
  const status = await new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port: PORT, path: '/favicon.svg', headers: { host: `evil.example:${PORT}` } }, res => resolve(res.statusCode)).on('error', reject).end()
  })
  assert.equal(status, 421)
})

test('the data needs the cookie', async () => {
  assert.equal((await fetch(`${base}/api/commands?id=x`)).status, 401)
  assert.equal((await fetch(`${base}/api/commands?id=x`, { headers: { cookie } })).status, 200)
})

test('actions take JSON from the cockpit\'s own origin only', async () => {
  const send = (headers, body) => fetch(`${base}/api/send`, { method: 'POST', headers: { cookie, ...headers }, body })
  assert.equal((await send({ 'content-type': 'text/plain' }, 'x')).status, 415)
  assert.equal((await send({ 'content-type': 'application/json', origin: 'https://evil.example' }, '{}')).status, 403)
  const ok = await send({ 'content-type': 'application/json', origin: base }, JSON.stringify({ id: 'sess-9', text: '/compact' }))
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).message, 'Queued /compact.')
  const line = JSON.parse(readFileSync(join(home, 'inbox', 'sess-9.jsonl'), 'utf8').trim())
  assert.deepEqual({ ...line, at: undefined }, { v: 1, kind: 'prompt', text: '/compact', at: undefined })
  assert.ok(Date.parse(line.at) > 0)
})

test('an answer is appended for beacon, and a bad session id writes nothing', async () => {
  const post = body => fetch(`${base}/api/answer`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) })
  assert.equal((await post({ id: 'sess-9', pendingId: 'p-1', allow: true })).status, 200)
  const lines = readFileSync(join(home, 'inbox', 'sess-9.jsonl'), 'utf8').trim().split('\n')
  assert.deepEqual({ ...JSON.parse(lines.at(-1)), at: undefined }, { v: 1, kind: 'answer', pendingId: 'p-1', allow: true, at: undefined })
  assert.equal((await post({ id: '../../evil', pendingId: 'p-1', allow: true })).status, 400)
})

test('--restart replaces the running cockpit, --stop stops it', async () => {
  const own = mkdtempSync(join(tmpdir(), 'tower-life-'))
  const port = 4900 + Math.floor(Math.random() * 90)
  const env = { ...process.env, TOWER_HOME: own }
  const cwd = join(import.meta.dirname, '..')
  const up = child => new Promise((resolve, reject) => {
    child.stdout.on('data', d => { if (/http:\S+/.test(String(d))) resolve() })
    child.on('exit', code => reject(new Error(`exited ${code}`)))
  })
  const exited = child => new Promise(resolve => child.on('exit', resolve))
  const info = () => JSON.parse(readFileSync(join(own, 'cockpit.json'), 'utf8'))
  const first = spawn(process.execPath, ['server.mjs', '--port', String(port)], { cwd, env })
  try {
    await up(first)
    assert.equal(info().pid, first.pid)
    const second = spawn(process.execPath, ['server.mjs', '--port', String(port), '--restart'], { cwd, env })
    await Promise.all([up(second), exited(first)])
    assert.equal(info().pid, second.pid)
    const stop = spawn(process.execPath, ['server.mjs', '--stop'], { cwd, env })
    await Promise.all([exited(stop), exited(second)])
    assert.throws(() => info(), 'cockpit.json is gone')
  } finally {
    first.kill()
    rmSync(own, { recursive: true, force: true })
  }
})
