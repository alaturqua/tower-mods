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
  '<sc-if value="{{sel.noFeed}}" hint-placeholder-val="{{ false }}"><p style="margin: 0; color: var(--muted); font-size: 13px">No activity yet. A session reports it once it runs the latest Tower plugin.</p></sc-if>\n        <ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; max-height: 420px; overflow-y: auto">')

// The send box: typing "/" opens a drop-up of the session's slash commands, as Claude
// Code's own prompt does. ↑/↓ move, Enter or Tab take one, Esc closes.
swap('<label for="say" style="font-size: 12px; color: var(--muted)">Send to {{sel.repo}} · {{sel.name}}</label>',
  `<label for="say" style="font-size: 12px; color: var(--muted)">Send to {{sel.repo}} · {{sel.name}} · type / for its commands</label>
        <sc-if value="{{sel.cantSteer}}" hint-placeholder-val="{{ false }}">
          <div role="note" style="padding: 8px 10px; border-radius: 8px; background: var(--warn-bg); border: 1px solid var(--warn-edge); font-size: 13px; color: var(--text2)">This session runs an older Tower plugin, so it can't receive from the cockpit. Restart it (or run <code>/reload-plugins</code> in it) to steer it from here.</div>
        </sc-if>
        <sc-if value="{{sel.hasQueued}}" hint-placeholder-val="{{ false }}">
          <div role="status" style="font-size: 12px; color: var(--warn)">{{sel.queuedNote}}</div>
        </sc-if>`)
swap('<div style="display: flex; gap: 8px">\n          <input id="say" value="{{draft}}"', `<div style="position: relative; display: flex; gap: 8px">
          <sc-if value="{{cmd.open}}" hint-placeholder-val="{{ false }}">
            <div id="say-commands" role="listbox" aria-label="Slash commands" style="position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 5; max-height: 340px; overflow-y: auto; border-radius: 10px; border: 1px solid var(--edge); background: var(--panel); box-shadow: 0 -8px 24px rgba(0,0,0,0.18); padding: 4px">
              <sc-for list="{{cmd.items}}" as="c" hint-placeholder-count="6">
                <button type="button" role="option" aria-selected="{{c.on}}" onClick="{{c.pick}}" style="{{c.style}}">
                  <span style="font-family: 'IBM Plex Mono', monospace; font-weight: 600; white-space: nowrap">{{c.name}}</span>
                  <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px">{{c.description}}</span>
                </button>
              </sc-for>
              <sc-if value="{{cmd.empty}}" hint-placeholder-val="{{ false }}">
                <div style="padding: 10px 12px; font-size: 13px; color: var(--muted)">No command starts with {{cmd.query}}. Enter sends it as typed.</div>
              </sc-if>
              <sc-if value="{{cmd.hasNote}}" hint-placeholder-val="{{ false }}">
                <div style="padding: 8px 12px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line)">{{cmd.note}}</div>
              </sc-if>
            </div>
          </sc-if>
          <input id="say" role="combobox" aria-expanded="{{cmd.expanded}}" aria-controls="say-commands" aria-autocomplete="list" autocomplete="off" onKeyDown="{{cmd.key}}" value="{{draft}}"`)
page = page.replace(/\s*<button type="button" onClick="\{\{pauseSel\}\}"[^\n]*/, '')
swap(`<button type="button" style="${btn}">Jump to terminal</button>`, `<button type="button" onClick="{{sel.jump}}" style="${btn}">Jump to terminal</button>`)
swap('<button type="button" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Stop</button>\n      </div>\n    </aside>',
  '<button type="button" onClick="{{sel.stop}}" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Stop</button>\n      </div>\n    </aside>')

swap('<button type="button" onClick="{{send}}" style="min-height: 44px; padding: 0 16px; border-radius: 8px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">Send</button>',
  '<button type="button" onClick="{{send}}" style="{{sel.sendStyle}}">Send</button>')

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
