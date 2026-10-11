// What the cockpit can do. Every action answers { ok, message } for the screen to show.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SETTINGS, TOWER, claude, claudeBin, fetchPrs, knownRepos, run, worktreesOf } from './collect.mjs'

const ok = message => ({ ok: true, message })
const fail = message => ({ ok: false, message })

// Prompts, slash commands and answers reach a session through its inbox, which beacon
// in that session checks every second.
async function tell(id, message) {
  if (!/^[\w-]+$/.test(id ?? '')) return fail('No such session.')
  await mkdir(join(TOWER, 'inbox'), { recursive: true })
  await appendFile(join(TOWER, 'inbox', `${id}.jsonl`), JSON.stringify({ v: 1, ...message, at: new Date().toISOString() }) + '\n')
  return null
}

// Queued, not yet run: the session picks it up within a second or two, and the cockpit
// shows it as waiting until it has.
export async function send({ id, text }) {
  const words = String(text ?? '').trim()
  if (!words) return fail('Nothing to send.')
  return (await tell(id, { kind: 'prompt', text: words })) ?? ok(words.startsWith('/') ? `Queued ${words.split(/\s/)[0]}.` : 'Queued.')
}

export async function answer({ id, pendingId, allow, text }) {
  if (!pendingId) return fail('That request is no longer waiting.')
  const message = allow === undefined ? { kind: 'answer', pendingId, text: String(text ?? '') } : { kind: 'answer', pendingId, allow: Boolean(allow) }
  return (await tell(id, message)) ?? ok(allow === undefined ? 'Answered.' : allow ? 'Allowed.' : 'Denied.')
}

function slug(name) {
  return String(name).trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._/-]/g, '').replace(/^[-/.]+|[-/.]+$/g, '')
}

// A workstream: Claude Code's own worktree (`-w`), on a new branch from the repo's
// current one, with a background agent in it. The tower's marker comes first so beacon
// in the new session sends its questions here.
async function launchOne({ repo, branch, task, model, mode, worktree }) {
  const id = randomUUID()
  await mkdir(join(TOWER, 'launched'), { recursive: true })
  await writeFile(join(TOWER, 'launched', `${id}.json`), JSON.stringify({ repo, branch, task, launchedAt: new Date().toISOString() }))
  const args = ['--bg', '--session-id', id, '--name', branch || repo.split(/[\\/]/).pop()]
  if (worktree) args.push('-w', branch)
  if (model) args.push('--model', model)
  if (mode) args.push('--permission-mode', mode)
  if (task?.trim()) args.push('--', task.trim())
  const started = await claude(args, { cwd: repo, timeout: 60000 })
  if (!started.ok) {
    const why = started.stderr.trim()
    if (/not trusted/i.test(why)) return fail(`Claude Code hasn't been trusted in ${repo} yet. Open Claude Code there once, accept the trust prompt, then launch again.`)
    return fail(`Could not start the agent: ${why.split('\n').pop()}`)
  }
  return { ok: true, message: worktree ? `Started ${branch} in a new worktree.` : 'Started.', id }
}

// `copies` above one is a fan-out: the same task in that many worktrees (name-1, name-2, ...),
// recorded as a group the cockpit shows side by side until one is kept.
export async function launch({ repo, name, task, model, mode, worktree = true, copies = 1 }) {
  if (!repo) return fail('Pick a repository.')
  const branch = slug(name)
  if (worktree && !branch) return fail('Name the workstream.')
  const n = worktree ? Math.max(1, Math.min(4, Math.floor(Number(copies) || 1))) : 1
  if (n === 1) return launchOne({ repo, branch, task, model, mode, worktree })
  if (!task?.trim()) return fail('Give the agents a task to compare them on.')
  const branches = [], ids = []
  // One after another: git takes a lock per worktree it adds.
  for (let i = 1; i <= n; i++) {
    const started = await launchOne({ repo, branch: `${branch}-${i}`, task, model, mode, worktree: true })
    if (!started.ok) {
      if (!ids.length) return started
      break
    }
    branches.push(`${branch}-${i}`)
    ids.push(started.id)
  }
  const group = randomUUID()
  await mkdir(join(TOWER, 'fanouts'), { recursive: true })
  await writeFile(join(TOWER, 'fanouts', `${group}.json`), JSON.stringify({ id: group, name: branch, task: task.trim(), repo, branches, createdAt: new Date().toISOString() }))
  const short = ids.length < n ? ` (${n - ids.length} could not start)` : ''
  return { ok: true, message: `Started ${ids.length} agents on the same task${short}. Compare them above the fleet.`, id: ids[0], ids, group }
}

export async function stop({ id, kind }) {
  if (kind !== 'bg') return fail('Only background sessions stop from here; jump to this one and press Esc or close it.')
  const out = await claude(['stop', id])
  return out.ok ? ok('Stopped.') : fail(out.stderr.trim() || 'Could not stop it.')
}

const APPS = { Code: 'VS Code', 'Code - Insiders': 'VS Code Insiders', WindowsTerminal: 'Windows Terminal', Cursor: 'Cursor' }

// A background session opens in a new terminal tab, attached. A terminal session's window
// is found by process (lib/jump.ps1): window titles name the tab or the editor, not the session.
export async function jump({ id, kind, pid, path }) {
  if (kind === 'bg') {
    const bin = await claudeBin()
    if (process.platform === 'win32') {
      const tab = await run('wt.exe', ['-d', path, bin, 'attach', id])
      if (tab.ok) return ok('Attached in a new terminal tab.')
    }
    return fail(`Run: claude attach ${id}`)
  }
  if (process.platform === 'win32' && pid) {
    const out = await new Promise(resolve => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(dirname(fileURLToPath(import.meta.url)), 'jump.ps1')],
        { env: { ...process.env, TOWER_PID: String(pid) }, windowsHide: true, timeout: 15000 },
        (err, stdout) => resolve({ ok: !err, app: String(stdout).split('\t')[0].trim() }))
    })
    const app = APPS[out.app] ?? out.app
    if (out.ok) return ok(`Brought ${app} forward. The session is in its terminal${app === 'VS Code' ? ' panel' : ' tabs'}.`)
    if (out.app) return fail(`Windows would not bring ${app} forward; switch to it yourself. The session runs in ${path}.`)
  }
  return fail(`Couldn't find its window. It runs in ${path}.`)
}

export async function merge({ root, number }) {
  if (!number) return fail('No pull request.')
  const out = await run('gh', ['pr', 'merge', String(number), '--squash', '--delete-branch'], { cwd: root, timeout: 60000 })
  return out.ok ? ok(`Merged #${number}.`) : fail(out.stderr.trim().split('\n').pop() || 'Merge failed.')
}

const same = (a, b) => String(a ?? '').replace(/[\\/]+$/, '').toLowerCase().replace(/\\/g, '/') === String(b ?? '').replace(/[\\/]+$/, '').toLowerCase().replace(/\\/g, '/')

// Never under a running agent, never the main checkout; uncommitted changes need `force`,
// which the cockpit asks for separately. The branch is kept either way.
export async function removeWorktree({ root, path, force }, { agents = [] } = {}) {
  if (same(root, path)) return fail("That is the repository's main checkout; it stays.")
  const inside = agents.filter(a => same(a.path, path))
  if (inside.length) return fail(`${inside.map(a => a.name).join(', ')} still works in it. Stop ${inside.length === 1 ? 'that agent' : 'those agents'} first.`)
  if (!force) {
    const status = await run('git', ['-C', path, 'status', '--porcelain'], { timeout: 15000 })
    if (status.ok && status.stdout.trim()) {
      return { ok: false, dirty: true, message: `It has uncommitted changes (${status.stdout.trim().split('\n').length} files).` }
    }
  }
  const out = await run('git', ['-C', root, 'worktree', 'remove', ...(force ? ['--force'] : []), path], { timeout: 30000 })
  return out.ok ? ok('Worktree removed. Its branch is kept.') : fail(out.stderr.trim().split('\n').pop() || 'Could not remove it.')
}

// Renames the branch a worktree is on; the worktree's folder keeps its name.
export async function renameBranch({ path, from, to }) {
  const name = slug(to)
  if (!name) return fail('Give the branch a name.')
  const valid = await run('git', ['check-ref-format', '--branch', name])
  if (!valid.ok) return fail(`"${name}" is not a valid branch name.`)
  const out = await run('git', ['-C', path, 'branch', '-m', from, name], { timeout: 15000 })
  return out.ok ? ok(`Renamed ${from} to ${name}.`) : fail(out.stderr.trim().split('\n').pop() || 'Could not rename it.')
}

async function saveRepos(edit) {
  const repos = await knownRepos()
  edit(repos)
  await mkdir(TOWER, { recursive: true })
  await writeFile(join(TOWER, 'repos.json'), JSON.stringify(repos, null, 2))
}

function entry(repos, root) {
  let found = repos.find(r => same(r.root, root))
  if (!found) repos.push(found = { root, name: String(root).split(/[\\/]/).pop() })
  return found
}

// Only the name the cockpit shows; the folder and git are untouched.
export async function renameRepo({ root, name }) {
  const label = String(name ?? '').trim()
  if (!label) return fail('Give it a name.')
  await saveRepos(repos => { entry(repos, root).name = label.slice(0, 60) })
  return ok(`Renamed to ${label}.`)
}

// Hidden until added again, even while sessions run in it; nothing on disk changes.
export async function hideRepo({ root }) {
  await saveRepos(repos => { entry(repos, root).hidden = true })
  return ok('Removed from the cockpit. Nothing on disk changed; add it again any time.')
}

export async function openEditor({ path }) {
  const out = process.platform === 'win32'
    ? await run('cmd.exe', ['/d', '/c', 'code', path])
    : await run('code', [path])
  return out.ok ? ok('Opened in VS Code.') : fail('Could not start VS Code (`code` not on PATH).')
}

export async function addRepo({ path }) {
  const top = await run('git', ['-C', String(path ?? ''), 'rev-parse', '--show-toplevel'])
  if (!top.ok) return fail('Not a git repository.')
  const root = top.stdout.trim()
  await saveRepos(repos => { delete entry(repos, root).hidden })
  return ok(`Added ${root}.`)
}

// The OS's own folder dialog, opened by this server (a web page can't learn a folder's path).
// Each answers the chosen path on stdout; a cancel exits non-zero with nothing printed.
const PICK_TITLE = 'Choose a git repository for Tower'
const PICKERS = {
  win32: [['powershell.exe', ['-NoProfile', '-STA', '-Command',
    // A topmost owner keeps the dialog in front of the browser.
    `[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='${PICK_TITLE}'; $f.UseDescriptionForTitle=$true; $o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true}; if ($f.ShowDialog($o) -eq 'OK') { [Console]::Out.Write($f.SelectedPath) }`]]],
  darwin: [['osascript', ['-e', `POSIX path of (choose folder with prompt "${PICK_TITLE}")`]]],
  linux: [['zenity', ['--file-selection', '--directory', `--title=${PICK_TITLE}`]], ['kdialog', ['--getexistingdirectory', '.', '--title', PICK_TITLE]]],
}
let picking = false

export async function pickRepo(_body, _fleet, { exec = run, platform = process.platform } = {}) {
  if (picking) return fail('A folder dialog is already open. Look for it behind the browser.')
  picking = true
  try {
    for (const [cmd, args] of PICKERS[platform] ?? []) {
      // A person is choosing: give them minutes, not the usual 15 seconds.
      const out = await exec(cmd, args, { timeout: 10 * 60000 })
      if (out.code === 'ENOENT') continue
      const path = out.stdout.trim()
      if (!path) return { ok: true, quiet: true, message: '' }
      return addRepo({ path })
    }
    return { ok: false, unavailable: true, message: 'No folder dialog on this machine. Type the path instead.' }
  } finally {
    picking = false
  }
}

async function readSettings(file) {
  try {
    return { settings: JSON.parse(await readFile(file, 'utf8')) }
  } catch (err) {
    // A missing file is an empty one; an unreadable one is left alone.
    return err.code === 'ENOENT' ? { settings: {} } : { error: `Could not read ${file}, so nothing changed.` }
  }
}

async function writeSettings(file, settings) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(settings, null, 2) + '\n')
}

// Allow once, and write the card's rule into the working folder's local settings, so the
// same command runs without asking next time. The rule comes from the fleet as last read,
// never from the request, so the page can't ask for a broader one.
export async function allowAlways({ id, pendingId }, { agents = [] } = {}) {
  const a = agents.find(x => x.id === id)
  const p = a?.pending
  if (!p || p.id !== pendingId) return fail('That request is no longer waiting.')
  if (!p.rule) return fail('Only a plain, low-risk command can be always allowed from here.')
  const file = join(a.path, '.claude', 'settings.local.json')
  const { settings, error } = await readSettings(file)
  if (error) return fail(error)
  const allow = Array.isArray(settings.permissions?.allow) ? settings.permissions.allow : []
  if (!allow.includes(p.rule)) {
    settings.permissions = { ...settings.permissions, allow: [...allow, p.rule] }
    await writeSettings(file, settings)
  }
  const answered = await answer({ id, pendingId, allow: true })
  return answered.ok ? ok(`Allowed. ${p.rule} now runs without asking in ${a.path.split(/[\\/]/).pop()}.`) : answered
}

// The one Tower option the cockpit changes for you: which sessions send their dialogs here.
// Claude Code reads it when a session starts, so running sessions keep what they had.
export async function remoteAnswers({ value }) {
  if (!['always', 'launched', 'never'].includes(value)) return fail('Unknown choice.')
  const file = SETTINGS()
  const { settings, error } = await readSettings(file)
  if (error) return fail(error)
  const tower = settings.pluginConfigs?.tower ?? {}
  settings.pluginConfigs = { ...settings.pluginConfigs, tower: { ...tower, options: { ...tower.options, remoteAnswers: value } } }
  await writeSettings(file, settings)
  return ok(value === 'always'
    ? 'Done. Sessions you start from now on send their permission prompts and questions here; restart a running one to include it.'
    : `Set to ${value}. Sessions you start from now on follow it.`)
}

// The green pull requests of a repository, merged one at a time, oldest first. Each is
// read again right before its merge, since the one before can make it stale; the queue
// stops at the first that is no longer green or fails to merge.
export async function mergeQueue({ root }, _fleet, deps = {}) {
  if (!root) return fail('No repository.')
  const list = deps.list ?? fetchPrs
  const mergeOne = deps.merge ?? (num => run('gh', ['pr', 'merge', String(num), '--squash', '--delete-branch'], { cwd: root, timeout: 60000 }))
  const ready = prs => Object.values(prs ?? {}).filter(p => p.mergeable).map(p => p.num).sort((a, b) => a - b)
  const wanted = ready(await list(root))
  if (!wanted.length) return fail('No pull request is ready to merge.')
  const merged = []
  for (const num of wanted) {
    if (merged.length && !ready(await list(root)).includes(num)) break
    const out = await mergeOne(num)
    if (!out.ok) {
      const why = out.stderr.trim().split('\n').pop() || 'merge failed'
      return { ok: merged.length > 0, message: `${merged.length ? `Merged ${merged.map(n => `#${n}`).join(', ')}. ` : ''}#${num}: ${why}. Stopped there.` }
    }
    merged.push(num)
  }
  const left = wanted.length - merged.length
  return ok(`Merged ${merged.map(n => `#${n}`).join(', ')} in order.${left ? ` ${left} more stopped being ready after the merges (rebase or rerun checks), so they wait.` : ''}`)
}

// Keep one agent of a fan-out: the others stop and their worktrees go (their branches stay),
// the record goes, and the one kept is asked for a pull request if it has none.
export async function keepFanout({ group, branch }, { agents = [] } = {}) {
  if (!/^[\w-]+$/.test(group ?? '')) return fail('No such comparison.')
  const file = join(TOWER, 'fanouts', `${group}.json`)
  let rec
  try { rec = JSON.parse(await readFile(file, 'utf8')) } catch { return fail('That comparison is gone.') }
  if (!rec.branches.includes(branch)) return fail('That agent is not part of this comparison.')
  const byName = b => agents.find(a => a.name === b && same(a.repoRoot, rec.repo))
  const others = rec.branches.filter(b => b !== branch)
  const inTerminal = others.map(byName).filter(a => a && a.kind !== 'bg')
  if (inTerminal.length) return fail(`${inTerminal.map(a => a.name).join(', ')} runs in a terminal; stop it there first.`)
  for (const b of others) {
    const a = byName(b)
    if (a) await stop({ id: a.id, kind: 'bg' })
  }
  const trees = (await worktreesOf(rec.repo)) ?? []
  const leaf = p => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
  const problems = []
  let removed = 0
  for (const b of others) {
    const path = byName(b)?.path ?? trees.find(w => w.branch === b || w.branch.endsWith(`-${b}`) || leaf(w.path) === b)?.path
    if (!path || same(path, rec.repo)) continue
    const out = await run('git', ['-C', rec.repo, 'worktree', 'remove', '--force', path], { timeout: 30000 })
    if (out.ok) removed++
    else problems.push(`${b}: ${out.stderr.trim().split('\n').pop()}`)
  }
  await rm(file, { force: true })
  const kept = byName(branch)
  if (kept && !kept.pr) await tell(kept.id, { kind: 'prompt', text: 'Push this branch and open a pull request for it with gh pr create.' })
  return ok(`Kept ${branch}. Removed ${removed} other worktree${removed === 1 ? '' : 's'}; their branches are kept.${problems.length ? ` Could not remove ${problems.join('; ')}.` : ''}${kept && !kept.pr ? ' Asked it for a pull request.' : ''}`)
}
