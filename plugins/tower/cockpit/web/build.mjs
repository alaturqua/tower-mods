// Builds the cockpit page from the design mockup: the mockup's markup with its sample
// controls wired to real actions, and logic.js in place of the mockup's sample logic.
//   node build.mjs
// mockup.dc.html (the approved design) stays the one source of the look; rerun this after
// changing it or logic.js. The result is the cockpit's page and the site's live demo.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'mockup.dc.html'), 'utf8')
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
  `<sc-if value="{{addRepoForm.closed}}" hint-placeholder-val="{{ true }}">
          <div style="margin-top: 8px; display: flex; align-items: center; gap: 4px">
            <button type="button" onClick="{{addRepoForm.browse}}" title="Opens your system's folder picker" style="flex: 1; min-height: 40px; padding: 0 10px; border-radius: 8px; border: 1px dashed var(--edge); background: transparent; color: var(--muted); text-align: left">{{addRepoForm.label}}</button>
            <button type="button" onClick="{{addRepoForm.open}}" title="Type or paste the path instead" style="min-height: 40px; padding: 0 8px; border: none; border-radius: 8px; background: transparent; color: var(--muted); font-size: 12px; text-decoration: underline; text-underline-offset: 3px">type a path</button>
          </div>
        </sc-if>
        <sc-if value="{{addRepoForm.isOpen}}" hint-placeholder-val="{{ false }}">
          <form onSubmit="{{addRepoForm.submit}}" style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 8px; border: 1px solid var(--edge); background: var(--panel)">
            <label for="add-repo-path" style="font-size: 12px; color: var(--muted)">Path to a git repository on this machine</label>
            <input id="add-repo-path" value="{{addRepoForm.draft}}" onChange="{{addRepoForm.typed}}" onKeyDown="{{addRepoForm.key}}" autocomplete="off" spellcheck="false" placeholder="e.g. D:/Projects/my-repo" style="min-height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--edge); background: var(--bg); color: var(--text); font-family: 'IBM Plex Mono', monospace; font-size: 12px">
            <span style="display: flex; gap: 6px">
              <button type="submit" style="min-height: 34px; padding: 0 12px; border-radius: 6px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">Add</button>
              <button type="button" onClick="{{addRepoForm.cancel}}" style="min-height: 34px; padding: 0 10px; border-radius: 6px; border: none; background: transparent; color: var(--muted)">Cancel</button>
            </span>
          </form>
        </sc-if>`)

// Each repo and workstream in the rail gets a ⋯ menu: rename, remove, open, new agent.
const MENU = (list, open) => `<sc-if value="{{${open}}}" hint-placeholder-val="{{ false }}">
            <div role="menu" style="margin: 2px 0 6px 30px; display: flex; flex-direction: column; padding: 4px; border-radius: 8px; border: 1px solid var(--edge); background: var(--panel); box-shadow: 0 8px 20px rgba(0,0,0,0.12)">
              <sc-for list="{{${list}}}" as="m" hint-placeholder-count="2">
                <button type="button" role="menuitem" onClick="{{m.run}}" style="{{m.style}}">{{m.label}}</button>
              </sc-for>
            </div>
          </sc-if>`
const DOTS = (open, toggle, label) => `<button type="button" onClick="{{${toggle}}}" aria-haspopup="menu" aria-expanded="{{${open}}}" aria-label="{{${label}}}" style="flex: none; width: 28px; height: 34px; border: none; border-radius: 6px; background: transparent; color: var(--muted); font-size: 16px; line-height: 1">⋯</button>`
swap(`<span style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted)">{{repo.summary}}</span>
            </button>
          </div>`, `<span style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted)">{{repo.summary}}</span>
            </button>
            <sc-if value="{{repo.showWs}}" hint-placeholder-val="{{ true }}">${DOTS('repo.menuExpanded', 'repo.toggleMenu', 'repo.menuLabel')}</sc-if>
          </div>
          ${MENU('repo.menu', 'repo.menuOpen')}`)
swap('<button type="button" onClick="{{w.pick}}" style="{{w.style}}">', '<div style="display: flex; align-items: center; gap: 2px">\n                <button type="button" onClick="{{w.pick}}" style="{{w.style}}">')
swap(`<span style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted)">{{w.count}}</span>
                </button>
              </sc-for>`, `<span style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted)">{{w.count}}</span>
                </button>
                ${DOTS('w.menuExpanded', 'w.toggleMenu', 'w.menuLabel')}
                </div>
                ${MENU('w.menu', 'w.menuOpen')}
              </sc-for>`)

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

// Detail: what the session is (branch, permissions) as quiet tags, what can be changed (model,
// effort) as real fields, then cost and context meters. Each kind looks like what it does.
const badge = "display: inline-flex; align-items: center; min-height: 28px; padding: 0 8px; border-radius: 6px; background: var(--chip); color: var(--text2); font-size: 12px; font-family: 'IBM Plex Mono', monospace; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
const field = "min-height: 32px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--edge); background: var(--control); color: var(--text); font: inherit; font-size: 13px; cursor: pointer"
const track = 'height: 6px; border-radius: 3px; background: var(--line); overflow: hidden'
swap(`<div class="tw-clamp2" title="{{sel.path}} · {{sel.branch}}" style="color: var(--muted); font-size: 12px; font-family: 'IBM Plex Mono', monospace">{{sel.path}} · ⎇ {{sel.branch}} · {{sel.model}} · {{sel.mode}}</div>`,
  `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px">
          <span title="Branch {{sel.branch}}" style="${badge}">⎇ {{sel.branch}}</span>
          <span title="Permission mode; change it in the session itself" style="${badge}">permissions: {{sel.mode}}</span>
          <sc-if value="{{sel.showFolder}}" hint-placeholder-val="{{ false }}"><button type="button" onClick="{{sel.openEditor}}" title="Open {{sel.path}} in your editor" style="${field}; font-size: 12px">{{sel.folder}} ↗</button></sc-if>
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
          <select class="tw-field" aria-label="Model" title="{{sel.steerTitle}}" disabled="{{sel.cantSteer}}" value="" onChange="{{sel.pickModel}}" style="${field}">
            <sc-for list="{{sel.models}}" as="o" hint-placeholder-count="4"><option value="{{o.value}}">{{o.label}}</option></sc-for>
          </select>
          <sc-if value="{{sel.hasEffort}}" hint-placeholder-val="{{ false }}">
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted)">effort
              <select class="tw-field" aria-label="Effort" title="{{sel.steerTitle}}" disabled="{{sel.cantSteer}}" value="{{sel.effortValue}}" onChange="{{sel.pickEffort}}" style="${field}">
                <sc-for list="{{sel.efforts}}" as="o" hint-placeholder-count="5"><option value="{{o.value}}">{{o.label}}</option></sc-for>
              </select>
            </label>
          </sc-if>
        </div>
        <sc-if value="{{sel.cantSteer}}" hint-placeholder-val="{{ false }}">
          <div role="note" style="font-size: 12px; color: var(--muted)">Model and effort can't be switched from here: this session can't receive from the cockpit.</div>
        </sc-if>`)
page = page.replace(/<div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var\(--muted\)">\s*<span style="font-family: 'IBM Plex Mono', monospace">\{\{sel\.cost\}\} of \{\{sel\.cap\}\} cap<\/span>[\s\S]*?pauses at cap<\/span>\s*<\/div>/,
  `<div style="display: grid; grid-template-columns: auto 1fr auto; gap: 6px 10px; align-items: center; font-size: 12px; color: var(--muted)">
          <span>cost</span>
          <sc-if value="{{sel.hasBudget}}" hint-placeholder-val="{{ false }}"><span style="${track}"><span style="{{sel.costBar}}"></span></span></sc-if>
          <sc-if value="{{sel.noBudget}}" hint-placeholder-val="{{ true }}"><span style="font-size: 11px; color: var(--faint)">no budget set</span></sc-if>
          <span style="font-family: 'IBM Plex Mono', monospace; color: var(--text2)">{{sel.costText}}</span>
          <span>context</span>
          <span style="${track}"><span style="{{sel.ctxBar}}"></span></span>
          <span style="font-family: 'IBM Plex Mono', monospace; color: var(--text2)">{{sel.ctx}}%</span>
        </div>
        <sc-if value="{{sel.noBeacon}}" hint-placeholder-val="{{ false }}">
          <div role="note" style="font-size: 12px; color: var(--muted)">No Tower beacon in this session, so it reports less and can't be steered from here.</div>
        </sc-if>`)
if (page.includes('pauses at cap')) throw new Error('mockup changed; cap block not replaced')
swap(`<button type="button" style="align-self: flex-start; ${btn}">Review full diff</button>`, `<button type="button" onClick="{{sel.openEditor}}" style="align-self: flex-start; ${btn}">Open in editor</button>`)
swap(`<button type="button" style="${btn}">Open on GitHub</button>`, `<a href="{{sel.prUrl}}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; text-decoration: none; ${btn}">Open on GitHub</a>`)
swap('<button type="button" style="{{sel.mergeStyle}}">{{sel.mergeLabel}}</button>', '<button type="button" onClick="{{sel.merge}}" style="{{sel.mergeStyle}}">{{sel.mergeLabel}}</button>')
swap(`<button type="button" style="align-self: flex-start; ${btn}">Ask it to open one</button>`, `<button type="button" onClick="{{sel.askPr}}" style="align-self: flex-start; ${btn}">Ask it to open one</button>`)
swap('<ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px">',
  '<sc-if value="{{sel.noFeed}}" hint-placeholder-val="{{ false }}"><p style="margin: 0; color: var(--muted); font-size: 13px">No activity yet. A session reports it once it runs the latest Tower plugin.</p></sc-if>\n        <ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px">')

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
            <div id="say-commands" role="listbox" aria-label="Slash commands" style="position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 5; max-height: min(340px, 50vh); overflow-y: auto; border-radius: 10px; border: 1px solid var(--edge); background: var(--panel); box-shadow: 0 -8px 24px rgba(0,0,0,0.18); padding: 4px">
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
swap('<button type="button" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Stop</button>\n      </div>\n      </div>\n    </aside>',
  '<button type="button" onClick="{{sel.stop}}" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--bad-edge); background: transparent; color: var(--bad-text)">Stop</button>\n      </div>\n      </div>\n    </aside>')

swap('<button type="button" onClick="{{send}}" style="min-height: 44px; padding: 0 16px; border-radius: 8px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">Send</button>',
  '<button type="button" onClick="{{send}}" style="{{sel.sendStyle}}">Send</button>')

// Results of actions, as a toast.
swap('  </div>\n</div>\n</x-dc>', `  </div>
  <sc-if value="{{toast.show}}" hint-placeholder-val="{{ false }}">
    <div role="status" style="{{toast.style}}">{{toast.text}}</div>
  </sc-if>
</div>
</x-dc>`)

// The account's rate-limit windows beside the spend, from whichever session reported last.
swap('{{fleet.cost}} across sessions</span>', `{{fleet.cost}} across sessions</span>
      <sc-for list="{{usage.limits}}" as="u" hint-placeholder-count="2">
        <span title="{{u.title}}" style="{{u.style}}">{{u.text}}</span>
      </sc-for>`)

// Launch: one agent, or the same task in up to four worktrees to compare.
swap(`          <div style="display: flex; flex-direction: column; gap: 6px">
            <label for="ws-task"`, `          <sc-if value="{{form.worktree}}" hint-placeholder-val="{{ true }}">
            <div style="display: flex; flex-direction: column; gap: 6px; max-width: 420px">
              <label for="ws-copies" style="font-size: 12px; color: var(--muted)">Agents</label>
              <select id="ws-copies" onChange="{{form.pickCopies}}" style="${select}">
                <sc-for list="{{form.copies}}" as="o" hint-placeholder-count="4"><option value="{{o.value}}" selected="{{o.selected}}">{{o.label}}</option></sc-for>
              </select>
            </div>
          </sc-if>
          <div style="display: flex; flex-direction: column; gap: 6px">
            <label for="ws-task"`)

// Sessions started by hand keep their dialogs in the terminal; offer once to change that.
swap('      <sc-if value="{{hasNeeds}}"', `      <sc-if value="{{optIn.show}}" hint-placeholder-val="{{ false }}">
        <section aria-label="Answer from here" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 12px; background: var(--info-bg); border: 1px solid var(--info-edge)">
          <span style="flex: 1 1 360px; font-size: 13px; color: var(--text2); line-height: 1.5"><b style="color: var(--text)">Answer sessions you started yourself from here too?</b> Today their prompts stay in their terminal, so you can only jump to them. New sessions will send their permission prompts and questions to the cockpit; running ones after a restart.</span>
          <span style="display: flex; gap: 8px">
            <button type="button" onClick="{{optIn.turnOn}}" style="min-height: 40px; padding: 0 14px; border-radius: 8px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">Turn on</button>
            <button type="button" onClick="{{optIn.later}}" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: none; background: transparent; color: var(--muted)">Not now</button>
          </span>
        </section>
      </sc-if>

      <sc-if value="{{hasNeeds}}"`)

// Green pull requests merged in order, and fan-outs compared side by side.
swap('      <sc-if value="{{empty}}" hint-placeholder-val="{{ false }}">', `      <sc-if value="{{queue.show}}" hint-placeholder-val="{{ false }}">
        <sc-for list="{{queue.items}}" as="q" hint-placeholder-count="1">
          <section aria-label="Merge queue" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 12px; background: var(--ok-tint); border: 1px solid var(--line)">
            <span style="font-size: 13px; color: var(--text)">{{q.text}}</span>
            <button type="button" onClick="{{q.run}}" style="min-height: 40px; padding: 0 14px; border-radius: 8px; border: none; background: var(--ok); color: var(--on-ok); font-weight: 600">Merge all in order</button>
          </section>
        </sc-for>
      </sc-if>

      <sc-if value="{{compare.show}}" hint-placeholder-val="{{ false }}">
        <sc-for list="{{compare.groups}}" as="g" hint-placeholder-count="1">
          <section aria-label="Compare {{g.name}}" style="display: flex; flex-direction: column; gap: 10px">
            <div style="display: flex; flex-direction: column; gap: 2px">
              <h2 style="margin: 0; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--work)">Compare · {{g.name}} · {{g.count}} agents</h2>
              <span class="tw-clamp2" style="font-size: 13px; color: var(--muted)">{{g.task}}</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px">
              <sc-for list="{{g.members}}" as="m" hint-placeholder-count="3">
                <div style="{{m.style}}">
                  <div style="display: flex; align-items: center; gap: 8px; justify-content: space-between">
                    <span style="font-weight: 600; overflow-wrap: anywhere">⎇ {{m.branch}}</span>
                    <span style="{{m.pill}}">{{m.stateLabel}}</span>
                  </div>
                  <span class="tw-clamp2" style="font-size: 13px; color: var(--text2); min-height: 36px">{{m.doing}}</span>
                  <sc-if value="{{m.hasHealth}}" hint-placeholder-val="{{ false }}">
                    <span style="font-size: 12px; font-weight: 600; color: var(--bad)">⚠ {{m.health}}</span>
                  </sc-if>
                  <span style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted)">{{m.changes}} · {{m.cost}} · {{m.pr}}</span>
                  <span style="display: flex; flex-wrap: wrap; gap: 8px">
                    <button type="button" onClick="{{m.keep}}" style="min-height: 40px; padding: 0 12px; border-radius: 8px; border: none; background: var(--work); color: var(--on-work); font-weight: 600">Keep this one</button>
                    <button type="button" onClick="{{m.open}}" style="min-height: 40px; padding: 0 10px; border-radius: 8px; border: none; background: transparent; color: var(--muted)">Open →</button>
                  </span>
                </div>
              </sc-for>
            </div>
          </section>
        </sc-for>
      </sc-if>

      <sc-if value="{{empty}}" hint-placeholder-val="{{ false }}">`)

// A fourth view: what finished, newest first.
swap('<button type="button" aria-pressed="{{views.timelinePressed}}" onClick="{{views.showTimeline}}" style="{{views.timelineStyle}}">Timeline</button>',
  `<button type="button" aria-pressed="{{views.timelinePressed}}" onClick="{{views.showTimeline}}" style="{{views.timelineStyle}}">Timeline</button>
            <button type="button" aria-pressed="{{views.donePressed}}" onClick="{{views.showDone}}" style="{{views.doneStyle}}">Done</button>
            <button type="button" aria-pressed="{{views.dashPressed}}" onClick="{{views.showDash}}" style="{{views.dashStyle}}">Dashboard</button>`)
swap('        </sc-if>\n      </section>\n    </main>', `        </sc-if>

        <sc-if value="{{views.isDone}}" hint-placeholder-val="{{ false }}">
          <div style="border: 1px solid var(--line); border-radius: 12px; background: var(--panel); display: flex; flex-direction: column">
            <sc-if value="{{doneLog.any}}" hint-placeholder-val="{{ true }}">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--line); font-size: 12px; color: var(--muted)">
                <span>{{doneLog.count}} · click one to see what it did</span>
                <button type="button" onClick="{{doneLog.clear}}" style="min-height: 34px; padding: 0 10px; border-radius: 6px; border: none; background: transparent; color: var(--bad-text); font-size: 13px">Clear log</button>
              </div>
            </sc-if>
            <sc-if value="{{doneLog.empty}}" hint-placeholder-val="{{ false }}">
              <p style="margin: 0; padding: 18px 16px; color: var(--muted); font-size: 13px">Nothing has finished since the cockpit started recording. When an agent ends a run, it shows here with what it changed and what it cost.</p>
            </sc-if>
            <ol style="list-style: none; margin: 0; padding: 0">
              <sc-for list="{{doneLog.items}}" as="r" hint-placeholder-count="5">
                <li style="border-bottom: 1px solid var(--line-soft)"><button type="button" onClick="{{r.open}}" style="{{r.rowStyle}}">
                  <span style="display: flex; flex-direction: column; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted)"><span style="color: var(--text2)">{{r.when}}</span><span>{{r.day}}</span></span>
                  <span style="min-width: 0; display: flex; flex-direction: column; gap: 3px">
                    <span style="font-weight: 600; overflow-wrap: anywhere">{{r.repo}} <span style="color: var(--muted); font-weight: 400">· {{r.name}} · ⎇ {{r.branch}}</span></span>
                    <span class="tw-clamp2" style="font-size: 13px; color: var(--text2)">{{r.summary}}</span>
                    <sc-if value="{{r.hasPr}}" hint-placeholder-val="{{ false }}"><span style="font-size: 12px; color: var(--ok)">{{r.pr}}</span></sc-if>
                  </span>
                  <span style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted); white-space: nowrap"><span>{{r.changes}}</span><span>{{r.took}} · {{r.cost}}</span></span>
                </button></li>
              </sc-for>
            </ol>
          </div>
        </sc-if>
      </section>
    </main>`)

// Subagents: a badge on rows and cards while any run, and a tab in the panel to see each.
const subBadge = '<sc-if value="{{a.hasSubsRunning}}" hint-placeholder-val="{{ false }}"><span style="font-size: 12px; color: var(--work); font-weight: 600">{{a.subsRunning}}</span></sc-if>'
swap('<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text2)">{{a.doing}}</span>',
  '<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text2)">{{a.doing}}</span>\n                      ' + subBadge)
swap('<div style="color: var(--text2); font-size: 13px; min-height: 36px; overflow-wrap: anywhere">{{a.doing}}</div>',
  '<div style="color: var(--text2); font-size: 13px; min-height: 36px; overflow-wrap: anywhere">{{a.doing}}</div>\n                ' + subBadge)
swap('      <sc-if value="{{tabIs.pr}}" hint-placeholder-val="{{ false }}">', `      <sc-if value="{{tabIs.subagents}}" hint-placeholder-val="{{ false }}">
        <sc-if value="{{sel.noSubagents}}" hint-placeholder-val="{{ false }}">
          <p style="margin: 0; color: var(--muted); font-size: 13px">No subagents in this session yet. One shows here as soon as it starts; sessions on an older Tower plugin don't report them.</p>
        </sc-if>
        <ul aria-label="Subagents" style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px">
          <sc-for list="{{sel.subagents}}" as="s" hint-placeholder-count="3">
            <li style="{{s.style}}">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
                <span style="{{s.pill}}">{{s.statusLabel}}</span>
                <span style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted)">{{s.type}}</span>
                <span style="margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted)">{{s.tools}}</span>
              </div>
              <div style="font-size: 13px; font-weight: 600; overflow-wrap: anywhere">{{s.description}}</div>
              <sc-if value="{{s.hasDoing}}" hint-placeholder-val="{{ false }}"><div style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--text2); overflow-wrap: anywhere">{{s.doing}}</div></sc-if>
            </li>
          </sc-for>
        </ul>
      </sc-if>

      <sc-if value="{{tabIs.pr}}" hint-placeholder-val="{{ false }}">`)

// Each row and card gets a ⋯. Its dropdown is drawn once, at the page's top level and fixed
// beside the button (floatMenu in logic.js), so the table's scroll box never clips it.
swap('  <sc-if value="{{toast.show}}"', `  <sc-if value="{{floatMenu.open}}" hint-placeholder-val="{{ false }}">
    <button type="button" tabindex="-1" aria-label="Close the menu" onClick="{{floatMenu.close}}" style="position: fixed; inset: 0; z-index: 20; border: none; background: transparent; cursor: default"></button>
    <div id="agent-menu" role="menu" aria-label="{{floatMenu.label}}" style="{{floatMenu.style}}">
      <sc-for list="{{floatMenu.items}}" as="m" hint-placeholder-count="5">
        <sc-if value="{{m.isSep}}" hint-placeholder-val="{{ false }}"><div role="separator" style="height: 1px; margin: 4px 6px; background: var(--line)"></div></sc-if>
        <sc-if value="{{m.isItem}}" hint-placeholder-val="{{ true }}">
          <button type="button" role="menuitem" aria-disabled="{{m.off}}" onClick="{{m.run}}" style="{{m.style}}"><span>{{m.label}}</span><sc-if value="{{m.hasReason}}" hint-placeholder-val="{{ false }}"><span style="font-size: 11px; color: var(--muted)">{{m.reason}}</span></sc-if></button>
        </sc-if>
      </sc-for>
    </div>
  </sc-if>
  <sc-if value="{{toast.show}}"`)
swap('<div style="display: grid; grid-template-columns: 40px 1fr; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600">',
  '<div style="display: grid; grid-template-columns: 40px 1fr 40px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600">')
swap('<span>Cost</span>\n                </div>\n              </div>', '<span>Cost</span>\n                </div>\n                <span></span>\n              </div>')
swap('                  </button>\n                </div>\n              </sc-for>',
  // Pinned to the right edge: with both side panels open the table scrolls, and its actions must stay in reach.
  `                  </button>\n                  <span style="position: sticky; right: 0; align-self: stretch; display: flex; align-items: center; justify-content: center; background: var(--panel); box-shadow: -8px 0 8px -8px rgba(0,0,0,0.35)">${DOTS('a.menuExpanded', 'a.toggleMenu', 'a.menuLabel')}</span>\n                </div>\n              </sc-for>`)
swap('<span style="{{a.pill}}">{{a.stateLabel}}</span>\n                </div>',
  `<span style="{{a.pill}}">{{a.stateLabel}}</span>\n                  ${DOTS('a.menuExpanded', 'a.toggleMenu', 'a.menuLabel')}\n                </div>`)
swap('<span style="color: var(--text2)">{{a.cost}}</span>\n                </div>',
  `<span style="color: var(--text2)">{{a.cost}}</span>\n                </div>`)

// The dashboard view: one line of facts, then where the money went and who is running out of room.
const card = 'border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0'
const cardH = 'margin: 0; font-size: 17px; font-weight: 600; color: var(--text)'
const mono = "font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums"
swap('        </sc-if>\n      </section>\n    </main>', `        </sc-if>

        <sc-if value="{{views.isDash}}" hint-placeholder-val="{{ false }}">
          <div style="display: flex; flex-direction: column; gap: 14px">
            <div class="tw-tiles" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px">
              <sc-for list="{{dash.tiles}}" as="t" hint-placeholder-count="4">
                <div style="${card}; gap: 6px; justify-content: space-between">
                  <span style="font-size: 12px; color: var(--muted)">{{t.label}}</span>
                  <span style="{{t.style}}">{{t.value}}</span>
                </div>
              </sc-for>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px">
              <section aria-label="Spend per day" style="${card}">
                <h2 style="${cardH}">Spend per day</h2>
                <sc-if value="{{dash.noDays}}" hint-placeholder-val="{{ false }}"><p style="margin: 0; font-size: 13px; color: var(--muted)">No finished runs in the last 14 days yet. Each run adds its cost here when it ends.</p></sc-if>
                <sc-if value="{{dash.hasDays}}" hint-placeholder-val="{{ true }}">
                  <div role="img" aria-label="{{dash.daySummary}}" style="display: grid; grid-template-columns: auto 1fr; gap: 8px">
                    <div aria-hidden="true" style="display: flex; flex-direction: column; justify-content: space-between; ${mono}; font-size: 11px; color: var(--muted); padding-bottom: 20px"><span>{{dash.maxDay}}</span><span>$0</span></div>
                    <div aria-hidden="true" style="display: flex; flex-direction: column; gap: 4px; min-width: 0">
                      <div style="height: 150px; display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid var(--line)">
                        <sc-for list="{{dash.days}}" as="d" hint-placeholder-count="14">
                          <span title="{{d.title}}" style="flex: 1; height: 100%; display: flex; align-items: flex-end"><span style="{{d.style}}"></span></span>
                        </sc-for>
                      </div>
                      <div style="display: flex; gap: 2px; ${mono}; font-size: 11px; color: var(--muted)">
                        <sc-for list="{{dash.days}}" as="d" hint-placeholder-count="14"><span style="flex: 1; text-align: center; white-space: nowrap">{{d.tick}}</span></sc-for>
                      </div>
                    </div>
                  </div>
                  <!-- A list, not a table: the HTML parser hoists template tags out of a table, which drew this a second time. -->
                  <ul class="tw-sr" aria-label="Spend per day, as a list">
                    <sc-for list="{{dash.days}}" as="d" hint-placeholder-count="14"><li>{{d.title}}</li></sc-for>
                  </ul>
                </sc-if>
              </section>
              <section aria-label="Spend by repository" style="${card}">
                <h2 style="${cardH}">Spend by repository</h2>
                <sc-if value="{{dash.noDays}}" hint-placeholder-val="{{ false }}"><p style="margin: 0; font-size: 13px; color: var(--muted)">Repositories show here once their agents finish runs.</p></sc-if>
                <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px">
                  <sc-for list="{{dash.repos}}" as="r" hint-placeholder-count="4">
                    <li title="{{r.title}}" style="display: grid; grid-template-columns: minmax(80px, 140px) 1fr auto; gap: 10px; align-items: center; font-size: 13px">
                      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{r.repo}}</span>
                      <span aria-hidden="true" style="height: 12px; display: block"><span style="{{r.style}}"></span></span>
                      <span style="${mono}; font-size: 12px; color: var(--text2); white-space: nowrap">{{r.value}}</span>
                    </li>
                  </sc-for>
                </ul>
              </section>
              <section aria-label="Most expensive runs" style="${card}">
                <h2 style="${cardH}">Most expensive runs</h2>
                <sc-if value="{{dash.noDays}}" hint-placeholder-val="{{ false }}"><p style="margin: 0; font-size: 13px; color: var(--muted)">The costliest finished runs of the last 14 days show here, so a runaway one is easy to spot.</p></sc-if>
                <ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column">
                  <sc-for list="{{dash.top}}" as="t" hint-placeholder-count="5">
                    <li><button type="button" onClick="{{t.open}}" aria-disabled="{{t.noOpen}}" title="{{t.title}}" style="display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: baseline; width: 100%; min-height: 36px; padding: 6px 0; border: none; border-bottom: 1px solid var(--line-soft); background: transparent; color: var(--text); text-align: left; font: inherit; font-size: 13px; cursor: pointer">
                      <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{t.name}} <span style="color: var(--muted)">· {{t.when}}</span></span>
                      <span style="${mono}; font-size: 12px; color: var(--muted)">{{t.took}}</span>
                      <span style="${mono}; font-size: 13px; font-weight: 600">{{t.cost}}</span>
                    </button></li>
                  </sc-for>
                </ol>
              </section>
              <section aria-label="Fullest context windows" style="${card}">
                <h2 style="${cardH}">Fullest context windows</h2>
                <sc-if value="{{dash.noContexts}}" hint-placeholder-val="{{ false }}"><p style="margin: 0; font-size: 13px; color: var(--muted)">No sessions running.</p></sc-if>
                <sc-for list="{{dash.contexts}}" as="c" hint-placeholder-count="5">
                  <button type="button" onClick="{{c.open}}" title="{{c.title}}" style="display: grid; grid-template-columns: minmax(100px, 1.2fr) 2fr 40px; gap: 10px; align-items: center; min-height: 30px; padding: 0; border: none; background: transparent; color: var(--text); text-align: left; font: inherit; font-size: 13px; cursor: pointer">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{c.name}}</span>
                    <span aria-hidden="true" style="height: 6px; border-radius: 3px; background: var(--line); overflow: hidden"><span style="{{c.bar}}"></span></span>
                    <span style="${mono}; font-size: 12px; color: var(--text2); text-align: right">{{c.pct}}</span>
                  </button>
                </sc-for>
              </section>
            </div>
          </div>
        </sc-if>
      </section>
    </main>`)

// On a phone the view switcher scrolls sideways instead of cutting off its last view.
swap('<div role="group" aria-label="View" style="display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--control); border: 1px solid var(--line)">',
  '<div role="group" aria-label="View" style="display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--control); border: 1px solid var(--line); max-width: 100%; overflow-x: auto">')
// The timeline fits its card: the name column gives way before the lanes overflow.
swap('<div style="min-width: 720px; display: flex; flex-direction: column; gap: 8px">', '<div style="min-width: 460px; display: flex; flex-direction: column; gap: 8px">')
swap('display: grid; grid-template-columns: 200px 1fr; gap: 12px; color: var(--muted)', 'display: grid; grid-template-columns: minmax(120px, 200px) minmax(0, 1fr); gap: 12px; color: var(--muted)')

// A whole timeline lane, name and bar, opens that agent.
swap('<div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px; align-items: center">',
  '<button type="button" onClick="{{l.pick}}" title="Open {{l.repo}} · {{l.name}}" style="{{l.rowStyle}}">')
swap('                    </sc-for>\n                  </span>\n                </div>\n              </sc-for>', '                    </sc-for>\n                  </span>\n                </button>\n              </sc-for>')

// A finished run whose session has ended, opened from the Done view: read-only.
const h3 = 'margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--text)'
swap('    </aside>\n    </sc-if>\n  </div>', `    </aside>
    </sc-if>
    <sc-if value="{{run.show}}" hint-placeholder-val="{{ false }}">
    <aside class="tw-aside" aria-label="Finished run" style="flex: 0 0 {{panels.detailWidth}}px; max-width: 100%; min-width: 0; border-left: 1px solid var(--line); background: var(--panel2); display: flex; flex-direction: column; overflow: hidden">
      <div class="tw-scroll" style="flex: 1 1 auto; min-height: 0; padding: 20px; display: flex; flex-direction: column; gap: 14px">
        <div style="display: flex; justify-content: flex-end; margin: -8px -8px -6px 0">
          <button type="button" onClick="{{run.close}}" aria-label="Close the finished run" style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--edge); background: var(--control); color: var(--text)">×</button>
        </div>
        <div role="note" style="padding: 8px 10px; border-radius: 8px; background: var(--ok-tint); color: var(--text2); font-size: 13px">{{run.ended}}</div>
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
          <h2 style="margin: 0; font-size: 18px; font-weight: 600">{{run.repo}} <span style="color: var(--muted); font-weight: 400">· {{run.name}}</span></h2>
          <span style="padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--ok-tint); color: var(--ok)">done</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px">
          <sc-if value="{{run.hasPath}}" hint-placeholder-val="{{ false }}"><button type="button" onClick="{{run.openEditor}}" title="Open {{run.path}} in your editor" style="${badge}; cursor: pointer">{{run.folder}}</button></sc-if>
          <span style="${badge}">⎇ {{run.branch}}</span>
          <sc-if value="{{run.hasModel}}" hint-placeholder-val="{{ false }}"><span style="${badge}">{{run.model}}</span></sc-if>
        </div>
        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--text2)">{{run.took}} · {{run.cost}} · {{run.changes}}</div>
        <h3 style="${h3}">Its last message</h3>
        <div style="font-size: 13px; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5">{{run.answer}}</div>
        <sc-if value="{{run.hasFiles}}" hint-placeholder-val="{{ false }}">
          <h3 style="${h3}">Files</h3>
          <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 12px">
            <sc-for list="{{run.files}}" as="f" hint-placeholder-count="3">
              <li style="display: flex; gap: 8px; justify-content: space-between"><span style="min-width: 0; overflow-wrap: anywhere">{{f.path}}</span><span style="white-space: nowrap"><span style="color: var(--ok)">+{{f.add}}</span> <span style="color: var(--bad)">−{{f.del}}</span></span></li>
            </sc-for>
          </ul>
        </sc-if>
        <sc-if value="{{run.hasPr}}" hint-placeholder-val="{{ false }}">
          <h3 style="${h3}">Pull request</h3>
          <sc-if value="{{run.hasPrUrl}}" hint-placeholder-val="{{ false }}"><a href="{{run.prUrl}}" target="_blank" rel="noopener" style="font-size: 13px; color: var(--work)">{{run.prTitle}}</a></sc-if>
          <sc-if value="{{run.noPrUrl}}" hint-placeholder-val="{{ false }}"><span style="font-size: 13px">{{run.prTitle}}</span></sc-if>
        </sc-if>
      </div>
    </aside>
    </sc-if>
  </div>`)

// The brand is the page's one h1, for screen readers and their heading list.
swap('<span style="font-weight: 700; font-size: 17px; letter-spacing: 0.02em">Tower</span>', '<h1 style="margin: 0; font-weight: 700; font-size: 17px; letter-spacing: 0.02em">Tower</h1>')
// Placeholders in the theme's muted ink: the browser's default gray fails contrast on both themes.
page = page.replace('</style>', '.tc ::placeholder{color:var(--muted);opacity:1}\n.tw-field:disabled{opacity:.5;cursor:not-allowed}\n@media (max-width: 900px){.tw-tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important}}\n.tw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}\n</style>')

// Triage (the opt-in, Needs you, the merge queue, Compare) belongs to the Table and Cards views.
// Timeline, Done and Dashboard replace it, so a view never opens below a screen of cards.
swap('      <sc-if value="{{optIn.show}}"', '      <sc-if value="{{views.isTriage}}" hint-placeholder-val="{{ true }}">\n      <sc-if value="{{optIn.show}}"')
swap('      <sc-if value="{{empty}}" hint-placeholder-val="{{ false }}">', '      </sc-if>\n      <sc-if value="{{empty}}" hint-placeholder-val="{{ false }}">')
// The header's "need you" count takes you back to the waiting agents from any view.
swap('<span style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: var(--warn-tint); color: var(--warn); font-size: 13px; font-weight: 600"><span style="width: 8px; height: 8px; border-radius: 50%; background: var(--warn)"></span>{{fleet.needs}} need you</span>',
  '<button type="button" onClick="{{views.showNeeds}}" title="Show the agents waiting for you" style="display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 5px 10px; border-radius: 999px; border: none; background: var(--warn-tint); color: var(--warn); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer"><span style="width: 8px; height: 8px; border-radius: 50%; background: var(--warn)"></span>{{fleet.needs}} need you</button>')

for (const left of ['{{bulk.pause}}', '{{bulk.resume}}', '{{pauseSel}}', '{{sel.cap}}', 'Search <kbd>']) {
  if (page.includes(left)) throw new Error('left over from the mockup: ' + left)
}
const logic = readFileSync(join(here, 'logic.js'), 'utf8')
page += `<script type="text/x-dc" data-dc-script>\n${logic}</script>\n</body>\n</html>\n`
page = page.replace('<title>Tower Cockpit</title>', '<title>Tower cockpit</title>')
writeFileSync(join(here, 'cockpit.dc.html'), page)
writeFileSync(join(here, '..', '..', '..', '..', 'site', 'demo', 'cockpit.dc.html'), page)
console.log('built cockpit.dc.html', page.length, 'bytes')
