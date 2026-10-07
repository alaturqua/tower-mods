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

// What a pending request looks like on a card. A session that keeps its own dialogs still
// shows what it waits on, as a local wait the cockpit can only jump to.
export function pendingOf(status, state) {
  const p = status?.pending
  if (p) {
    const detail = p.kind === 'question' ? p.title : (p.detail ?? p.title)
    return {
      id: p.id, kind: p.kind === 'question' ? 'question' : (p.diff ? 'edit' : 'permission'), remote: true,
      title: p.title, detail, why: p.why ?? null, options: p.options ?? [], diff: p.diff ?? null,
      risk: p.kind === 'question' ? null : riskOf(detail), since: p.since ?? null,
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
    .map(r => ({ root: r.root, name: r.name, worktrees: [...r.worktrees.values()] }))
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
