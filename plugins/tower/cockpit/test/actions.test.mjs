import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

// A throwaway TOWER_HOME and git repository with one worktree.
const home = mkdtempSync(join(tmpdir(), 'tower-actions-'))
process.env.TOWER_HOME = join(home, 'tower')
const repo = join(home, 'repo')
const tree = join(home, 'repo-wt')
const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'pipe' }).toString()
let actions

before(async () => {
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  writeFileSync(join(repo, 'README.md'), '# test\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  git('worktree', 'add', '-q', '-b', 'feat-x', tree)
  actions = await import('../lib/actions.mjs')
})

after(() => rmSync(home, { recursive: true, force: true }))

test('the main checkout is never removed', async () => {
  const res = await actions.removeWorktree({ root: repo, path: repo })
  assert.equal(res.ok, false)
  assert.match(res.message, /main checkout/)
})

test('a worktree an agent works in is refused', async () => {
  const res = await actions.removeWorktree({ root: repo, path: tree }, { agents: [{ name: 'api-1a', path: tree }] })
  assert.equal(res.ok, false)
  assert.match(res.message, /api-1a still works in it/)
})

test('renaming the branch checks the name, then renames it', async () => {
  assert.equal((await actions.renameBranch({ path: tree, from: 'feat-x', to: 'bad..name' })).ok, false)
  const res = await actions.renameBranch({ path: tree, from: 'feat-x', to: 'feat-y' })
  assert.equal(res.ok, true)
  assert.match(git('branch', '--list', 'feat-y'), /feat-y/)
})

test('uncommitted changes refuse a removal until it is forced; the branch stays', async () => {
  writeFileSync(join(tree, 'draft.txt'), 'work in progress\n')
  const refused = await actions.removeWorktree({ root: repo, path: tree })
  assert.equal(refused.ok, false)
  assert.equal(refused.dirty, true)
  assert.ok(existsSync(tree))
  const forced = await actions.removeWorktree({ root: repo, path: tree, force: true })
  assert.equal(forced.ok, true)
  assert.ok(!existsSync(tree))
  assert.match(git('branch', '--list', 'feat-y'), /feat-y/)
})

test('a repo is renamed and removed from the cockpit only in repos.json, and adding brings it back', async () => {
  await actions.renameRepo({ root: repo, name: 'Payments API' })
  await actions.hideRepo({ root: repo })
  let saved = JSON.parse(readFileSync(join(process.env.TOWER_HOME, 'repos.json'), 'utf8'))
  assert.deepEqual(saved.map(r => [r.name, r.hidden]), [['Payments API', true]])
  assert.ok(existsSync(join(repo, 'README.md')))
  await actions.addRepo({ path: repo })
  saved = JSON.parse(readFileSync(join(process.env.TOWER_HOME, 'repos.json'), 'utf8'))
  assert.equal(saved.length, 1)
  assert.equal(saved[0].hidden, undefined)
})

test('Always allow writes the card\'s exact rule once, from the fleet, and allows', async () => {
  const pending = { id: 'p-1', kind: 'permission', rule: 'Bash(npm test)' }
  const fleet = { agents: [{ id: 's-allow', path: repo, pending }] }
  const file = join(repo, '.claude', 'settings.local.json')
  writeFileSync(join(repo, '.gitignore'), '.claude/\n')
  const res = await actions.allowAlways({ id: 's-allow', pendingId: 'p-1', rule: 'Bash(*)' }, fleet)
  assert.equal(res.ok, true, res.message)
  await actions.allowAlways({ id: 's-allow', pendingId: 'p-1' }, fleet)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).permissions.allow, ['Bash(npm test)'])
  const inbox = readFileSync(join(process.env.TOWER_HOME, 'inbox', 's-allow.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.equal(inbox[0].allow, true)
  assert.equal((await actions.allowAlways({ id: 's-allow', pendingId: 'p-old' }, fleet)).ok, false)
  assert.equal((await actions.allowAlways({ id: 's-allow', pendingId: 'p-1' }, { agents: [{ id: 's-allow', path: repo, pending: { ...pending, rule: null } }] })).ok, false)
})

test('Always allow leaves an unreadable settings file alone', async () => {
  const bad = mkdtempSync(join(home, 'bad-'))
  execFileSync('git', ['init', '-q', bad])
  const file = join(bad, '.claude', 'settings.local.json')
  execFileSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(join(bad, '.claude'))});require('fs').writeFileSync(${JSON.stringify(file)}, '{ nope')`])
  const res = await actions.allowAlways({ id: 's-bad', pendingId: 'p' }, { agents: [{ id: 's-bad', path: bad, pending: { id: 'p', rule: 'Bash(ls)' } }] })
  assert.equal(res.ok, false)
  assert.equal(readFileSync(file, 'utf8'), '{ nope')
})

test('the remote-answers choice is written under pluginConfigs, keeping the rest of settings', async () => {
  const file = join(home, 'settings.json')
  process.env.TOWER_SETTINGS = file
  writeFileSync(file, JSON.stringify({ theme: 'dark', pluginConfigs: { tower: { options: { pollSeconds: 5 } }, other: { x: 1 } } }))
  assert.equal((await actions.remoteAnswers({ value: 'always' })).ok, true)
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.theme, 'dark')
  assert.deepEqual(saved.pluginConfigs.tower.options, { pollSeconds: 5, remoteAnswers: 'always' })
  assert.deepEqual(saved.pluginConfigs.other, { x: 1 })
  assert.equal((await actions.remoteAnswers({ value: 'everything' })).ok, false)
})

test('the merge queue merges green PRs oldest first and stops at the first that fails', async () => {
  const merged = []
  let prs = { a: { num: 7, mergeable: true }, b: { num: 3, mergeable: true }, c: { num: 5, mergeable: false } }
  const list = async () => prs
  const merge = async num => { merged.push(num); prs = Object.fromEntries(Object.entries(prs).filter(([, p]) => p.num !== num)); return { ok: true, stderr: '' } }
  const res = await actions.mergeQueue({ root: repo }, {}, { list, merge })
  assert.deepEqual(merged, [3, 7])
  assert.match(res.message, /#3, #7 in order/)

  prs = { a: { num: 1, mergeable: true }, b: { num: 2, mergeable: true } }
  const failing = await actions.mergeQueue({ root: repo }, {}, { list, merge: async num => num === 2 ? { ok: false, stderr: 'conflict' } : merge(num) })
  assert.equal(failing.ok, true)
  assert.match(failing.message, /Merged #1\. #2: conflict\. Stopped there\./)

  // a PR made stale by the merge before it waits
  prs = { a: { num: 1, mergeable: true }, b: { num: 2, mergeable: true } }
  const stale = await actions.mergeQueue({ root: repo }, {}, { list, merge: async num => { await merge(num); prs = { b: { num: 2, mergeable: false } }; return { ok: true } } })
  assert.match(stale.message, /Merged #1 in order\. 1 more/)
  assert.equal((await actions.mergeQueue({ root: repo }, {}, { list: async () => ({}) })).ok, false)
})

test('keeping one agent of a fan-out removes the other worktrees and the record, and keeps branches', async () => {
  const other = join(home, 'try-2')
  git('worktree', 'add', '-q', '-b', 'try-2', other)
  const dir = join(process.env.TOWER_HOME, 'fanouts')
  execFileSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(dir)}, { recursive: true })`])
  writeFileSync(join(dir, 'g1.json'), JSON.stringify({ id: 'g1', name: 'try', task: 't', repo, branches: ['try-1', 'try-2'] }))
  assert.equal((await actions.keepFanout({ group: 'g1', branch: 'nope' })).ok, false)
  const res = await actions.keepFanout({ group: 'g1', branch: 'try-1' }, { agents: [] })
  assert.equal(res.ok, true, res.message)
  assert.match(res.message, /Removed 1 other worktree/)
  assert.equal(existsSync(other), false)
  assert.equal(existsSync(join(dir, 'g1.json')), false)
  assert.match(git('branch', '--list', 'try-2'), /try-2/)
  assert.equal((await actions.keepFanout({ group: '../x', branch: 'a' })).ok, false)
})

test('a fan-out needs a task, and a single launch still needs a name', async () => {
  assert.equal((await actions.launch({ repo, name: 'x', copies: 3, task: ' ' })).message, 'Give the agents a task to compare them on.')
  assert.equal((await actions.launch({ repo, name: ' ', copies: 3 })).message, 'Name the workstream.')
})
