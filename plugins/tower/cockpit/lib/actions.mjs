// What the cockpit can do. Every action answers { ok, message } for the screen to show.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TOWER, claude, claudeBin, knownRepos, run } from './collect.mjs'

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
export async function launch({ repo, name, task, model, mode, worktree = true }) {
  if (!repo) return fail('Pick a repository.')
  const branch = slug(name)
  if (worktree && !branch) return fail('Name the workstream.')
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
