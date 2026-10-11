// The cockpit's view of the fleet, from plain inputs: the engine's live session list,
// beacon's status files, git facts per working folder, open PRs and a short history.
// No I/O here, so every rule the screen shows is testable on its own.

const STUCK_MS = 10 * 60 * 1000
const CONTEXT_WARN = 85
const LANE_MINUTES = 60
const BEACON_STATES = new Set(['needs-input', 'working', 'done', 'idle'])

// Commands that deserve a second look before Allow.
const RISKS = [
  [/\bgit\s+push\b.*(--force|-f\b)/, 'Force-pushes'],
  [/\bgit\s+push\b/, 'Pushes to remote'],
  [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|Remove-Item\b.*-Recurse/i, 'Deletes recursively'],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/, 'Discards work'],
  [/\b(terraform|tofu)\s+(apply|destroy)\b|\bkubectl\s+(apply|delete)\b|\bdeploy\b/i, 'Changes infrastructure'],
  [/\b(drop\s+table|truncate\s+table)\b/i, 'Drops data'],
  [/\bnpm\s+publish\b|\bgh\s+release\s+create\b/, 'Publishes'],
]

export function folder(path) {
  return String(path).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(path)
}

export function riskOf(detail) {
  for (const [re, label] of RISKS) if (re.test(detail ?? '')) return label
  return null
}

// What the screen calls the session's state. A beacon "working" the engine sees idle is an
// interrupted turn; a session without beacon has only the engine's busy or idle.
export function stateOf(row, status) {
  const busy = row.status === 'busy'
  const beacon = status && BEACON_STATES.has(status.state) ? status.state : null
  if (beacon === 'needs-input') return 'needs'
  if (beacon === 'working') return busy ? 'working' : 'idle'
  if (beacon === 'done') return busy ? 'working' : 'done'
  return busy ? 'working' : 'idle'
}

export function healthOf(row, status, now) {
  if (status?.health) return status.health
  const updated = Date.parse(status?.updatedAt ?? '')
  if (row.status === 'busy' && !Number.isNaN(updated) && now - updated > STUCK_MS) {
    return `Stuck: no activity for ${Math.round((now - updated) / 60000)} min`
  }
  if ((status?.contextPercent ?? 0) >= CONTEXT_WARN) return `Context ${Math.round(status.contextPercent)}%: compaction soon`
  return null
}

function clock(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function feedOf(activity) {
  return (activity ?? []).map(a => [clock(a.t), a.kind === 'fail' ? 'wait' : a.kind, a.kind === 'fail' ? `Failed: ${a.text}` : a.text])
}

export function ago(then, now) {
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

const MODES = { default: 'default', acceptEdits: 'accept edits', plan: 'plan', auto: 'auto', bypassPermissions: 'bypass', dontAsk: "don't ask" }

// "claude-opus-5-5" reads "Opus 5.5". The name is found wherever it sits in the id, so a
// provider's prefix ("eu.anthropic.claude-sonnet-5-5") needs no special case.
export function modelName(model) {
  const raw = String(model ?? '')
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(raw)
  if (!m) return raw || '—'
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}${/\[1m\]/i.test(raw) ? ' 1M' : ''}`
}

// The permission rule "Always allow" would write: this exact command and no other, and only
// for a plain Bash command with no risk badge. Anything broader is the user's to write.
export function ruleOf(p, detail, risk) {
  if (p.kind !== 'permission' || p.title !== 'Bash' || risk || !detail) return null
  // describeInput cuts at 300; a cut command is not the command that ran.
  if (detail.length >= 300 || /[*()\\\r\n]/.test(detail)) return null
  return `Bash(${detail})`
}

// What a pending request looks like on a card. A session that keeps its own dialogs still
// shows what it waits on, as a local wait the cockpit can only jump to.
export function pendingOf(status, state) {
  const p = status?.pending
  if (p) {
    const detail = p.kind === 'question' ? p.title : (p.detail ?? p.title)
    const risk = p.kind === 'question' ? null : riskOf(detail)
    return {
      id: p.id, kind: p.kind === 'question' ? 'question' : (p.diff ? 'edit' : 'permission'), remote: true,
      title: p.title, detail, why: p.why ?? null, options: p.options ?? [], diff: p.diff ?? null,
      risk, rule: ruleOf(p, detail, risk), since: p.since ?? null,
    }
  }
  if (state === 'needs' && status?.message) {
    return { id: null, kind: 'local', remote: false, title: 'In its terminal', detail: status.message, why: null, options: [], diff: null, risk: riskOf(status.message), since: status.updatedAt ?? null }
  }
  return null
}

// One agent as the screen draws it. `inbox` is how many lines its inbox file holds.
export function toAgent({ row, status, git, pr, lane, inbox = 0, now }) {
  const canSteer = status?.canReceive === true
  const state = stateOf(row, status)
  const pending = pendingOf(status, state)
  const updated = Date.parse(status?.updatedAt ?? '') || row.startedAt || now
  const since = Date.parse(pending?.since ?? '')
  return {
    id: row.sessionId,
    repo: git?.repoName ?? status?.label ?? folder(row.cwd),
    repoRoot: git?.repoRoot ?? row.cwd,
    name: row.name ?? folder(row.cwd),
    kind: row.kind === 'background' ? 'bg' : '',
    state,
    hasBeacon: Boolean(status && BEACON_STATES.has(status.state)),
    canSteer,
    // Sent from the cockpit, not yet picked up by the session.
    queued: canSteer ? Math.max(0, inbox - (status.inboxSeen ?? 0)) : 0,
    pid: row.pid ?? null,
    limits: status?.rateLimits ?? [],
    reported: Date.parse(status?.updatedAt ?? '') || 0,
    budget: status?.budgetUsd ?? 0,
    touched: (git?.files ?? []).slice(0, 300).map(f => f.path),
    doing: pending ? `${pending.kind === 'question' ? 'Asks' : 'Waiting'}: ${pending.detail}` : (status?.message ?? (state === 'working' ? 'Working' : 'Waiting for your next prompt')),
    waited: Number.isNaN(since) ? 0 : Math.max(0, Math.round((now - since) / 60000)),
    age: ago(updated, now),
    ctx: Math.round(status?.contextPercent ?? 0),
    cost: status?.costUsd ?? 0,
    path: row.cwd,
    branch: git?.branch ?? '—',
    base: git?.base ?? 'main',
    ahead: git?.ahead ?? 0,
    behind: git?.behind ?? 0,
    model: modelName(status?.model),
    mode: MODES[status?.mode] ?? status?.mode ?? '—',
    effort: status?.effort ?? null,
    pending,
    health: healthOf(row, status, now),
    add: git?.add ?? 0,
    del: git?.del ?? 0,
    files: git?.files?.length ?? 0,
    fileList: (git?.files ?? []).slice(0, 12).map(f => [f.path, f.add, f.del]),
    pr: pr ?? null,
    lastPrompt: status?.lastPrompt ?? null,
    lastAnswer: status?.lastAnswer ?? null,
    feed: feedOf(status?.activity),
    // As the beacon reports them; an older beacon reports none.
    subagents: Array.isArray(status?.subagents) ? status.subagents : [],
    lane: lane ?? [],
  }
}

// The history's samples as timeline segments: [startMin, endMin, state] within the last hour.
export function laneOf(samples, now) {
  const start = now - LANE_MINUTES * 60000
  const segs = []
  for (let i = 0; i < samples.length; i++) {
    const [t, state] = samples[i]
    const end = i + 1 < samples.length ? samples[i + 1][0] : now
    if (end <= start) continue
    const a = Math.max(0, (Math.max(t, start) - start) / 60000)
    const b = Math.min(LANE_MINUTES, (end - start) / 60000)
    const last = segs[segs.length - 1]
    if (last && last[2] === state && Math.abs(last[1] - a) < 0.01) last[1] = b
    else if (b > a) segs.push([a, b, state])
  }
  return segs
}

// Repositories with their worktrees, so a workstream with nobody in it still shows. A
// repo removed from the cockpit (`hidden`) stays out even while sessions run in it, and a
// name given in the cockpit wins over the folder's.
export function reposOf(agents, known) {
  const keyOf = root => String(root).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
  const hidden = new Set(known.filter(r => r.hidden).map(r => keyOf(r.root)))
  const byRoot = new Map()
  const add = (root, name) => {
    const key = keyOf(root)
    if (!byRoot.has(key)) byRoot.set(key, { root, name: name ?? folder(root), worktrees: new Map() })
    return byRoot.get(key)
  }
  for (const r of known) {
    if (hidden.has(keyOf(r.root))) continue
    const repo = add(r.root, r.name)
    for (const w of r.worktrees ?? []) if (w.branch) repo.worktrees.set(w.branch, { ...w })
  }
  for (const a of agents) {
    if (hidden.has(keyOf(a.repoRoot))) continue
    const repo = add(a.repoRoot, a.repo)
    // A folder that is not a git repository has no workstreams, only its agents.
    if (a.branch !== '—' && !repo.worktrees.has(a.branch)) repo.worktrees.set(a.branch, { branch: a.branch, path: a.path })
  }
  return [...byRoot.values()]
    .map(r => {
      const worktrees = [...r.worktrees.values()]
      return { root: r.root, name: r.name, worktrees, ready: readyOf(worktrees) }
    })
    .sort((x, y) => x.name.localeCompare(y.name))
}

export function totalsOf(agents) {
  const count = s => agents.filter(a => a.state === s).length
  return {
    total: agents.length,
    needs: count('needs'),
    working: count('working'),
    done: count('done'),
    alerts: agents.filter(a => a.health).length,
    cost: agents.reduce((n, a) => n + (a.cost || 0), 0),
  }
}

// ---- account usage: the rate-limit windows, from whichever session reported them last ------

const WINDOWS = { five_hour: '5-hour', seven_day: 'Weekly', spend_limit: 'Spend' }

function until(iso, now) {
  const t = Date.parse(iso ?? '')
  return Number.isNaN(t) ? '' : ago(now, Math.max(now, t))
}

export function usageOf(agents, now) {
  const latest = new Map()
  for (const a of agents) {
    for (const l of a.limits ?? []) if (!latest.has(l.kind) || a.reported > latest.get(l.kind).reported) latest.set(l.kind, { ...l, reported: a.reported })
  }
  const percent = l => Math.round(l.percentUsed)
  return {
    limits: [...latest.values()]
      .sort((x, y) => Object.keys(WINDOWS).indexOf(x.kind) - Object.keys(WINDOWS).indexOf(y.kind))
      .map(l => ({ kind: l.kind, label: WINDOWS[l.kind] ?? l.kind, percent: percent(l), resets: until(l.resetsAt, now) })),
  }
}

// ---- the done log: a run that ended in "done" becomes one record ---------------------------

// `last` (id -> state) and `began` (id -> { at, cost }) are the caller's memory between
// refreshes and are updated here. A restart forgets them, so nothing is recorded twice.
export function finishedOf(agents, last, began, now) {
  const records = []
  for (const a of agents) {
    const before = last.get(a.id)
    if (a.state === 'working' && !began.has(a.id)) began.set(a.id, { at: now, cost: a.cost })
    if (a.state === 'done' && (before === 'working' || before === 'needs')) {
      const start = began.get(a.id) ?? { at: now, cost: a.cost }
      records.push({
        id: a.id, at: new Date(now).toISOString(), repo: a.repo, name: a.name, branch: a.branch, path: a.path, model: a.model,
        seconds: Math.round((now - start.at) / 1000), cost: Math.max(0, +(a.cost - start.cost).toFixed(2)),
        add: a.add, del: a.del, files: a.files, fileList: a.fileList ?? [],
        pr: a.pr ? { num: a.pr.num, title: a.pr.title, url: a.pr.url ?? null } : null,
        summary: lastLine(a.lastAnswer),
        // The whole last message, for the finished-run panel; capped so history.jsonl stays small.
        answer: a.lastAnswer ? String(a.lastAnswer).slice(0, 4000) : null,
      })
    }
    if (a.state !== 'working' && a.state !== 'needs') began.delete(a.id)
    last.set(a.id, a.state)
  }
  return records
}

// ---- two agents, one file: worktrees that will collide when both are merged ---------------

const norm = p => String(p).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')

// The last non-empty line of an answer: what the agent said last.
const lastLine = text => (text ?? '').split('\n').map(l => l.trim()).filter(Boolean).pop()?.slice(0, 200) ?? ''

// id -> a sentence, for every agent that changes a file another agent in the same
// repository, in a different worktree, also changes.
export function conflictsOf(agents) {
  const found = new Map()
  for (const a of agents) {
    for (const b of agents) {
      if (a === b || norm(a.repoRoot) !== norm(b.repoRoot) || norm(a.path) === norm(b.path)) continue
      const theirs = new Set(b.touched ?? [])
      const shared = (a.touched ?? []).filter(f => theirs.has(f))
      if (shared.length && !found.has(a.id)) {
        found.set(a.id, `${shared[0]}${shared.length > 1 ? ` and ${shared.length - 1} more` : ''} also changed by ${b.name} (⎇ ${b.branch})`)
      }
    }
  }
  return found
}

// A conflict is a health problem like any other, unless the agent has a worse one.
export function markConflicts(agents) {
  for (const [id, text] of conflictsOf(agents)) {
    const a = agents.find(x => x.id === id)
    a.conflict = text
    a.health = a.health || `Conflict: ${text}`
  }
  return agents
}

// ---- the merge queue: green pull requests, oldest first -----------------------------------

export function readyOf(worktrees) {
  return worktrees.filter(w => w.pr?.mergeable).map(w => ({ num: w.pr.num, title: w.pr.title, branch: w.branch })).sort((x, y) => x.num - y.num)
}

// ---- fan-outs: the agents of one group, side by side --------------------------------------

// The dashboard's trends from the done log: the last 14 days (local, oldest first), per day
// and per repo, so the page gets a few numbers, not 500 records.
const STAT_DAYS = 14
const REPOS_SHOWN = 6
const TOP_RUNS = 5
export function statsOf(records, now) {
  const key = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const days = Array.from({ length: STAT_DAYS }, (_, i) => ({ day: key(now - (STAT_DAYS - 1 - i) * 86400000), cost: 0, runs: 0 }))
  const byDay = new Map(days.map(d => [d.day, d]))
  const byRepo = new Map()
  let seconds = 0, count = 0
  for (const r of records) {
    const d = byDay.get(key(Date.parse(r.at)))
    if (!d) continue
    d.cost += r.cost || 0
    d.runs += 1
    const repo = byRepo.get(r.repo) ?? { repo: r.repo, cost: 0, runs: 0 }
    repo.cost += r.cost || 0
    repo.runs += 1
    byRepo.set(r.repo, repo)
    seconds += r.seconds || 0
    count += 1
  }
  const round = n => +n.toFixed(2)
  for (const d of days) d.cost = round(d.cost)
  const sorted = [...byRepo.values()].sort((a, b) => b.cost - a.cost)
  const rest = sorted.slice(REPOS_SHOWN - 1)
  // Past the top few, the rest fold into one "Other" bar instead of vanishing.
  const repos = (sorted.length > REPOS_SHOWN ? [...sorted.slice(0, REPOS_SHOWN - 1), { repo: 'Other', cost: rest.reduce((n, r) => n + r.cost, 0), runs: rest.reduce((n, r) => n + r.runs, 0) }] : sorted)
    .map(r => ({ ...r, cost: round(r.cost) }))
  // The costliest runs in the window: where to look when the spend looks wrong.
  const top = records.filter(r => byDay.has(key(Date.parse(r.at)))).sort((a, b) => (b.cost || 0) - (a.cost || 0)).slice(0, TOP_RUNS)
    .map(r => ({ id: r.id ?? null, at: r.at, repo: r.repo, name: r.name, cost: r.cost || 0, seconds: r.seconds || 0 }))
  return { days, repos, top, runs: count, cost: round(days.reduce((n, d) => n + d.cost, 0)), avgSeconds: count ? Math.round(seconds / count) : 0 }
}

export function groupsOf(records, agents) {
  return records.map(g => ({
    id: g.id, name: g.name, task: g.task, root: g.repo,
    members: g.branches.map(branch => {
      const a = agents.find(x => x.name === branch && norm(x.repoRoot) === norm(g.repo))
      return a
        ? { branch, id: a.id, state: a.state, doing: a.doing, add: a.add, del: a.del, files: a.files, cost: a.cost, pr: a.pr ? { num: a.pr.num, title: a.pr.title } : null, health: a.health, summary: lastLine(a.lastAnswer) }
        : { branch, id: null, state: 'idle', doing: 'Starting…', add: 0, del: 0, files: 0, cost: 0, pr: null, health: null, summary: '' }
    }),
  }))
}
