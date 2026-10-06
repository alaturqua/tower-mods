import type { TowerPending, TowerSession, TowerState } from '../types'

// One row of `claude agents --json`.
export type AgentRow = {
  sessionId: string
  pid?: number
  cwd: string
  kind?: string
  startedAt?: number
  name?: string
  status?: string
}

// beacon's status file, as far as the tower reads it.
export type StatusFile = {
  sessionId?: string
  label?: string
  state?: string
  message?: string | null
  pending?: TowerPending | null
  remoteAnswers?: boolean
  lastPrompt?: string | null
  lastAnswer?: string | null
  updatedAt?: string
}

export type TowerMessage =
  | { kind: 'prompt'; text: string }
  | { kind: 'answer'; pendingId: string; allow?: boolean; text?: string }

const RANK: Record<TowerState, number> = { 'needs-input': 0, working: 1, done: 2, idle: 3 }
const BEACON_STATES = new Set(['needs-input', 'working', 'done', 'idle'])

function folder(path: string) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

// The engine's live list is who exists; beacon's file, when there is one, says what each is doing.
export function merge(agents: readonly AgentRow[], statuses: Readonly<Record<string, StatusFile>>, selfId: string): TowerSession[] {
  const list = agents.filter(a => a.sessionId !== selfId).map(a => {
    const file = statuses[a.sessionId]
    const beacon = file && BEACON_STATES.has(file.state ?? '') ? file : undefined
    const isBusy = a.status === 'busy'
    let state: TowerState = isBusy ? 'working' : 'idle'
    if (beacon) state = beacon.state === 'working' && !isBusy ? 'idle' : (beacon.state as TowerState)
    const updated = beacon?.updatedAt ? Date.parse(beacon.updatedAt) : NaN
    return {
      id: a.sessionId,
      name: a.name ?? folder(a.cwd),
      label: beacon?.label ?? folder(a.cwd),
      cwd: a.cwd,
      kind: a.kind === 'background' ? 'background' : 'interactive',
      state,
      message: beacon?.message ?? null,
      pending: beacon?.pending ?? null,
      hasBeacon: Boolean(beacon),
      remoteAnswers: beacon?.remoteAnswers === true,
      lastPrompt: beacon?.lastPrompt ?? null,
      lastAnswer: beacon?.lastAnswer ?? null,
      updatedAt: Number.isNaN(updated) ? (a.startedAt ?? 0) : updated,
    } satisfies TowerSession
  })
  return list.sort((x, y) => RANK[x.state] - RANK[y.state] || y.updatedAt - x.updatedAt)
}

// What the tower sends: beacon reads the JSON; a session without it reads the words.
export function envelope(hasBeacon: boolean, msg: TowerMessage) {
  if (!hasBeacon) return msg.kind === 'prompt' ? msg.text : (msg.text ?? (msg.allow ? 'Approved.' : 'Denied.'))
  return `[tower] ${JSON.stringify({ v: 1, ...msg })}`
}

export function ago(then: number, now: number) {
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

export const MARK: Record<TowerState, string> = { 'needs-input': '!', working: '~', done: '✓', idle: '·' }

// Theme colors, so light and dark themes both read; idle is drawn dim instead.
export const COLOR: Record<TowerState, string | undefined> = { 'needs-input': 'warning', working: 'suggestion', done: 'success', idle: undefined }

// Which columns a session row has room for at this pane width.
export function columns(width: number) {
  return {
    showState: width >= 60,
    showMessage: width >= 90,
    labelWidth: width >= 60 ? 18 : Math.max(8, width - 14),
  }
}

export function tail(text: string, lines: number) {
  return text.split('\n').filter(line => line.trim()).slice(-lines).join('\n')
}
