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
