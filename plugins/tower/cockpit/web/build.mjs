// Builds the cockpit page from the design mockup: the mockup's markup with its sample
// controls wired to real actions, and logic.js in place of the mockup's sample logic.
//   node build.mjs <mockup.dc.html>
// The mockup stays the one source of the look; rerun this after changing it.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(process.argv[2] ?? join(here, '..', '..', '..', '..', 'site', 'demo', 'cockpit.dc.html'), 'utf8')
let page = source.slice(0, source.indexOf('<script type="text/x-dc"'))

function swap(from, to) {
  if (!page.includes(from)) throw new Error('mockup changed; not found: ' + from.slice(0, 90))
  page = page.split(from).join(to)
}
const btn = 'min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--edge); background: var(--control); color: var(--text)'
const select = 'min-height: 42px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--edge); background: var(--bg); color: var(--text); font: inherit'

// Header: real spend, a warning when the data stops, no search yet.
swap('$6.81 today · cap $20</span>', `{{fleet.cost}} across sessions</span>
      <sc-if value="{{conn.down}}" hint-placeholder-val="{{ false }}">
        <span role="status" style="display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 999px; background: var(--bad-tint); color: var(--bad); font-size: 13px; font-weight: 600">{{conn.label}}</span>
      </sc-if>`)
swap(`      <button type="button" style="min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--edge); background: var(--control); color: var(--text)">Search <kbd>/</kbd></button>\n`, '')
swap('<button type="button" style="min-height: 40px; padding: 0 16px; border-radius: 8px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">+ New agent</button>',
  '<button type="button" onClick="{{newAgent}}" style="min-height: 40px; padding: 0 16px; border-radius: 8px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">+ New agent</button>')
swap('<button type="button" style="margin-top: 8px; min-height: 40px; padding: 0 10px; border-radius: 8px; border: 1px dashed var(--edge); background: transparent; color: var(--muted); text-align: left">+ Add repository</button>',
  '<button type="button" onClick="{{addRepo}}" style="margin-top: 8px; min-height: 40px; padding: 0 10px; border-radius: 8px; border: 1px dashed var(--edge); background: transparent; color: var(--muted); text-align: left">+ Add repository</button>')

// The launch form: a workstream (new worktree) or an agent in place, with real choices.
swap('New workstream in {{form.repo}}</h2>', '{{form.title}}</h2>')
swap('Creates a git worktree on its own branch, so agents here never collide with other work in this repo, then starts an agent in it.</span>', `{{form.blurb}}</span>
            <label style="display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px"><input type="checkbox" checked="{{form.worktree}}" onChange="{{form.toggleWorktree}}" style="width: 18px; height: 18px; accent-color: var(--work)"> Create a git worktree on its own branch</label>`)
page = page.replace(/<option value="main">main<\/option>\s*<option value="develop">develop<\/option>\s*<option value="current">current branch<\/option>/,
  '<sc-for list="{{form.bases}}" as="o" hint-placeholder-count="2"><option value="{{o.value}}">{{o.label}}</option></sc-for>')
page = page.replace(/<option value="Opus 5\.5">Opus 5\.5<\/option>\s*<option value="Sonnet 5\.5">Sonnet 5\.5<\/option>\s*<option value="Haiku 4\.5">Haiku 4\.5<\/option>/,
  '<sc-for list="{{form.models}}" as="o" hint-placeholder-count="3"><option value="{{o.value}}">{{o.label}}</option></sc-for>')
page = page.replace(/<option value="auto">auto<\/option>\s*<option value="accept edits">accept edits<\/option>\s*<option value="plan">plan first<\/option>\s*<option value="default">ask for everything<\/option>/,
  '<sc-for list="{{form.modes}}" as="o" hint-placeholder-count="4"><option value="{{o.value}}">{{o.label}}</option></sc-for>')
if (/Opus 5\.5<\/option>|develop<\/option>|accept edits<\/option>/.test(page)) throw new Error('mockup changed; form options not replaced')
swap('Create workstream</button>', '{{form.submitLabel}}</button>')

// The workstream header's buttons.
swap(`<button type="button" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">+ Agent here</button>`,
  `<button type="button" onClick="{{wsHead.addAgent}}" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">+ Agent here</button>`)
swap(`<button type="button" style="${btn}">Open in editor</button>`, `<button type="button" onClick="{{wsHead.openEditor}}" style="${btn}">Open in editor</button>`)
swap(`<button type="button" style="${btn}">{{wsHead.prAction}}</button>`, `<button type="button" onClick="{{wsHead.prDo}}" style="${btn}">{{wsHead.prAction}}</button>`)
swap('<button type="button" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Remove worktree</button>',
  '<button type="button" onClick="{{wsHead.remove}}" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Remove worktree</button>')

// Cards show the agent's reason only when it gave one.
swap('<div style="font-size: 13px; color: var(--text2); font-style: italic">“{{n.why}}”</div>',
  '<sc-if value="{{n.hasWhy}}" hint-placeholder-val="{{ true }}"><div style="font-size: 13px; color: var(--text2); font-style: italic">“{{n.why}}”</div></sc-if>')

// Bulk: send and stop; no pause, which Claude Code does not have.
page = page.replace(/\s*<button type="button" onClick="\{\{bulk\.pause\}\}"[^\n]*\n\s*<button type="button" onClick="\{\{bulk\.resume\}\}"[^\n]*/, '')
swap('<button type="button" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Stop</button>\n            <button type="button" onClick="{{bulk.clear}}"',
  '<button type="button" onClick="{{bulk.stop}}" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Stop</button>\n            <button type="button" onClick="{{bulk.clear}}"')

// Nothing running yet.
swap('      <section aria-label="Agents"', `      <sc-if value="{{empty}}" hint-placeholder-val="{{ false }}">
        <div style="padding: 28px; border-radius: 14px; border: 1px dashed var(--edge); color: var(--text2); font-size: 15px; line-height: 1.6">
          <b style="color: var(--text)">No Claude Code sessions are running.</b><br>Start one in any repository and it appears here within seconds, or press <b>+ New agent</b>.
        </div>
      </sc-if>

      <section aria-label="Agents"`)

swap('<span style="color: var(--warn); font-weight: 600">19 min</span>', '<span style="color: var(--warn); font-weight: 600">{{waitedTotal}}</span>')

// Detail: real usage instead of a cap, real buttons.
page = page.replace(/<div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var\(--muted\)">\s*<span style="font-family: 'IBM Plex Mono', monospace">\{\{sel\.cost\}\} of \{\{sel\.cap\}\} cap<\/span>[\s\S]*?pauses at cap<\/span>\s*<\/div>/,
  `<div style="font-size: 12px; color: var(--muted); font-family: 'IBM Plex Mono', monospace">{{sel.usage}}</div>`)
if (page.includes('pauses at cap')) throw new Error('mockup changed; cap block not replaced')
swap(`<button type="button" style="align-self: flex-start; ${btn}">Review full diff</button>`, `<button type="button" onClick="{{sel.openEditor}}" style="align-self: flex-start; ${btn}">Open in editor</button>`)
swap(`<button type="button" style="${btn}">Open on GitHub</button>`, `<a href="{{sel.prUrl}}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; text-decoration: none; ${btn}">Open on GitHub</a>`)
swap('<button type="button" style="{{sel.mergeStyle}}">{{sel.mergeLabel}}</button>', '<button type="button" onClick="{{sel.merge}}" style="{{sel.mergeStyle}}">{{sel.mergeLabel}}</button>')
swap(`<button type="button" style="align-self: flex-start; ${btn}">Ask it to open one</button>`, `<button type="button" onClick="{{sel.askPr}}" style="align-self: flex-start; ${btn}">Ask it to open one</button>`)
swap('<ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px">',
  '<sc-if value="{{sel.hasFeed}}" hint-placeholder-val="{{ true }}"><span></span></sc-if>\n        <ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; max-height: 420px; overflow-y: auto">')

// The send box suggests the session's slash commands.
swap('<label for="say" style="font-size: 12px; color: var(--muted)">Send to {{sel.repo}} · {{sel.name}}</label>',
  '<label for="say" style="font-size: 12px; color: var(--muted)">Send to {{sel.repo}} · {{sel.name}} · type / for its commands</label>\n        <datalist id="say-commands"><sc-for list="{{sel.commands}}" as="c" hint-placeholder-count="0"><option value="{{c.value}}">{{c.label}}</option></sc-for></datalist>')
swap('<input id="say" value="{{draft}}"', '<input id="say" list="say-commands" autocomplete="off" value="{{draft}}"')
page = page.replace(/\s*<button type="button" onClick="\{\{pauseSel\}\}"[^\n]*/, '')
swap(`<button type="button" style="${btn}">Jump to terminal</button>`, `<button type="button" onClick="{{sel.jump}}" style="${btn}">Jump to terminal</button>`)
swap('<button type="button" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Stop</button>\n      </div>\n    </aside>',
  '<button type="button" onClick="{{sel.stop}}" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Stop</button>\n      </div>\n    </aside>')

// Results of actions, as a toast.
swap('  </div>\n</div>\n</x-dc>', `  </div>
  <sc-if value="{{toast.show}}" hint-placeholder-val="{{ false }}">
    <div role="status" style="{{toast.style}}">{{toast.text}}</div>
  </sc-if>
</div>
</x-dc>`)

for (const left of ['{{bulk.pause}}', '{{bulk.resume}}', '{{pauseSel}}', '{{sel.cap}}', 'Search <kbd>']) {
  if (page.includes(left)) throw new Error('left over from the mockup: ' + left)
}
const logic = readFileSync(join(here, 'logic.js'), 'utf8')
page += `<script type="text/x-dc" data-dc-script>\n${logic}</script>\n</body>\n</html>\n`
page = page.replace('<title>Tower Cockpit</title>', '<title>Tower cockpit</title>')
writeFileSync(join(here, 'cockpit.dc.html'), page)
console.log('built cockpit.dc.html', page.length, 'bytes')
