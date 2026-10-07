// The cockpit page in a real Chrome, driven with a real keyboard and mouse: what a person
// does, which fake events from a script cannot check (focus, typing, clicking where a
// button is). Runs against the site's demo, which is the same page on sample data.
// Skipped when puppeteer-core or Chrome is missing (`npm i --no-save puppeteer-core`).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'site')
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)
let puppeteer = null
try { puppeteer = (await import('puppeteer-core')).default } catch { /* skipped below */ }
const skip = !puppeteer || !CHROME ? 'needs puppeteer-core and Chrome' : false

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css' }
let server, browser, page

before(async () => {
  if (skip) return
  server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '')
    if (!path || path.endsWith('/')) path += 'index.html'
    const file = join(SITE, path)
    if (!file.startsWith(SITE) || !existsSync(file)) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
  }).listen(0, '127.0.0.1')
  await new Promise(r => server.on('listening', r))
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`http://127.0.0.1:${server.address().port}/demo/`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('#say')
})

after(async () => {
  await browser?.close()
  server?.close()
})

const pause = ms => new Promise(r => setTimeout(r, ms))
const state = () => page.evaluate(() => ({
  value: document.getElementById('say')?.value,
  focused: document.activeElement?.id,
  menu: [...document.querySelectorAll('#say-commands [role=option] span:first-child')].map(s => s.textContent),
  needs: Number((document.body.innerText.match(/(\d+) need you/) || [])[1]),
}))

test('typing a slash keeps focus and filters the command menu as each key lands', { skip }, async () => {
  await page.click('#say')
  await page.keyboard.type('/', { delay: 60 })
  await pause(150)
  let s = await state()
  assert.equal(s.focused, 'say')
  assert.ok(s.menu.length >= 5, 'the menu opens on "/" with the session\'s commands')
  await page.keyboard.type('co', { delay: 60 })
  await pause(150)
  s = await state()
  assert.equal(s.value, '/co')
  assert.equal(s.focused, 'say')
  assert.ok(s.menu.length > 0 && s.menu.every(name => name.includes('co')), `filtered to /co, got ${s.menu}`)
})

test('arrow keys and Enter pick a command, Escape closes the menu', { skip }, async () => {
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await pause(150)
  let s = await state()
  assert.match(s.value, /^\/\S+ $/)
  assert.equal(s.menu.length, 0)
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control')
  await page.keyboard.type('/', { delay: 40 })
  await pause(150)
  assert.ok((await state()).menu.length > 0)
  await page.keyboard.press('Escape')
  await pause(150)
  s = await state()
  assert.equal(s.menu.length, 0)
  assert.equal(s.focused, 'say')
})

test('a real click on Allow answers the request and clears it from the waiting count', { skip }, async () => {
  await page.evaluate(() => { const i = document.getElementById('say'); i.blur(); window.scrollTo(0, 0) })
  const before = (await state()).needs
  assert.ok(before > 0)
  const at = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Allow'))
    b.scrollIntoView({ block: 'center' })
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.click(at.x, at.y)
  await pause(300)
  assert.equal((await state()).needs, before - 1)
})
