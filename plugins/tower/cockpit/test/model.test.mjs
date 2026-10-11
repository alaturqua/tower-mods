import assert from 'node:assert/strict'
import { test } from 'node:test'

import { conflictsOf, feedOf, finishedOf, groupsOf, healthOf, statsOf, laneOf, markConflicts, modelName, pendingOf, reposOf, riskOf, stateOf, toAgent, totalsOf, usageOf } from '../lib/model.mjs'

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
  assert.equal(modelName('eu.anthropic.claude-sonnet-5-5'), 'Sonnet 5.5')
  assert.equal(modelName('claude-opus-5-5[1m]'), 'Opus 5.5 1M')
  assert.deepEqual(feedOf(undefined), [])
})

const agent = (over = {}) => ({ id: 'a', name: 'x', branch: 'b', repoRoot: 'D:\Projects\api', path: 'D:\Projects\api', state: 'idle', cost: 0, add: 0, del: 0, files: 0, touched: [], limits: [], reported: 0, lastAnswer: null, pr: null, ...over })

test('Always allow offers one exact, risk-free Bash command and nothing broader', () => {
  const rule = detail => pendingOf({ pending: { id: 'p', kind: 'permission', title: 'Bash', detail } }, 'needs').rule
  assert.equal(rule('npm test'), 'Bash(npm test)')
  assert.equal(rule('git push origin main'), null)
  assert.equal(rule('rm -rf build'), null)
  assert.equal(rule('ls *.js'), null)
  assert.equal(rule('echo (x)'), null)
  assert.equal(rule('a'.repeat(300)), null)
  assert.equal(pendingOf({ pending: { id: 'p', kind: 'permission', title: 'Edit', detail: 'src/a.ts' } }, 'needs').rule, null)
  assert.equal(pendingOf({ pending: { id: 'p', kind: 'question', title: 'Which?' } }, 'needs').rule, null)
})

test('usage takes each rate-limit window from the session that reported it last', () => {
  const old = agent({ id: 'o', reported: 1000, limits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: '2026-10-06T16:00:00Z' }] })
  const fresh = agent({ id: 'f', reported: 2000, limits: [{ kind: 'seven_day', percentUsed: 41.6 }, { kind: 'five_hour', percentUsed: 62.4, resetsAt: '2026-10-06T16:00:00Z' }] })
  const usage = usageOf([old, fresh, agent({ id: 'n' })], NOW)
  assert.deepEqual(usage.limits.map(l => [l.label, l.percent]), [['5-hour', 62], ['Weekly', 42]])
  assert.equal(usage.limits[0].resets, '2h')
  assert.deepEqual(usageOf([agent()], NOW).limits, [])
})

test('a run that ends in done is recorded once, with what it cost', () => {
  const last = new Map(), began = new Map()
  assert.deepEqual(finishedOf([agent({ state: 'working', cost: 1 })], last, began, NOW), [])
  const done = agent({ state: 'done', cost: 1.75, add: 5, del: 1, files: 2, fileList: [['a.js', 4, 1]], lastAnswer: 'Fixed it.\n\nAll tests pass.', pr: { num: 9, title: '#9 Fix', url: 'https://x/9', checks: [] } })
  const [rec] = finishedOf([done], last, began, NOW + 90000)
  assert.equal(rec.seconds, 90)
  assert.equal(rec.cost, 0.75)
  assert.equal(rec.summary, 'All tests pass.')
  // the finished-run panel gets the whole message and the files, not just the last line
  assert.equal(rec.answer, 'Fixed it.\n\nAll tests pass.')
  assert.deepEqual(rec.fileList, [['a.js', 4, 1]])
  assert.deepEqual(rec.pr, { num: 9, title: '#9 Fix', url: 'https://x/9' })
  assert.deepEqual(finishedOf([done], last, began, NOW + 95000), [])
  // an agent already done when the cockpit started is not a finished run
  assert.deepEqual(finishedOf([agent({ id: 'z', state: 'done' })], new Map(), new Map(), NOW), [])
})

test('two worktrees changing one file are flagged; the same worktree, other repos and disjoint files are not', () => {
  const a = agent({ id: 'a', name: 'one', branch: 'one', path: 'D:\w\one', touched: ['src/a.ts', 'src/b.ts', 'c.md'] })
  const b = agent({ id: 'b', name: 'two', branch: 'two', path: 'D:\w\two', touched: ['src/a.ts', 'src/b.ts'] })
  const c = agent({ id: 'c', name: 'three', branch: 'three', path: 'D:\w\three', touched: ['other.ts'] })
  const elsewhere = agent({ id: 'd', repoRoot: 'D:\Projects\web', path: 'D:\w\four', touched: ['src/a.ts'] })
  const same = agent({ id: 'e', path: 'D:\w\one', touched: ['src/a.ts'] })
  const found = conflictsOf([a, b, c, elsewhere])
  assert.equal(found.get('a'), 'src/a.ts and 1 more also changed by two (⎇ two)')
  assert.ok(found.has('b'))
  assert.ok(!found.has('c') && !found.has('d'))
  assert.equal(conflictsOf([a, same]).size, 0)
  const marked = markConflicts([a, b, agent({ id: 'h', name: 'looper', path: 'D:\w\h', health: 'Looping: x', touched: ['src/a.ts'] })])
  assert.match(marked[0].health, /^Conflict: /)
  assert.equal(marked[2].health, 'Looping: x')
  assert.ok(marked[2].conflict)
})

test('the merge queue lists green pull requests oldest first, per repository', () => {
  const pr = (num, mergeable) => ({ num, title: `#${num}`, mergeable })
  const repos = reposOf([], [{ root: 'D:\Projects\api', name: 'api', worktrees: [
    { path: 'p1', branch: 'b9', pr: pr(9, true) }, { path: 'p2', branch: 'b3', pr: pr(3, true) }, { path: 'p3', branch: 'b5', pr: pr(5, false) }, { path: 'p4', branch: 'b6' }] }])
  assert.deepEqual(repos[0].ready.map(r => r.num), [3, 9])
})

test('a fan-out lists its branches side by side, with a placeholder for one not running yet', () => {
  const rec = { id: 'g1', name: 'try', task: 'Do it', repo: 'D:\Projects\api', branches: ['try-1', 'try-2'] }
  const one = agent({ id: 'a1', name: 'try-1', state: 'working', add: 3, lastAnswer: 'Almost.' })
  const [group] = groupsOf([rec], [one, agent({ id: 'x', name: 'try-2', repoRoot: 'D:\Projects\web' })])
  assert.deepEqual(group.members.map(m => [m.branch, m.id, m.state]), [['try-1', 'a1', 'working'], ['try-2', null, 'idle']])
  assert.equal(group.members[0].summary, 'Almost.')
})

test('stats add up the last 14 days of runs, per day and per repo', () => {
  const day = n => new Date(NOW - n * 86400000).toISOString()
  const runs = [
    { at: day(20), repo: 'old', cost: 9, seconds: 60 },
    { at: day(1), repo: 'api', cost: 1.5, seconds: 100 },
    { at: day(1), repo: 'web', cost: 0.5, seconds: 300 },
    { at: day(0), repo: 'api', cost: 1, seconds: 200 },
  ]
  const s = statsOf(runs, NOW)
  assert.equal(s.days.length, 14)
  assert.deepEqual(s.days.at(-1), { day: s.days.at(-1).day, cost: 1, runs: 1 })
  assert.deepEqual({ cost: s.days.at(-2).cost, runs: s.days.at(-2).runs }, { cost: 2, runs: 2 })
  assert.deepEqual(s.repos, [{ repo: 'api', cost: 2.5, runs: 2 }, { repo: 'web', cost: 0.5, runs: 1 }])
  assert.deepEqual({ runs: s.runs, cost: s.cost, avgSeconds: s.avgSeconds }, { runs: 3, cost: 3, avgSeconds: 200 })
  assert.deepEqual(s.top.map(r => r.cost), [1.5, 1, 0.5], 'the costliest runs in the window, costliest first')
  assert.deepEqual(statsOf([], NOW).repos, [])
})
