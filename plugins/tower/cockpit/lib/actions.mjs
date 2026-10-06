// What the cockpit can do. Every action answers { ok, message } for the screen to show.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { TOWER, claude, claudeBin, knownRepos, run } from './collect.mjs'

const ok = message => ({ ok: true, message })
const fail = message => ({ ok: false, message })

// Prompts, slash commands and answers reach a session through its inbox, which beacon
// in that session checks every second.
async function tell(id, message) {
  if (!/^[\w-]+$/.test(id ?? '')) return fail('No such session.')
  await mkdir(join(TOWER, 'inbox'), { recursive: true })
  await appendFile(join(TOWER, 'inbox', `${id}.jsonl`), JSON.stringify({ v: 1, ...message }) + '\n')
  return null
}

export async function send({ id, text }) {
  const words = String(text ?? '').trim()
  if (!words) return fail('Nothing to send.')
  return (await tell(id, { kind: 'prompt', text: words })) ?? ok(words.startsWith('/') ? `Ran ${words.split(/\s/)[0]}.` : 'Sent.')
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

const JUMP_PS = '$ok = (New-Object -ComObject WScript.Shell).AppActivate($env:TOWER_TITLE); if (-not $ok) { exit 1 }'

export async function jump({ id, kind, name, path }) {
  if (kind === 'bg') {
    const bin = await claudeBin()
    if (process.platform === 'win32') {
      const tab = await run('wt.exe', ['-d', path, bin, 'attach', id])
      if (tab.ok) return ok('Attached in a new terminal tab.')
    }
    return fail(`Run: claude attach ${id}`)
  }
  if (process.platform === 'win32') {
    const out = await new Promise(resolve => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', JUMP_PS], { env: { ...process.env, TOWER_TITLE: name }, windowsHide: true, timeout: 10000 }, err => resolve(!err))
    })
    if (out) return ok('Switched to its window.')
  }
  return fail(`Couldn't find its window; it runs in ${path}.`)
}

export async function merge({ root, number }) {
  if (!number) return fail('No pull request.')
  const out = await run('gh', ['pr', 'merge', String(number), '--squash', '--delete-branch'], { cwd: root, timeout: 60000 })
  return out.ok ? ok(`Merged #${number}.`) : fail(out.stderr.trim().split('\n').pop() || 'Merge failed.')
}

export async function removeWorktree({ root, path }) {
  const out = await run('git', ['-C', root, 'worktree', 'remove', path], { timeout: 30000 })
  return out.ok ? ok('Worktree removed. Its branch is kept.') : fail(out.stderr.trim().split('\n').pop() || 'Could not remove it.')
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
  const repos = await knownRepos()
  if (!repos.some(r => r.root.toLowerCase() === root.toLowerCase())) repos.push({ root, name: root.split(/[\\/]/).pop() })
  await mkdir(TOWER, { recursive: true })
  await writeFile(join(TOWER, 'repos.json'), JSON.stringify(repos, null, 2))
  return ok(`Added ${root}.`)
}
