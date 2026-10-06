import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BeaconPending } from '../types'

type $ = EngineInterface
type State = 'idle' | 'working' | 'needs-input' | 'done'
type TowerMessage =
  | { v: 1; kind: 'prompt'; text: string }
  | { v: 1; kind: 'answer'; pendingId: string; allow?: boolean; text?: string }

// Two alerts for the same moment (AskUserQuestion's tool call and the Notification
// hook it raises) collapse into the first.
const DEDUPE_MS = 5000
const QUIET_TYPES = new Set(['idle_prompt', 'auth_success'])
const TOWER_MARK = '[tower] '

const pending = atom({ plugin: 'tower', key: 'pending' } as const, null as BeaconPending | null)
const approvals = atom({ plugin: 'tower', key: 'approvals' } as const, [] as string[])

const WIN_TOAST = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$t = [Security.SecurityElement]::Escape($env:BEACON_TITLE)
$b = [Security.SecurityElement]::Escape($env:BEACON_BODY)
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$t</text><text>$b</text></binding></visual><audio src='ms-winsoundevent:Notification.Reminder'/></toast>")
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))
`

let notifyOnDone = true
let minTurnMs = 30000
let notifyOnIdle = false
let notifications = true
let remoteAnswers = 'launched'
// Whether this session sends its dialogs to the tower; settled at session.start.
let isRemote = false
let label = ''
let lastAlertAt = 0
// The tower's preview of the conversation: what was last asked, and how the last answer ended.
let lastPrompt: string | null = null
let lastAnswer: string | null = null
const PREVIEW_CHARS = 1500

async function getLabel($: $) {
  if (label) return label
  const repo = await $.session.repo().catch(() => null)
  const dir = repo?.root ?? (await $.session.cwd())
  label = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || dir
  return label
}

async function towerDir($: $) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
  return `${home}/.claude/tower`
}

async function statusPath($: $) {
  return `${await towerDir($)}/sessions/${await $.session.id()}.json`
}

// The status file the tower pane (or anything else) can read for every session.
async function report($: $, state: State, message?: string) {
  try {
    const repo = await $.session.repo().catch(() => null)
    const waiting = await read($, pending)
    await $.fs.write(await statusPath($), JSON.stringify({
      sessionId: await $.session.id(),
      label: await getLabel($),
      cwd: await $.session.cwd(),
      remote: repo?.remote ?? null,
      model: await $.session.model(),
      state,
      message: message ?? null,
      pending: waiting ? { ...waiting, key: undefined } : null,
      remoteAnswers: isRemote,
      lastPrompt,
      lastAnswer,
      updatedAt: new Date(await $.clock.now()).toISOString(),
    }, null, 2))
  } catch {
    // A status file is best effort; never let it break the session.
  }
}

async function desktopNotify($: $, title: string, body: string) {
  const env = { BEACON_TITLE: title, BEACON_BODY: body.slice(0, 240) }
  if ((await $.env.get('OS')) === 'Windows_NT') {
    await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', WIN_TOAST], { env, timeoutMs: 15000 })
    return
  }
  const mac = await $.process.run(
    ['osascript', '-e', 'display notification (system attribute "BEACON_BODY") with title (system attribute "BEACON_TITLE")'],
    { env },
  ).catch(() => undefined)
  if (mac?.exitCode !== 0) await $.process.run(['notify-send', title, body], { env }).catch(() => undefined)
}

// Fire and forget: a notification must never hold up the dialog it announces.
async function alert($: $, kind: string, body: string, state: State) {
  const now = await $.clock.now()
  void report($, state, body)
  if (!notifications || now - lastAlertAt < DEDUPE_MS) return
  lastAlertAt = now
  const title = `${kind} · ${await getLabel($)}`
  void desktopNotify($, title, body).catch(err => $.ui.log(`beacon: notification failed: ${String(err)}`))
}

// What the tower shows for a permission: the command or path, else the input itself.
function describeInput(input: unknown) {
  const fields = (input ?? {}) as Record<string, unknown>
  const main = fields.command ?? fields.file_path ?? fields.path ?? fields.url ?? fields.pattern
  return (typeof main === 'string' ? main : JSON.stringify(input) ?? '').slice(0, 300)
}

async function waitFor($: $, item: Omit<BeaconPending, 'id'>, alertKind: string, alertBody: string) {
  const id = `p-${await $.clock.now()}`
  await update($, pending, () => ({ ...item, id }))
  // Written before the deny returns, so the tower sees the wait as soon as the model does.
  await report($, 'needs-input', alertBody)
  await alert($, alertKind, `${alertBody} (answer in the tower)`, 'needs-input')
}

// A `[tower] {json}` payload anywhere in a delivery, whatever envelope wraps it.
function parseTower(text: string): TowerMessage | undefined {
  const at = text.indexOf(TOWER_MARK)
  if (at < 0) return undefined
  const body = text.slice(text.indexOf('{', at), text.lastIndexOf('}') + 1)
  try {
    const msg = JSON.parse(body)
    return msg?.v === 1 && (msg.kind === 'prompt' || msg.kind === 'answer') ? msg : undefined
  } catch {
    return undefined
  }
}

// Queued as the person's own words; runs once the session is idle. Never awaited:
// inside a running turn the call waits for that turn.
function submit($: $, text: string) {
  // Our own submit skips our prompt.submit hook, so the preview is set here.
  lastPrompt = text.slice(0, 500)
  void $.prompt.submit({ text, asUser: true }).catch(err => $.ui.log(`beacon: could not submit the tower's prompt: ${String(err)}`))
}

async function answer($: $, msg: Extract<TowerMessage, { kind: 'answer' }>) {
  const waiting = await read($, pending)
  if (!waiting || waiting.id !== msg.pendingId) {
    $.ui.log(`beacon: dropped a tower answer for ${msg.pendingId}; nothing like it is pending`)
    return
  }
  await update($, pending, () => null)
  if (waiting.kind === 'permission') {
    if (msg.allow) {
      await update($, approvals, keys => [...keys, waiting.key ?? ''])
      submit($, `Approved in the tower: retry ${waiting.title} ${waiting.detail ?? ''}`.trim())
    } else {
      submit($, `Denied in the tower: do not run ${waiting.title} ${waiting.detail ?? ''}. Continue another way or ask.`)
    }
  } else {
    submit($, `Answer to your question "${waiting.title}": ${msg.text ?? ''}`)
  }
  await report($, 'working')
}

// The part in every session: status file, notifications, and the receiving end of the tower.
export const registerBeacon: Register = (on, options) => {
  notifyOnDone = options.notifyOnDone !== false
  minTurnMs = Number(options.minTurnSeconds ?? 30) * 1000
  notifyOnIdle = options.notifyOnIdle === true
  notifications = options.notifications !== false
  remoteAnswers = String(options.remoteAnswers ?? 'launched')

  // The plugin's one unmatched session.start; the pane's and the status line's match every cwd.
  on('session.start', async ($, e, next) => {
    isRemote = remoteAnswers === 'always' || (remoteAnswers === 'launched'
      && await $.fs.exists(`${await towerDir($)}/launched/${await $.session.id()}.json`).catch(() => false))
    void report($, 'idle')
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(e.origin.kind === 'plugin' && e.origin.name === 'tower')) lastPrompt = e.text.slice(0, 500)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, pending, () => null)
    void report($, 'working')
    return next(e)
  })

  on('session.receive', async ($, e, next) => {
    const msg = parseTower(e.text)
    if (!msg) return next(e)
    if (msg.kind === 'prompt') submit($, msg.text)
    else await answer($, msg)
    return { consumed: 'a tower instruction' }
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (!isRemote || verdict.decision !== 'ask' || !e.tool_use_id) return verdict
    const key = `${e.tool}:${JSON.stringify(e.input)}`
    const keys = await read($, approvals)
    if (keys.includes(key)) {
      await update($, approvals, list => list.filter(k => k !== key))
      return { decision: 'allow', reason: 'Approved in the tower' }
    }
    const detail = describeInput(e.input)
    await waitFor($, { kind: 'permission', title: e.tool, detail, key }, 'Permission', `${e.tool}: ${detail}`)
    return { decision: 'deny', reason: 'Waiting for approval in the tower. End your turn now; you will be told when to retry.' }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const first = e.questions?.[0]
    if (first && isRemote) {
      const options = first.options.map(o => o.label)
      await waitFor($, { kind: 'question', title: first.question, options }, 'Question', first.question)
      return { deny: 'The question was sent to the person in the tower. End your turn now; their answer arrives as the next message.' }
    }
    if (first) await alert($, 'Question', first.question, 'needs-input')
    const result = await next(e)
    void report($, 'working')
    return result
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (!e.agent_id && (notifyOnIdle || !QUIET_TYPES.has(e.notification_type))) {
      const kind = e.notification_type === 'permission_prompt' ? 'Permission' : 'Needs you'
      await alert($, kind, e.message, 'needs-input')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    if (e.answer.trim()) lastAnswer = e.answer.trim().slice(-PREVIEW_CHARS)
    const waiting = await read($, pending)
    await report($, waiting ? 'needs-input' : 'done', waiting ? waiting.title : e.answer.slice(0, 200))
    if (!waiting && notifyOnDone && !e.isAborted && e.durationMs >= minTurnMs) {
      const secs = Math.round(e.durationMs / 1000)
      await alert($, 'Done', `${secs}s · ${e.answer.split('\n')[0]?.slice(0, 160) || 'Turn finished'}`, 'done')
    }
    return result
  })

  on('session.end', async ($, e, next) => {
    const path = await statusPath($).catch(() => undefined)
    if (path) await $.fs.write(path, JSON.stringify({ sessionId: await $.session.id(), state: 'ended' })).catch(() => {})
    return next(e)
  })
}
