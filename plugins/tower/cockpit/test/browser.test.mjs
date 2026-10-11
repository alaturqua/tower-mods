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

// ---- layout: an app that fits the window, panels you can resize -------------------------

async function open(width, height, query = '') {
  const tab = await browser.newPage()
  await tab.setViewport({ width, height })
  await tab.goto(`http://127.0.0.1:${server.address().port}/demo/${query}`, { waitUntil: 'networkidle0' })
  await tab.waitForSelector('#say')
  return tab
}
const widths = tab => tab.evaluate(() => ({
  rail: Math.round(document.querySelector('nav[aria-label=Repositories]').getBoundingClientRect().width),
  detail: Math.round(document.querySelector('aside[aria-label="Selected agent"]').getBoundingClientRect().width),
}))
async function drag(tab, id, dx) {
  const box = await (await tab.$(id)).boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await tab.mouse.move(x, y)
  await tab.mouse.down()
  await tab.mouse.move(x + dx, y, { steps: 8 })
  await tab.mouse.up()
  await pause(150)
}

test('the page fits the window: the send box stays in view and each panel scrolls on its own', { skip }, async () => {
  const tab = await open(1280, 720, '?long')
  const m = await tab.evaluate(() => {
    const scrolls = el => el.scrollHeight > el.clientHeight + 1
    return {
      pageOverflow: document.scrollingElement.scrollHeight - innerHeight,
      sayBottom: document.getElementById('say').getBoundingClientRect().bottom,
      railScrolls: scrolls(document.querySelector('nav[aria-label=Repositories]')),
      mainScrolls: scrolls(document.querySelector('main')),
    }
  })
  assert.ok(m.pageOverflow <= 0, 'the page itself does not scroll')
  assert.ok(m.sayBottom <= 720, `the send box is inside the window (bottom ${m.sayBottom})`)
  assert.ok(m.railScrolls && m.mainScrolls, 'the rail and the middle scroll inside themselves')
  await tab.close()
})

test('long repo and branch names wrap, and the full name is the tooltip', { skip }, async () => {
  const tab = await open(1280, 720, '?long')
  const names = await tab.evaluate(() => [...document.querySelectorAll('nav[aria-label=Repositories] [title]')].map(el => ({ title: el.title, text: el.textContent.trim(), clipped: el.scrollHeight > el.clientHeight + 1 })))
  const branch = names.find(n => n.title.startsWith('feature/AZPDP-3014'))
  assert.ok(branch, 'the long branch is listed with its full name as the tooltip')
  assert.equal(branch.title.length > 40, true)
  assert.ok(names.every(n => n.text.length > 0))
  await tab.close()
})

test('dragging a grip resizes its panel, a reload keeps it, double-click resets it', { skip }, async () => {
  const tab = await open(1280, 720)
  const start = await widths(tab)
  await drag(tab, '#resize-rail', 120)
  assert.equal((await widths(tab)).rail, start.rail + 120)
  await drag(tab, '#resize-detail', -50)
  assert.equal((await widths(tab)).detail, start.detail + 50)
  await tab.reload({ waitUntil: 'networkidle0' })
  await tab.waitForSelector('#say')
  assert.deepEqual(await widths(tab), { rail: start.rail + 120, detail: start.detail + 50 })
  await tab.click('#resize-rail', { count: 2 })
  await pause(150)
  assert.equal((await widths(tab)).rail, 300)
  await tab.close()
})

test('a panel stops at its limits and always leaves room for the middle', { skip }, async () => {
  const tab = await open(1280, 720)
  await drag(tab, '#resize-rail', 900)
  const w = await widths(tab)
  assert.ok(w.rail <= 560, `the rail stays under its maximum (${w.rail})`)
  const main = await tab.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width))
  assert.ok(main >= 340, `the middle keeps its room (${main})`)
  await drag(tab, '#resize-rail', -900)
  assert.equal((await widths(tab)).rail, 220)
  await tab.close()
})

test('arrow keys resize a focused grip, Shift takes a bigger step', { skip }, async () => {
  const tab = await open(1280, 720)
  const start = (await widths(tab)).rail
  await tab.focus('#resize-rail')
  await tab.keyboard.press('ArrowRight')
  await pause(100)
  assert.equal((await widths(tab)).rail, start + 16)
  await tab.keyboard.down('Shift'); await tab.keyboard.press('ArrowRight'); await tab.keyboard.up('Shift')
  await pause(100)
  assert.equal((await widths(tab)).rail, start + 16 + 64)
  await tab.close()
})

// ---- usage, Always allow, the done log, the merge queue, fan-outs, the opt-in -------------

const clickText = (tab, text) => tab.evaluate(t => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(t))
  if (!b) return false
  b.scrollIntoView({ block: 'center' })
  b.click()
  return true
}, text)
const toast = tab => tab.evaluate(() => document.querySelector('[role=status]')?.textContent ?? '')

test('the header shows the account\'s rate-limit windows', { skip }, async () => {
  const tab = await open(1440, 900)
  const text = await tab.evaluate(() => document.querySelector('header').innerText)
  assert.match(text, /5-hour 72% · resets 1h/)
  assert.match(text, /Weekly 41%/)
  await tab.close()
})

test('Always allow asks first, then allows and says which rule now holds', { skip }, async () => {
  const tab = await open(1440, 900)
  const asked = []
  tab.on('dialog', d => { asked.push(d.message()); d.accept() })
  assert.ok(await clickText(tab, 'Always allow'))
  await pause(300)
  assert.match(asked[0], /npm run lint/)
  assert.match(await toast(tab), /Bash\(npm run lint\) now runs without asking/)
  assert.equal(await tab.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Always allow')), false)
  await tab.close()
})

test('the Done view lists finished runs with what they changed and cost', { skip }, async () => {
  const tab = await open(1440, 900)
  assert.ok(await clickText(tab, 'Done'))
  await pause(200)
  const text = await tab.evaluate(() => document.querySelector('section[aria-label=Agents]').innerText)
  assert.match(text, /Orders list is one query now/)
  assert.match(text, /\+41 −63 · 4 files/)
  assert.match(text, /12m 40s · \$0\.58/)
  await tab.evaluate(() => localStorage.clear())
  await tab.close()
})

test('two green PRs in a repo offer one merge in order', { skip }, async () => {
  const tab = await open(1440, 900)
  tab.on('dialog', d => d.accept())
  assert.match(await tab.evaluate(() => document.querySelector('section[aria-label="Merge queue"]').innerText), /#88, #90/)
  assert.ok(await clickText(tab, 'Merge all in order'))
  await pause(300)
  assert.match(await toast(tab), /Merged #88, #90 in order/)
  assert.equal(await tab.$('section[aria-label="Merge queue"]'), null)
  await tab.close()
})

test('a fan-out is compared side by side, and keeping one removes the others', { skip }, async () => {
  const tab = await open(1440, 900)
  tab.on('dialog', d => d.accept())
  const card = await tab.evaluate(() => document.querySelector('section[aria-label="Compare rate-limit"]').innerText)
  assert.match(card, /rate-limit-1[\s\S]*Conflict: src\/auth\/session\.ts/)
  assert.match(card, /Sliding window in Redis; 14 tests pass\./)
  await tab.evaluate(() => [...document.querySelectorAll('section[aria-label="Compare rate-limit"] button')].filter(b => b.textContent.trim() === 'Keep this one')[1].click())
  await pause(300)
  assert.match(await toast(tab), /Kept rate-limit-2/)
  assert.equal(await tab.$('section[aria-label="Compare rate-limit"]'), null)
  assert.equal(await tab.evaluate(() => document.body.innerText.includes('rate-limit-1')), false)
  await tab.close()
})

test('the launch form starts several agents on one task as a comparison', { skip }, async () => {
  const tab = await open(1440, 900)
  assert.ok(await clickText(tab, '+ New agent'))
  await tab.waitForSelector('#ws-name')
  await tab.type('#ws-name', 'speed-up')
  await tab.type('#ws-task', 'Make the build faster')
  await tab.select('#ws-copies', '3')
  await pause(100)
  assert.ok(await clickText(tab, 'Start 3 agents'))
  await pause(300)
  const card = await tab.evaluate(() => document.querySelector('section[aria-label="Compare speed-up"]')?.innerText ?? '')
  assert.match(card, /3 agents/i)
  assert.match(card, /speed-up-1[\s\S]*speed-up-2[\s\S]*speed-up-3/)
  await tab.close()
})

test('a session waiting in its terminal brings the offer to answer from here, once', { skip }, async () => {
  const tab = await open(1440, 900)
  assert.ok(await tab.$('section[aria-label="Answer from here"]'))
  assert.ok(await clickText(tab, 'Turn on'))
  await pause(300)
  assert.match(await toast(tab), /Sessions you start from now on/)
  assert.equal(await tab.$('section[aria-label="Answer from here"]'), null)
  await tab.reload({ waitUntil: 'networkidle0' })
  await tab.waitForSelector('#say')
  assert.equal(await tab.$('section[aria-label="Answer from here"]'), null, 'dismissed for good in this browser')
  await tab.evaluate(() => localStorage.clear())
  await tab.close()
})

// ---- the agent panel: switchable model and effort, and finished runs from the Done view ----

test('the panel switches the model and effort by sending the slash command', { skip }, async () => {
  const tab = await open(1440, 900)
  const label = sel => tab.evaluate(s => document.querySelector(s)?.selectedOptions[0]?.textContent ?? '', sel)
  assert.equal(await label('select[aria-label=Model]'), 'Opus 5.5')
  await tab.select('select[aria-label=Model]', 'sonnet')
  await pause(300)
  assert.match(await toast(tab), /Queued \/model/)
  assert.equal(await label('select[aria-label=Model]'), 'Opus 5.5 → Sonnet…', 'shows the switch until the session reports it')
  await tab.select('select[aria-label=Effort]', 'max')
  await pause(300)
  assert.match(await toast(tab), /Queued \/effort/)
  assert.equal(await label('select[aria-label=Effort]'), 'high → max…')
  await tab.close()
})

test('a Done entry opens its run: the live agent if it still runs, else a read-only record', { skip }, async () => {
  const tab = await open(1440, 900)
  assert.ok(await clickText(tab, 'Done'))
  await pause(200)
  const openRun = name => tab.evaluate(n => [...document.querySelectorAll('section[aria-label=Agents] li button')].find(b => b.innerText.includes(n)).click(), name)
  await openRun('lint-fix')
  await pause(200)
  assert.match(await tab.evaluate(() => document.querySelector('aside[aria-label="Selected agent"]')?.innerText ?? ''), /lint-fix/, 'still running: its live panel')
  await openRun('n-plus-one')
  await pause(200)
  const run = await tab.evaluate(() => document.querySelector('aside[aria-label="Finished run"]')?.innerText ?? '')
  assert.match(run, /This session has ended/)
  assert.match(run, /Found the N\+1/, 'the whole last message, not just its last line')
  assert.match(run, /src\/orders\/list\.ts/)
  assert.equal(await tab.$('aside[aria-label="Selected agent"]'), null)
  await tab.evaluate(() => localStorage.clear())
  await tab.close()
})

test('clicking anywhere on a timeline lane opens that agent', { skip }, async () => {
  const tab = await open(1440, 900)
  assert.ok(await clickText(tab, 'Timeline'))
  await pause(200)
  const lane = await tab.$('button[title="Open web · flaky-tests"]')
  const box = await lane.boundingBox()
  await tab.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
  await pause(200)
  assert.match(await tab.evaluate(() => document.querySelector('aside[aria-label="Selected agent"] h2').innerText), /flaky-tests/)
  await tab.evaluate(() => localStorage.clear())
  await tab.close()
})

test('a row shows its running subagents, and the panel lists each with what it is doing', { skip }, async () => {
  const tab = await open(1440, 900)
  const row = await tab.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('flaky-tests') && b.innerText.includes('running'))?.innerText ?? '')
  assert.match(row, /2 subagents running/)
  await tab.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('flaky-tests')).click())
  await pause(200)
  assert.ok(await clickText(tab, 'Subagents · 3'))
  await pause(200)
  const list = await tab.evaluate(() => document.querySelector('ul[aria-label=Subagents]').innerText)
  assert.match(list, /Rerun checkout\.spec 20 times[\s\S]*npx playwright test checkout/)
  assert.match(list, /completed[\s\S]*14 tool calls/)
  await tab.evaluate(() => localStorage.clear())
  await tab.close()
})

test('a row\'s ⋯ opens its actions, and Continue sends to that agent', { skip }, async () => {
  const tab = await open(1440, 900)
  await tab.click('button[aria-label="Actions for infra · lint-fix"]')
  await pause(200)
  const items = await tab.evaluate(() => [...document.querySelectorAll('#agent-menu [role=menuitem]')].map(b => b.textContent.trim()))
  assert.deepEqual(items.slice(0, 2), ['Continue', 'Compact'])
  assert.ok(items.includes('Open in editor'))
  assert.ok(!items.includes('Stop'), 'a terminal session cannot be stopped from here')
  await tab.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].find(b => b.textContent.trim() === 'Continue').click())
  await pause(300)
  assert.match(await toast(tab), /Queued/)
  assert.equal(await tab.$('[role=menu][aria-label="Actions for infra · lint-fix"]'), null, 'choosing closes it')
  await tab.close()
})

test('Clear log empties the Done view after asking', { skip }, async () => {
  const tab = await open(1440, 900)
  const asked = []
  tab.on('dialog', d => { asked.push(d.message()); d.accept() })
  assert.ok(await clickText(tab, 'Done'))
  await pause(200)
  assert.ok(await clickText(tab, 'Clear log'))
  await pause(300)
  assert.match(asked[0], /Clear the Done log/)
  assert.match(await tab.evaluate(() => document.querySelector('section[aria-label=Agents]').innerText), /Nothing has finished/)
  await tab.evaluate(() => localStorage.clear())
  await tab.close()
})

test('the dashboard says where the money went and opens what it lists', { skip }, async () => {
  const tab = await open(1440, 900)
  assert.ok(await clickText(tab, 'Dashboard'))
  await pause(200)
  const main = await tab.evaluate(() => document.querySelector('main').innerText)
  assert.match(main, /Runs, last 14 days\s+\d+/)
  assert.doesNotMatch(main, /NEEDS YOU/i, 'triage belongs to the Table and Cards views')
  assert.equal(await tab.evaluate(() => document.querySelectorAll('section[aria-label="Spend per day"] [title]').length), 14)
  assert.match(await tab.evaluate(() => document.querySelector('section[aria-label="Spend per day"] [role=img]').getAttribute('aria-label')), /Highest \$4\.00/)
  assert.match(await tab.evaluate(() => document.querySelector('section[aria-label="Spend by repository"]').innerText), /api[\s\S]*\$9\.80 · 19 runs/)
  // a costly run still in the Done log opens its record
  await tab.evaluate(() => [...document.querySelectorAll('section[aria-label="Most expensive runs"] button')].find(b => b.innerText.includes('n-plus-one')).click())
  await pause(200)
  assert.match(await tab.evaluate(() => document.querySelector('aside[aria-label="Finished run"]')?.innerText ?? ''), /n-plus-one/)
  // the fullest context window opens that agent
  await tab.evaluate(() => document.querySelector('section[aria-label="Fullest context windows"] button').click())
  await pause(200)
  assert.match(await tab.evaluate(() => document.querySelector('aside[aria-label="Selected agent"] h2').innerText), /bump-deps/)
  await tab.evaluate(() => localStorage.clear())
  await tab.close()
})
