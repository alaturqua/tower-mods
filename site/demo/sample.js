// The site's demo runs the real cockpit page against this stand-in for its server: a
// sample fleet, a fake event stream, and answers to the page's actions that change the
// sample the way the real server's would. Nothing leaves the browser.
;(function () {
  'use strict'

  var now = Date.now()
  var ago = function (min) { return new Date(now - min * 60000).toISOString() }
  var clock = function (min) { var d = new Date(now - min * 60000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
  var ROOT = 'D:\\Projects\\'

  function agent(o) {
    return Object.assign({
      kind: '', state: 'working', hasBeacon: true, canSteer: true, queued: 0, pid: 1000, waited: 0, age: '1m', ctx: 30, cost: 0.4,
      base: 'main', ahead: 1, behind: 0, model: 'Opus 5.5', mode: 'auto', effort: 'high', pending: null, health: null,
      add: 0, del: 0, files: 0, fileList: [], pr: null, lastPrompt: null, lastAnswer: null, feed: [], lane: [], subagents: []
    }, o, { repoRoot: ROOT + o.repo, path: o.path || (ROOT + o.repo + (o.branch === 'main' ? '' : '\\.claude\\worktrees\\' + o.branch.replace(/\//g, '-'))) })
  }

  var agents = [
    agent({ id: 'a1', repo: 'dbt-platform', name: 'migrate-models', kind: 'bg', branch: 'feat/migrate', state: 'needs', waited: 6, ctx: 61, cost: 1.12,
      pending: { id: 'p-1', kind: 'permission', remote: true, title: 'Bash', detail: 'git push origin feat/migrate', why: 'All 12 models build. Ready to push.', options: [], diff: null, risk: 'Pushes to remote', since: ago(6) },
      doing: 'Waiting: git push origin feat/migrate', add: 214, del: 88, files: 12, ahead: 4,
      fileList: [['models/staging/stg_orders.sql', 41, 18], ['models/staging/stg_customers.sql', 37, 22], ['models/schema.yml', 66, 9]],
      feed: [[clock(14), 'you', 'Migrate the staging models to the new schema and push'], [clock(13), 'tool', 'Read models/staging (14 files)'], [clock(10), 'tool', 'Edit 12 files'], [clock(7), 'tool', 'Bash dbt build --select staging'], [clock(6), 'say', 'All 12 models build. Ready to push.'], [clock(6), 'wait', 'Bash: git push origin feat/migrate']],
      lane: [[8, 54, 'working'], [54, 60, 'needs']] }),
    agent({ id: 'a2', repo: 'infra', name: 'terraform-upgrade', kind: 'bg', branch: 'chore/tf-1.9', state: 'needs', waited: 3, ctx: 35, cost: 0.54,
      pending: { id: 'p-2', kind: 'question', remote: true, title: 'Which environment should I upgrade first?', detail: 'Which environment should I upgrade first?', why: 'Plans are clean for both environments.', options: ['staging', 'prod'], diff: null, risk: null, since: ago(3) },
      doing: 'Asks: Which environment should I upgrade first?', add: 6, del: 6, files: 3,
      fileList: [['stacks/staging/versions.tf', 2, 2], ['stacks/prod/versions.tf', 2, 2], ['.terraform-version', 2, 2]],
      feed: [[clock(11), 'you', 'Upgrade terraform to 1.9 across all stacks'], [clock(8), 'tool', 'Bash terraform init -upgrade'], [clock(3), 'say', 'Plans are clean for both environments.'], [clock(3), 'wait', 'Asks: Which environment should I upgrade first?']],
      lane: [[20, 57, 'working'], [57, 60, 'needs']] }),
    agent({ id: 'a3', repo: 'api', name: 'auth-refactor', branch: 'refactor/auth', state: 'needs', waited: 1, ctx: 44, cost: 0.71,
      pending: { id: 'p-3', kind: 'edit', remote: true, title: 'Edit', detail: 'src/auth/session.ts', why: 'Swapping the token check to the new verifier.', options: [], risk: null, since: ago(1),
        diff: [['@@ session.ts @@', 'hunk'], ['- if (!token.valid) return deny()', 'del'], ['+ const ok = await verifier.check(token)', 'add'], ['+ if (!ok) return deny()', 'add']] },
      doing: 'Waiting: src/auth/session.ts', add: 40, del: 12, files: 3,
      fileList: [['src/auth/verifier.ts', 31, 0], ['src/auth/session.ts', 6, 9], ['src/auth/index.ts', 3, 3]],
      feed: [[clock(20), 'you', 'Move session auth to the new verifier'], [clock(12), 'tool', 'Write src/auth/verifier.ts'], [clock(1), 'say', 'Swapping the token check to the new verifier.'], [clock(1), 'wait', 'Edit: src/auth/session.ts']],
      lane: [[10, 59, 'working'], [59, 60, 'needs']] }),
    agent({ id: 'a4', repo: 'web', name: 'flaky-tests', branch: 'fix/flaky-e2e', state: 'working', ctx: 48, cost: 0.86, model: 'Sonnet 5.5', mode: 'accept edits',
      subagents: [{ id: 's1', name: null, description: 'Find which e2e tests flake', type: 'Explore', status: 'completed', parentId: null, doing: 'Grep retries playwright.config.ts', tools: 14 },
        { id: 's2', name: null, description: 'Rerun checkout.spec 20 times', type: 'general-purpose', status: 'running', parentId: null, doing: 'Bash npx playwright test checkout --repeat-each 20', tools: 3 },
        { id: 's3', name: null, description: 'Read the test logs', type: 'Explore', status: 'running', parentId: 's2', doing: 'Read test-results/checkout-retry1.log', tools: 2 }],
      health: 'Looping: Bash npm test failed 3× in a row', doing: 'Bash npm test', add: 18, del: 4, files: 2,
      fileList: [['tests/checkout.spec.ts', 14, 3], ['playwright.config.ts', 4, 1]],
      pr: { num: 412, title: '#412 Stabilize checkout e2e tests', url: '#', checks: [['e2e (chromium)', 'fail'], ['unit', 'pass'], ['lint', 'pass']], reviews: 'No approval yet', mergeable: false },
      feed: [[clock(16), 'you', 'Find and fix the flaky checkout tests'], [clock(9), 'tool', 'Edit tests/checkout.spec.ts'], [clock(6), 'wait', 'Failed: Bash npm test'], [clock(4), 'wait', 'Failed: Bash npm test'], [clock(2), 'wait', 'Failed: Bash npm test']],
      lane: [[0, 44, 'working'], [44, 60, 'stuck']] }),
    agent({ id: 'a5', repo: 'api', name: 'bump-deps', kind: 'bg', branch: 'chore/deps', ctx: 87, cost: 1.95, model: 'Sonnet 5.5',
      health: 'Context 87%: compaction soon', doing: 'Bash npm test', add: 96, del: 96, files: 2,
      fileList: [['package.json', 31, 31], ['package-lock.json', 65, 65]],
      feed: [[clock(40), 'you', 'Bump all minor dependency versions and run the tests'], [clock(30), 'tool', 'Bash npm update'], [clock(1), 'tool', 'Bash npm test']],
      lane: [[0, 60, 'working']] }),
    agent({ id: 'a6', repo: 'infra', name: 'lint-fix', branch: 'fix/tflint', state: 'done', ctx: 18, cost: 0.12, model: 'Haiku 4.5', mode: 'default',
      doing: 'Opened #88; all checks pass.', add: 9, del: 9, files: 3,
      fileList: [['stacks/net/main.tf', 3, 3], ['stacks/db/main.tf', 3, 3], ['stacks/app/main.tf', 3, 3]],
      pr: { num: 88, title: '#88 Fix tflint warnings', url: '#', checks: [['tflint', 'pass'], ['plan', 'pass']], reviews: 'Approved', mergeable: true },
      feed: [[clock(18), 'you', 'Fix the tflint warnings and open a PR'], [clock(16), 'tool', 'Edit 3 files'], [clock(15), 'tool', 'Bash gh pr create'], [clock(15), 'say', 'Opened #88; all checks pass.']],
      lane: [[40, 55, 'working'], [55, 60, 'done']] }),
    agent({ id: 'a7', repo: 'tower-mods', name: 'main', branch: 'main', state: 'idle', ctx: 54, cost: 2.3,
      doing: 'Waiting for your next prompt', add: 0, del: 0, files: 0,
      feed: [[clock(55), 'you', 'Add a status line mod'], [clock(40), 'say', 'Added the status line; 7 tests pass.']],
      lane: [[0, 20, 'working']] }),
    agent({ id: 'a8', repo: 'web', name: 'lint-pass', branch: 'chore/lint', state: 'needs', waited: 2, ctx: 21, cost: 0.18, model: 'Sonnet 5.5',
      pending: { id: 'p-8', kind: 'permission', remote: true, title: 'Bash', detail: 'npm run lint', why: 'Fixed the import order; checking the rest.', options: [], diff: null, risk: null, rule: 'Bash(npm run lint)', since: ago(2) },
      doing: 'Waiting: npm run lint', add: 22, del: 19, files: 6,
      feed: [[clock(9), 'you', 'Make the lint pass'], [clock(4), 'tool', 'Edit 6 files'], [clock(2), 'wait', 'Bash: npm run lint']],
      lane: [[45, 58, 'working'], [58, 60, 'needs']] }),
    agent({ id: 'a9', repo: 'infra', name: 'docs-refresh', branch: 'docs/runbooks', state: 'done', ctx: 15, cost: 0.22, model: 'Haiku 4.5',
      doing: 'Opened #90 with the refreshed runbooks.', add: 120, del: 40, files: 4,
      pr: { num: 90, title: '#90 Refresh the runbooks', url: '#', checks: [['markdownlint', 'pass']], reviews: 'Approved', mergeable: true },
      lane: [[30, 50, 'working'], [50, 60, 'done']] }),
    agent({ id: 'f1', repo: 'api', name: 'rate-limit-1', kind: 'bg', branch: 'rate-limit-1', state: 'working', ctx: 33, cost: 0.61,
      doing: 'Edit src/middleware/limit.ts', lastAnswer: 'Token bucket per API key, in memory.', add: 88, del: 4, files: 3,
      health: 'Conflict: src/auth/session.ts also changed by auth-refactor (⎇ refactor/auth)', lane: [[40, 60, 'working']] }),
    agent({ id: 'f2', repo: 'api', name: 'rate-limit-2', kind: 'bg', branch: 'rate-limit-2', state: 'done', ctx: 29, cost: 0.47,
      doing: 'Sliding window in Redis; tests pass.', lastAnswer: 'Sliding window in Redis; 14 tests pass.', add: 120, del: 9, files: 5, lane: [[40, 56, 'working'], [56, 60, 'done']] }),
    agent({ id: 'h1', repo: 'tower-mods', name: 'site-copy', branch: 'main', state: 'needs', waited: 4, ctx: 12, cost: 0.09,
      pending: { id: null, kind: 'local', remote: false, title: 'In its terminal', detail: 'Claude needs your permission to use Bash', why: null, options: [], diff: null, risk: null, since: ago(4) },
      doing: 'Waiting: Claude needs your permission to use Bash', lane: [[50, 56, 'working'], [56, 60, 'needs']] })
  ]
  var settings = { remoteAnswers: 'launched' }
  var groups = [{ id: 'g1', name: 'rate-limit', task: 'Add rate limiting to the public API. Pick the simplest design that survives a restart.', root: ROOT + 'api', branches: ['rate-limit-1', 'rate-limit-2'] }]
  var done = [
    { id: 'a6', at: ago(15), repo: 'infra', name: 'lint-fix', branch: 'fix/tflint', summary: 'Opened #88; all checks pass.', add: 9, del: 9, files: 3, seconds: 212, cost: 0.12, pr: { num: 88, title: '#88 Fix tflint warnings' } },
    { at: ago(48), repo: 'web', name: 'og-images', branch: 'feat/og', summary: 'Generated Open Graph images for all 24 pages.', add: 310, del: 12, files: 26, seconds: 1340, cost: 0.94, pr: null },
    { id: 'gone-1', at: ago(95), repo: 'api', name: 'n-plus-one', branch: 'fix/orders-query', path: ROOT + 'api', model: 'Sonnet 5.5', summary: 'Orders list is one query now; p95 went from 840 ms to 90 ms.',
      answer: 'Found the N+1: each order loaded its lines separately.\n\nOrders list is one query now; p95 went from 840 ms to 90 ms.',
      fileList: [['src/orders/list.ts', 22, 41], ['src/orders/list.test.ts', 19, 22]], add: 41, del: 63, files: 4, seconds: 760, cost: 0.58, pr: { num: 233, title: '#233 Load order lines in one query', url: 'https://github.com/example/api/pull/233' } }
  ]

  // /demo/?long swaps in the long names real repositories have, to check how the page copes.
  if (/[?&]long\b/.test(location.search)) {
    var LONG = 'adapt-dbx-dbt-data-transformation'
    var rename = function (a, branch) { a.repo = LONG; a.repoRoot = ROOT + LONG; a.branch = branch; a.path = ROOT + LONG + '\\.claude\\worktrees\\' + branch.replace(/\//g, '-'); return a }
    rename(agents[0], 'feature/AZPDP-3014-migrate-staging-models-to-the-new-schema')
    agents.push(rename(agent({ id: 'l2', repo: LONG, name: 'adapt-dbx-dbt-data-transformation-7c', branch: 'x', doing: 'Waiting for your next prompt', state: 'idle', canSteer: true }), 'feature/AZPDP-2287-add-incremental-models-for-orders'))
    agents.push(rename(agent({ id: 'l3', repo: LONG, name: 'adapt-dbx-dbt-data-transformation-9e', branch: 'x', doing: 'Reading the codebase', state: 'working' }), 'fix/AZPDP-3041-null-handling-in-customer-dim'))
  }

  function repos() {
    var byRepo = {}
    agents.forEach(function (a) {
      var r = byRepo[a.repo] || (byRepo[a.repo] = { root: a.repoRoot, name: a.repo, worktrees: [] })
      if (!r.worktrees.some(function (w) { return w.branch === a.branch })) r.worktrees.push({ branch: a.branch, path: a.path, pr: a.pr })
    })
    return Object.keys(byRepo).sort().map(function (k) {
      var r = byRepo[k]
      r.ready = r.worktrees.filter(function (w) { return w.pr && w.pr.mergeable }).map(function (w) { return { num: w.pr.num, title: w.pr.title, branch: w.branch } }).sort(function (x, y) { return x.num - y.num })
      return r
    })
  }

  // Fourteen days of sample spend for the dashboard, oldest first; today counts the done log.
  var DAILY = [[1.2, 3], [0.4, 1], [2.9, 6], [1.8, 4], [0, 0], [0.6, 2], [3.4, 7], [2.2, 5], [1.1, 3], [4.0, 8], [2.6, 5], [0.9, 2], [3.1, 6]]
  function stats() {
    var day = function (n) { var d = new Date(now - n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
    var today = done.reduce(function (n, r) { return n + r.cost }, 0)
    var days = DAILY.map(function (d, i) { return { day: day(13 - i), cost: d[0], runs: d[1] } }).concat([{ day: day(0), cost: +today.toFixed(2), runs: done.length }])
    var runs = days.reduce(function (n, d) { return n + d.runs }, 0)
    var top = done.slice().sort(function (a, b) { return b.cost - a.cost }).map(function (r) { return { id: r.id, at: r.at, repo: r.repo, name: r.name, cost: r.cost, seconds: r.seconds } })
    top = [{ id: 'old-1', at: ago(60 * 24 * 4), repo: 'api', name: 'search-rewrite', cost: 2.84, seconds: 4120 }, { id: 'old-2', at: ago(60 * 24 * 6), repo: 'web', name: 'design-tokens', cost: 1.96, seconds: 2710 }].concat(top).slice(0, 5)
    return { top: top, days: days, runs: runs, cost: +days.reduce(function (n, d) { return n + d.cost }, 0).toFixed(2), avgSeconds: 540,
      repos: [{ repo: 'api', cost: 9.8, runs: 19 }, { repo: 'web', cost: 7.1, runs: 14 }, { repo: 'dbt-platform', cost: 5.4, runs: 9 }, { repo: 'infra', cost: 2.3, runs: 8 }, { repo: 'tower-mods', cost: 1.2, runs: 3 }] }
  }

  function snapshot() {
    var count = function (s) { return agents.filter(function (a) { return a.state === s }).length }
    return {
      agents: agents, repos: repos(), error: null, at: Date.now(), settings: settings, done: done, stats: stats(),
      usage: { limits: [{ kind: 'five_hour', label: '5-hour', percent: 72, resets: '1h' }, { kind: 'seven_day', label: 'Weekly', percent: 41, resets: '4d' }] },
      groups: groups.map(function (g) {
        return { id: g.id, name: g.name, task: g.task, root: g.root, members: g.branches.map(function (b) {
          var a = agents.filter(function (x) { return x.name === b })[0]
          return a
            ? { branch: b, id: a.id, state: a.state, doing: a.doing, add: a.add, del: a.del, files: a.files, cost: a.cost, pr: a.pr, health: a.health, summary: a.lastAnswer || '' }
            : { branch: b, id: null, state: 'idle', doing: 'Starting…', add: 0, del: 0, files: 0, cost: 0, pr: null, health: null, summary: '' }
        }) }
      }),
      totals: { total: agents.length, needs: count('needs'), working: count('working'), done: count('done'),
        alerts: agents.filter(function (a) { return a.health }).length, cost: agents.reduce(function (n, a) { return n + a.cost }, 0) }
    }
  }

  var streams = []
  function publish() {
    var data = JSON.stringify(snapshot())
    streams.forEach(function (s) { if (s.onmessage) s.onmessage({ data: data }) })
  }

  function FakeEventSource() {
    var self = this
    streams.push(this)
    setTimeout(function () { if (self.onmessage) self.onmessage({ data: JSON.stringify(snapshot()) }) }, 0)
  }
  FakeEventSource.prototype.close = function () {}

  function find(id) { return agents.filter(function (a) { return a.id === id })[0] }
  function note(a, kind, text) { a.feed = a.feed.concat([[clock(0), kind, text]]) }
  function work(a, doing) { a.state = 'working'; a.pending = null; a.waited = 0; a.doing = doing; a.lane = a.lane.concat([[59.5, 60, 'working']]) }
  // A step later the agent "finishes", so the demo keeps moving after an answer.
  function later(a, say) { setTimeout(function () { if (a.state !== 'working') return; a.state = 'done'; a.doing = say; note(a, 'say', say); publish() }, 4000) }

  var ACTIONS = {
    'clear-done': function () { done = []; return { ok: true, message: 'Cleared the Done log.' } },
    answer: function (b) {
      var a = find(b.id)
      if (!a || !a.pending) return { ok: false, message: 'That request is no longer waiting.' }
      // Read before work() clears the request.
      var what = a.pending.detail
      if (b.allow === false) { note(a, 'sent', 'Denied: ' + what); work(a, 'Looking for another way'); return { ok: true, message: 'Denied.' } }
      if (b.allow) { note(a, 'sent', 'Approved: ' + what); work(a, 'Running: ' + what); later(a, 'Done: ' + what); return { ok: true, message: 'Allowed.' } }
      note(a, 'sent', 'Answered: ' + b.text); work(a, 'Working on ' + b.text + ' first'); later(a, b.text + ' is upgraded; plan for the next one is ready.')
      return { ok: true, message: 'Answered.' }
    },
    send: function (b) {
      var a = find(b.id)
      if (!a) return { ok: false, message: 'No such session.' }
      note(a, 'sent', b.text)
      if (!b.text.startsWith('/')) { work(a, 'Working on: ' + b.text); later(a, 'Done: ' + b.text) }
      return { ok: true, message: b.text.startsWith('/') ? 'Queued ' + b.text.split(/\s/)[0] + '.' : 'Queued.' }
    },
    launch: function (b) {
      var name = String(b.name || 'agent').trim().replace(/\s+/g, '-')
      var copies = b.worktree ? Math.max(1, Math.min(4, Number(b.copies) || 1)) : 1
      if (copies > 1) {
        var branches = [], ids = []
        for (var i = 1; i <= copies; i++) {
          branches.push(name + '-' + i)
          ids.push(ACTIONS.launch(Object.assign({}, b, { name: name + '-' + i, copies: 1 })).id)
        }
        var gid = 'g' + Date.now()
        groups.push({ id: gid, name: name, task: b.task, root: b.repo, branches: branches })
        return { ok: true, message: 'Started ' + copies + ' agents on the same task. Compare them above the fleet.', id: ids[0], ids: ids, group: gid }
      }
      var repo = String(b.repo).split(/[\\/]/).pop()
      var a = agent({ id: 'n' + Date.now(), repo: repo, name: name, kind: 'bg', branch: b.worktree ? name : 'main', model: b.model ? b.model[0].toUpperCase() + b.model.slice(1) : 'Opus 5.5',
        mode: b.mode === 'acceptEdits' ? 'accept edits' : b.mode, ctx: 2, cost: 0, add: 0, del: 0, files: 0, doing: 'Starting…',
        feed: [[clock(0), 'you', b.task || '(no task)']], lane: [[59.5, 60, 'working']] })
      agents.push(a)
      setTimeout(function () { note(a, 'tool', 'Read README.md'); a.doing = 'Reading the codebase'; a.ctx = 6; publish() }, 1500)
      return { ok: true, message: b.worktree ? 'Started ' + name + ' in a new worktree.' : 'Started.', id: a.id }
    },
    stop: function (b) {
      if (b.kind !== 'bg') return { ok: false, message: 'Only background sessions stop from here; jump to this one instead.' }
      agents = agents.filter(function (a) { return a.id !== b.id })
      return { ok: true, message: 'Stopped.' }
    },
    jump: function () { return { ok: true, message: 'In the cockpit on your machine, this brings the session\'s window forward.' } },
    'allow-always': function (b) {
      var a = find(b.id)
      var rule = a && a.pending && a.pending.rule
      if (!rule) return { ok: false, message: 'That request is no longer waiting.' }
      ACTIONS.answer({ id: b.id, allow: true })
      return { ok: true, message: 'Allowed. ' + rule + ' now runs without asking in ' + a.repo + '. (In the demo nothing is written.)' }
    },
    'remote-answers': function (b) {
      settings.remoteAnswers = b.value
      return { ok: true, message: 'Done. Sessions you start from now on send their permission prompts and questions here.' }
    },
    'merge-queue': function (b) {
      var nums = []
      agents.forEach(function (a) { if (a.repoRoot === b.root && a.pr && a.pr.mergeable) { nums.push(a.pr.num); note(a, 'say', 'Merged ' + a.pr.title + '.'); a.pr = null } })
      nums.sort(function (x, y) { return x - y })
      return { ok: true, message: 'Merged ' + nums.map(function (n) { return '#' + n }).join(', ') + ' in order (in the demo).' }
    },
    'keep-fanout': function (b) {
      var g = groups.filter(function (x) { return x.id === b.group })[0]
      if (!g) return { ok: false, message: 'That comparison is gone.' }
      agents = agents.filter(function (a) { return g.branches.indexOf(a.name) < 0 || a.name === b.branch })
      groups = groups.filter(function (x) { return x !== g })
      return { ok: true, message: 'Kept ' + b.branch + '. Removed ' + (g.branches.length - 1) + ' other worktree(s); their branches are kept.' }
    },
    merge: function (b) {
      var a = agents.filter(function (x) { return x.pr && x.pr.num === b.number })[0]
      if (a) { a.pr = null; note(a, 'say', 'Merged #' + b.number + '.') }
      return { ok: true, message: 'Merged #' + b.number + ' (in the demo).' }
    }
  }

  var COMMANDS = [['compact', 'Compact the conversation to free context'], ['clear', 'Start a fresh conversation'], ['cost', 'Show this session\'s cost and usage'],
    ['context', 'Show what fills the context window'], ['model', 'Switch the model'], ['effort', 'Set the effort level'], ['review', 'Review a pull request'], ['init', 'Write a CLAUDE.md for this repo'],
    ['agents', 'Manage subagents'], ['mcp', 'Manage MCP servers'], ['superpowers:brainstorming', 'Explore an idea before building it']]
    .map(function (c) { return { name: c[0], description: c[1] } })

  // The page still loads its own files (the cockpit template) through the real fetch.
  var realFetch = window.fetch.bind(window)
  window.EventSource = FakeEventSource
  window.fetch = function (url, opts) {
    var path = String(url)
    var reply = function (body) { return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })) }
    if (path.indexOf('/api/commands') === 0) return reply(COMMANDS)
    if (path.indexOf('/api/') === 0) {
      var name = path.slice(5)
      var body = opts && opts.body ? JSON.parse(opts.body) : {}
      var result = ACTIONS[name] ? ACTIONS[name](body) : { ok: true, message: 'In the demo this does nothing; on your machine it does.' }
      setTimeout(publish, 50)
      return reply(result)
    }
    return realFetch(url, opts)
  }
})()
