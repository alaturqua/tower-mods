#!/usr/bin/env node
// Renders the demo video: drives the site's live demo in your Chrome, in light mode, and
// screenshots every step at 1920x1080 with a drawn cursor and captions, then ffmpeg joins
// the frames. Frame by frame means it is exactly as sharp as the page and never records
// your screen.
//   npm i --no-save puppeteer-core
//   node scripts/record-demo.mjs [out.mp4]
// Needs Chrome (set CHROME if it is not in the usual place) and ffmpeg on PATH (or FFMPEG).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer-core'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(HERE, '..', 'site')
const OUT = resolve(process.argv[2] ?? join(HERE, '..', 'tower-cockpit-demo.mp4'))
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync)
if (!CHROME) throw new Error('Chrome not found; set CHROME to its path.')

// The page is laid out as on a laptop and captured at 4/3, so each frame is 1920x1080.
const W = 1440, H = 810, SCALE = 4 / 3, FPS = 30
const FRAMES = join(tmpdir(), `tower-video-${process.pid}`)
rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json' }
const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
  if (!path || path.endsWith('/') || path.endsWith('\\')) path += 'index.html'
  const file = join(SITE, path)
  if (!file.startsWith(SITE) || !existsSync(file)) { res.writeHead(404).end(); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-device-scale-factor=' + SCALE] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE })
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('tower-cockpit-prefs', JSON.stringify({ theme: 'light' })) } catch {}
})
await page.goto(`${base}/demo/`, { waitUntil: 'networkidle0' })
await page.evaluate(() => document.fonts.ready)
await sleep(600)

// ---- overlays drawn over the page: cursor, click ring, captions, title and end cards -----

await page.evaluate(() => {
  const css = document.createElement('style')
  css.textContent = `
    #tw-cursor { position: fixed; left: 0; top: 0; z-index: 99998; pointer-events: none; width: 28px; height: 28px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #tw-ring { position: fixed; z-index: 99997; pointer-events: none; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #0A6E8A; opacity: 0; }
    #tw-caption { position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 99996; pointer-events: none; max-width: 1200px; padding: 14px 28px; border-radius: 14px; background: rgba(22,27,34,.94); color: #fff; font: 600 26px/1.3 'IBM Plex Sans', system-ui, sans-serif; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,.28); opacity: 0; }
    .tw-card { position: fixed; inset: 0; z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: #F6F7F9; color: #161B22; font-family: 'IBM Plex Sans', system-ui, sans-serif; text-align: center; opacity: 0; pointer-events: none; }
    .tw-card h1 { margin: 0; font-size: 76px; line-height: 1.08; letter-spacing: -0.02em; }
    .tw-card p { margin: 0; font-size: 30px; color: #3A4350; }
    .tw-brand { display: flex; align-items: center; gap: 14px; font-size: 34px; font-weight: 700; }
    .tw-cmd { margin-top: 10px; max-width: 1240px; padding: 18px 26px; border-radius: 14px; background: #fff; border: 1px solid #C9D0DA; font: 500 22px/1.5 'IBM Plex Mono', monospace; color: #161B22; overflow-wrap: anywhere; }
    .tw-url { font-size: 30px; font-weight: 600; color: #0A6E8A; }
  `
  document.head.appendChild(css)
  const mark = '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#0A6E8A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M8 21h8"/><path d="M6 7h12l-2 4H8z"/><path d="M4 4l3 2"/><path d="M20 4l-3 2"/></svg>'
  const add = html => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d.firstElementChild); return document.body.lastElementChild }
  add('<svg id="tw-cursor" viewBox="0 0 28 28" style="left:-40px"><path d="M5 3l16 10-7 1.8 4 7-3.2 1.7-4-7L5 22z" fill="#161B22" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>')
  add('<div id="tw-ring"></div>')
  add('<div id="tw-caption"></div>')
  add(`<div class="tw-card" id="tw-title"><div class="tw-brand">${mark}Tower</div><h1>Five repos. A dozen agents.<br>One cockpit.</h1><p>Every Claude Code agent, across your repos, in one place.</p></div>`)
  add(`<div class="tw-card" id="tw-end"><div class="tw-brand">${mark}Tower</div><h1>A cockpit for every<br>Claude Code agent.</h1><div class="tw-cmd">claude plugin marketplace add alaturqua/tower-mods &amp;&amp; claude plugin install tower@tower</div><div class="tw-url">alaturqua.github.io/tower-mods</div></div>`)
})

// ---- frames ------------------------------------------------------------------------------

const frames = []
let n = 0
async function shot(seconds) {
  const file = join(FRAMES, `f${String(n++).padStart(5, '0')}.png`)
  await page.screenshot({ path: file, type: 'png', optimizeForSpeed: true })
  frames.push({ file, seconds })
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
const ease = t => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2)
const set = (id, props) => page.evaluate((id, props) => Object.assign(document.getElementById(id).style, props), id, props)

let cursor = { x: W * 0.62, y: H * 0.5 }
async function drawCursor() {
  await page.evaluate(c => { const el = document.getElementById('tw-cursor'); el.style.left = c.x - 4 + 'px'; el.style.top = c.y - 3 + 'px' }, cursor)
}

// The centre of the first element whose text matches, scrolled into view when it needs it.
async function where(find) {
  return page.evaluate(find => {
    const pick = ({ sel = 'button, a, input, textarea', text, exact, nth = 0, within }) => {
      const root = within ? document.querySelector(within) ?? document : document
      const hits = [...root.querySelectorAll(sel)].filter(el => {
        const t = (el.textContent || el.placeholder || '').replace(/\s+/g, ' ').trim()
        return text === undefined || (exact ? t === text : t.startsWith(text))
      })
      return hits[nth]
    }
    const el = pick(find)
    if (!el) return null
    const r0 = el.getBoundingClientRect()
    if (r0.top < 70 || r0.bottom > innerHeight - 90) el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, find)
}

async function glide(to, seconds = 0.7) {
  const from = { ...cursor }
  const steps = Math.max(2, Math.round(seconds * FPS))
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps)
    cursor = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
    await drawCursor()
    await shot(1 / FPS)
  }
  await page.mouse.move(to.x, to.y)
}

async function click(find, { glideSeconds = 0.7, after = 0.5 } = {}) {
  const at = await where(find)
  if (!at) throw new Error('not found: ' + JSON.stringify(find))
  await glide(at, glideSeconds)
  await set('tw-ring', { left: at.x + 'px', top: at.y + 'px', opacity: '1', transform: 'scale(0.5)' })
  await shot(2 / FPS)
  await set('tw-ring', { transform: 'scale(1.15)', opacity: '0.7' })
  await page.mouse.click(at.x, at.y)
  await sleep(120)
  await shot(2 / FPS)
  await set('tw-ring', { opacity: '0' })
  await sleep(120)
  await shot(after)
}

async function type(text, perChar = 0.06) {
  for (const ch of text) {
    await page.keyboard.type(ch)
    await sleep(25)
    await shot(perChar)
  }
}

async function caption(text, { seconds = 0, fade = 4 } = {}) {
  await page.evaluate(t => { const c = document.getElementById('tw-caption'); if (t) c.textContent = t }, text)
  const to = text ? 1 : 0
  for (let i = 1; i <= fade; i++) {
    await set('tw-caption', { opacity: String(to ? i / fade : 1 - i / fade) })
    await shot(1 / FPS)
  }
  if (seconds) await shot(seconds)
}

async function card(id, visible, fade = 8) {
  for (let i = 1; i <= fade; i++) {
    await set(id, { opacity: String(visible ? i / fade : 1 - i / fade) })
    await shot(1 / FPS)
  }
}

// ---- the story, about 45 seconds ---------------------------------------------------------

await set('tw-title', { opacity: '1' })
await shot(3)
await card('tw-title', false)
await shot(0.4)

await caption('Three agents are waiting on you.', { seconds: 2.4 })

// 1. Allow a push: the agent's reason and a risk badge are on the card.
await caption('Allow a push, with the agent\'s reason and a risk badge.', { fade: 2 })
await glide(await where({ text: 'Allow', nth: 0 }), 0.9)
await shot(1.4)
await click({ text: 'Allow', nth: 0 }, { after: 1.4 })

// 2. Answer a question.
await caption('Answer a question in one click.', { fade: 2 })
await click({ text: 'staging', nth: 0 }, { after: 1.4 })

// 3. An edit: the diff is on the card.
await caption('See the diff before you allow an edit.', { fade: 2 })
await glide(await where({ text: 'Allow', nth: 0 }), 0.8)
await shot(2.2)
await click({ text: 'Allow', nth: 0 }, { after: 1.2 })

// 4. Three views.
await caption('Table, cards, or a timeline of who waited on you.', { fade: 2 })
await click({ text: 'Cards', exact: true }, { after: 1.8 })
await click({ text: 'Timeline', exact: true }, { after: 2.2 })
await click({ text: 'Table', exact: true }, { after: 1.0 })

// 5. A workstream in its own git worktree.
await caption('Start a workstream in its own git worktree.', { fade: 2 })
await click({ text: '+ New agent' }, { after: 0.9 })
await click({ sel: 'input', text: 'e.g. add-rate-limits' }, { glideSeconds: 0.6, after: 0.2 })
await type('add-rate-limits')
await shot(0.4)
await click({ sel: 'textarea', text: 'What should happen' }, { glideSeconds: 0.5, after: 0.2 })
await type('Add rate limits to the public API', 0.035)
await shot(1.2)
await click({ text: 'Create workstream' }, { after: 2.2 })

// 6. Prompts and slash commands.
await caption('Send prompts and slash commands to any session.', { fade: 2 })
await click({ sel: 'input', text: 'Send a prompt' }, { glideSeconds: 0.8, after: 0.3 })
await type('/co')
await shot(2.4)
await page.keyboard.press('ArrowDown')
await sleep(120)
await shot(1.8)
await page.keyboard.press('Escape')
await sleep(120)
await shot(0.3)
await caption(null, { fade: 3 })

// End card.
await set('tw-end', { opacity: '0' })
await card('tw-end', true)
await shot(5)

await browser.close()
server.close()

// ---- join -------------------------------------------------------------------------------

const list = join(FRAMES, 'frames.txt')
const lines = frames.map(f => `file '${f.file.replace(/\\/g, '/')}'\nduration ${f.seconds.toFixed(4)}`)
lines.push(`file '${frames.at(-1).file.replace(/\\/g, '/')}'`)
writeFileSync(list, lines.join('\n'))
mkdirSync(dirname(OUT), { recursive: true })
// H.264, 30 fps, yuv420p and a silent AAC track: what LinkedIn (and everything else) plays.
execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '64k', '-shortest', OUT], { stdio: 'inherit' })
rmSync(FRAMES, { recursive: true, force: true })
const seconds = frames.reduce((s, f) => s + f.seconds, 0)
console.log(`${OUT}: ${frames.length} frames, ${seconds.toFixed(1)}s`)
