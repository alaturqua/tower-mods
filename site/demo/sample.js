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
      add: 0, del: 0, files: 0, fileList: [], pr: null, lastPrompt: null, lastAnswer: null, feed: [], lane: []
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
      lane: [[0, 20, 'working']] })
  ]

  function repos() {
    var byRepo = {}
    agents.forEach(function (a) {
      var r = byRepo[a.repo] || (byRepo[a.repo] = { root: a.repoRoot, name: a.repo, worktrees: [] })
      if (!r.worktrees.some(function (w) { return w.branch === a.branch })) r.worktrees.push({ branch: a.branch, path: a.path, pr: a.pr })
    })
    return Object.keys(byRepo).sort().map(function (k) { return byRepo[k] })
  }

  function snapshot() {
    var count = function (s) { return agents.filter(function (a) { return a.state === s }).length }
    return {
      agents: agents, repos: repos(), error: null, at: Date.now(),
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
    answer: function (b) {
      var a = find(b.id)
      if (!a || !a.pending) return { ok: false, message: 'That request is no longer waiting.' }
      if (b.allow === false) { note(a, 'sent', 'Denied: ' + a.pending.detail); work(a, 'Looking for another way'); return { ok: true, message: 'Denied.' } }
      if (b.allow) { note(a, 'sent', 'Approved: ' + a.pending.detail); work(a, 'Running: ' + a.pending.detail); later(a, 'Done: ' + a.pending.detail); return { ok: true, message: 'Allowed.' } }
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
    merge: function (b) {
      var a = agents.filter(function (x) { return x.pr && x.pr.num === b.number })[0]
      if (a) { a.pr = null; note(a, 'say', 'Merged #' + b.number + '.') }
      return { ok: true, message: 'Merged #' + b.number + ' (in the demo).' }
    }
  }

  var COMMANDS = [['compact', 'Compact the conversation to free context'], ['clear', 'Start a fresh conversation'], ['cost', 'Show this session\'s cost and usage'],
    ['context', 'Show what fills the context window'], ['model', 'Switch the model'], ['review', 'Review a pull request'], ['init', 'Write a CLAUDE.md for this repo'],
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
