import assert from 'node:assert/strict'
import { test } from 'node:test'

import { feedOf, healthOf, laneOf, modelName, pendingOf, reposOf, riskOf, stateOf, toAgent, totalsOf } from '../lib/model.mjs'

const NOW = Date.parse('2026-10-06T14:00:00Z')
const row = (over = {}) => ({ sessionId: 's1', cwd: 'D:\\Projects\\api', kind: 'interactive', name: 'api-1a', status: 'idle', startedAt: NOW - 3600000, ...over })

test('risk badges name what a command can do', () => {
  assert.equal(riskOf('git push origin main'), 'Pushes to remote')
  assert.equal(riskOf('git push --force origin main'), 'Force-pushes')
  assert.equal(riskOf('rm -rf build'), 'Deletes recursively')
  assert.equal(riskOf('terraform apply -auto-approve'), 'Changes infrastructure')
  assert.equal(riskOf('npm test'), null)
})

test('states: beacon wins, an interrupted turn reads idle, no beacon means busy or idle', () => {
  assert.equal(stateOf(row(), { state: 'needs-input' }), 'needs')
  assert.equal(stateOf(row({ status: 'idle' }), { state: 'working' }), 'idle')
  assert.equal(stateOf(row({ status: 'busy' }), { state: 'done' }), 'working')
  assert.equal(stateOf(row({ status: 'busy' }), null), 'working')
  assert.equal(stateOf(row(), { state: 'ended' }), 'idle')
})

test('health: looping from beacon, stuck when busy and silent, a nearly full context', () => {
  assert.equal(healthOf(row(), { health: 'Looping: x failed 3× in a row' }, NOW), 'Looping: x failed 3× in a row')
  assert.equal(healthOf(row({ status: 'busy' }), { updatedAt: new Date(NOW - 12 * 60000).toISOString() }, NOW), 'Stuck: no activity for 12 min')
  assert.equal(healthOf(row(), { contextPercent: 87 }, NOW), 'Context 87%: compaction soon')
  assert.equal(healthOf(row({ status: 'busy' }), { updatedAt: new Date(NOW - 60000).toISOString() }, NOW), null)
})

test('a pending edit becomes an edit card with its diff and risk; a hand-started wait stays local', () => {
  const edit = pendingOf({ pending: { id: 'p-1', kind: 'permission', title: 'Edit', detail: 'src/a.ts', diff: [['+ x', 'add']] } }, 'needs')
  assert.equal(edit.kind, 'edit')
  assert.equal(edit.remote, true)
  const push = pendingOf({ pending: { id: 'p-2', kind: 'permission', title: 'Bash', detail: 'git push origin main' } }, 'needs')
  assert.equal(push.risk, 'Pushes to remote')
  const local = pendingOf({ state: 'needs-input', message: 'Claude needs your permission to use Bash' }, 'needs')
  assert.equal(local.kind, 'local')
  assert.equal(local.remote, false)
})

test('an agent carries git, PR, feed and the minutes it has waited', () => {
  const a = toAgent({
    row: row({ status: 'idle' }),
    status: { state: 'needs-input', model: 'claude-opus-5-5', mode: 'acceptEdits', contextPercent: 40, costUsd: 1.2,
      pending: { id: 'p-1', kind: 'question', title: 'Which env?', options: ['staging', 'prod'], since: new Date(NOW - 6 * 60000).toISOString() },
      activity: [{ t: '2026-10-06T13:58:00Z', kind: 'fail', text: 'Bash npm test' }], updatedAt: new Date(NOW).toISOString() },
    git: { repoName: 'api', repoRoot: 'D:\\Projects\\api', branch: 'feat/x', base: 'main', add: 10, del: 2, files: [{ path: 'a.ts', add: 10, del: 2 }] },
    pr: { num: 7 }, lane: [], now: NOW,
  })
  assert.equal(a.state, 'needs')
  assert.equal(a.waited, 6)
  assert.equal(a.model, 'Opus 5.5')
  assert.equal(a.mode, 'accept edits')
  assert.equal(a.doing, 'Asks: Which env?')
  assert.deepEqual(a.fileList, [['a.ts', 10, 2]])
  assert.equal(a.feed[0][1], 'wait')
  assert.match(a.feed[0][2], /^Failed: /)
})

test('only a session whose beacon reads the inbox can be steered, and unread messages count as queued', () => {
  const now = NOW
  const old = toAgent({ row: row(), status: { state: 'idle' }, git: null, pr: null, inbox: 1, now })
  assert.equal(old.canSteer, false)
  const fresh = toAgent({ row: row(), status: { state: 'idle', canReceive: true, inboxSeen: 2 }, git: null, pr: null, inbox: 3, now })
  assert.equal(fresh.canSteer, true)
  assert.equal(fresh.queued, 1)
  const caughtUp = toAgent({ row: row(), status: { state: 'idle', canReceive: true, inboxSeen: 3 }, git: null, pr: null, inbox: 3, now })
  assert.equal(caughtUp.queued, 0)
})

test('lanes merge equal neighbours and clip to the last hour', () => {
  const samples = [[NOW - 90 * 60000, 'working'], [NOW - 30 * 60000, 'working'], [NOW - 15 * 60000, 'needs']]
  assert.deepEqual(laneOf(samples, NOW), [[0, 45, 'working'], [45, 60, 'needs']])
})

test('repos list every worktree, with or without an agent', () => {
  const agents = [{ repo: 'api', repoRoot: 'D:\\Projects\\api', branch: 'feat/x', path: 'D:\\Projects\\api\\.claude\\worktrees\\feat-x' }]
  const repos = reposOf(agents, [{ root: 'D:\\Projects\\api', name: 'api', worktrees: [{ branch: 'main', path: 'D:\\Projects\\api' }] }, { root: 'D:\\Projects\\web', worktrees: [] }])
  assert.deepEqual(repos.map(r => [r.name, r.worktrees.map(w => w.branch)]), [['api', ['main', 'feat/x']], ['web', []]])
})

test('a repo removed from the cockpit stays out, renames win, and worktrees keep their PR', () => {
  const agents = [
    { repo: 'api', repoRoot: 'D:\\Projects\\api', branch: 'main', path: 'D:\\Projects\\api' },
    { repo: 'old', repoRoot: 'D:\\Projects\\old', branch: 'main', path: 'D:\\Projects\\old' },
  ]
  const known = [
    { root: 'd:\\projects\\API', name: 'Payments API', worktrees: [{ branch: 'feat/x', path: 'D:\\Projects\\api\\wt', pr: { num: 9 } }] },
    { root: 'D:\\Projects\\old', name: 'old', hidden: true, worktrees: [] },
  ]
  const repos = reposOf(agents, known)
  assert.deepEqual(repos.map(r => r.name), ['Payments API'])
  assert.equal(repos[0].worktrees.find(w => w.branch === 'feat/x').pr.num, 9)
})

test('totals and model names', () => {
  assert.deepEqual(totalsOf([{ state: 'needs', cost: 1 }, { state: 'working', health: 'x', cost: 0.5 }]), { total: 2, needs: 1, working: 1, done: 0, alerts: 1, cost: 1.5 })
  assert.equal(modelName('claude-haiku-4-5-20251001'), 'Haiku 4.5')
  assert.deepEqual(feedOf(undefined), [])
})
