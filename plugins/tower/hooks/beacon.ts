import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BeaconPending } from '../types'
import { currentRun } from './strip'

type $ = EngineInterface
type State = 'idle' | 'working' | 'needs-input' | 'done'
// `at`, when the cockpit sent it; a message through the tower pane has none.
type TowerMessage =
  | { v: 1; kind: 'prompt'; text: string; at?: string }
  | { v: 1; kind: 'answer'; pendingId: string; allow?: boolean; text?: string; at?: string }
// One line of the cockpit's live activity: who did what, newest last.
type Activity = { t: string; kind: 'you' | 'tool' | 'say' | 'wait' | 'sent' | 'fail'; text: string }

// Two alerts for the same moment (AskUserQuestion's tool call and the Notification
// hook it raises) collapse into the first.
const DEDUPE_MS = 5000
const QUIET_TYPES = new Set(['idle_prompt', 'auth_success'])
const TOWER_MARK = '[tower] '
const ACTIVITY_MAX = 30
const LOOP_AFTER = 3
const INBOX_MS = 1000

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
let activity: Activity[] = []
let lastState: State = 'idle'
let lastMessage: string | null = null
// The same call failing again and again: its key, and how many times in a row.
let failing = { key: '', count: 0, text: '' }
let inboxBusy = false
// Inbox lines this session has taken, for the cockpit to tell "queued" from "picked up".
let inboxSeen = 0
let inboxOn = false
// A message sent before this session could read it (it was not running yet, or ran an
// older Tower) is stale by the time it arrives; the grace covers a prompt sent at launch.
let startedAt = 0
const STALE_GRACE_MS = 30000

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

async function note($: $, kind: Activity['kind'], text: string) {
  const t = new Date(await $.clock.now()).toISOString()
  activity = [...activity, { t, kind, text: text.replace(/\s+/g, ' ').slice(0, 200) }].slice(-ACTIVITY_MAX)
}

// The status file the tower pane and the cockpit read for every session. A call without
// a state keeps the last one, so a tool call can refresh the activity without changing it.
async function report($: $, state?: State, message?: string | null) {
  if (state) lastState = state
  if (message !== undefined) lastMessage = message
  try {
    const repo = await $.session.repo().catch(() => null)
    const usage = await $.session.usage().catch(() => undefined)
    const waiting = await read($, pending)
    const run = currentRun()
    await $.fs.write(await statusPath($), JSON.stringify({
      sessionId: await $.session.id(),
      label: await getLabel($),
      cwd: await $.session.cwd(),
      remote: repo?.remote ?? null,
      model: await $.session.model(),
      mode: run.mode,
      effort: run.effort,
      contextPercent: usage?.context.percent ?? null,
      costUsd: usage?.cost?.usd ?? null,
      state: lastState,
      message: lastMessage,
      pending: waiting ? { ...waiting, key: undefined } : null,
      remoteAnswers: isRemote,
      // The cockpit may send here only when this session reads its inbox.
      canReceive: inboxOn,
      inboxSeen,
      health: failing.count >= LOOP_AFTER ? `Looping: ${failing.text} failed ${failing.count}× in a row` : null,
      lastPrompt,
      lastAnswer,
      activity,
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

// What the tower shows for a call: the command or path, else the input itself.
function describeInput(input: unknown) {
  const fields = (input ?? {}) as Record<string, unknown>
  const main = fields.command ?? fields.file_path ?? fields.path ?? fields.url ?? fields.pattern
  return (typeof main === 'string' ? main : JSON.stringify(input) ?? '').slice(0, 300)
}

// For an edit, the change as diff lines the cockpit can draw; nothing for other tools.
function diffOf(tool: string, input: unknown): BeaconPending['diff'] {
  const fields = (input ?? {}) as Record<string, unknown>
  const edits = Array.isArray(fields.edits) ? fields.edits as Record<string, unknown>[] : [fields]
  const lines: NonNullable<BeaconPending['diff']> = []
  for (const edit of edits) {
    const before = typeof edit.old_string === 'string' ? edit.old_string : undefined
    const after = typeof edit.new_string === 'string' ? edit.new_string : (tool === 'Write' && typeof fields.content === 'string' ? fields.content : undefined)
    if (after === undefined) continue
    lines.push([`@@ ${typeof fields.file_path === 'string' ? fields.file_path.split(/[\\/]/).pop() : ''} @@`, 'hunk'])
    for (const line of (before ?? '').split('\n').filter(Boolean)) lines.push([`- ${line}`, 'del'])
    for (const line of after.split('\n').filter(Boolean)) lines.push([`+ ${line}`, 'add'])
  }
  return lines.length ? lines.slice(0, 24) : undefined
}

// The agent's own last words before it asked: the reason the cockpit shows on the card.
async function reasonFor($: $) {
  const rows = await $.session.messages().catch(() => [])
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row?.role === 'assistant' && row.text?.trim()) return row.text.trim().split('\n').filter(Boolean).pop()?.slice(0, 200)
  }
  return undefined
}

async function waitFor($: $, item: Omit<BeaconPending, 'id' | 'since'>, alertKind: string, alertBody: string) {
  const now = await $.clock.now()
  const why = await reasonFor($)
  await update($, pending, () => ({ ...item, id: `p-${now}`, since: new Date(now).toISOString(), ...(why ? { why } : {}) }))
  await note($, 'wait', alertBody)
  // Written before the deny returns, so the tower sees the wait as soon as the model does.
  await report($, 'needs-input', alertBody)
  await alert($, alertKind, `${alertBody} (answer in the tower)`, 'needs-input')
}

// A `[tower] {json}` payload anywhere in a delivery, whatever envelope wraps it.
function parseTower(text: string): TowerMessage | undefined {
  const at = text.indexOf(TOWER_MARK)
  if (at < 0) return undefined
  return parseMessage(text.slice(text.indexOf('{', at), text.lastIndexOf('}') + 1))
}

function parseMessage(body: string): TowerMessage | undefined {
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
      await note($, 'sent', `Approved: ${waiting.detail ?? waiting.title}`)
      submit($, `Approved in the tower: retry ${waiting.title} ${waiting.detail ?? ''}`.trim())
    } else {
      await note($, 'sent', `Denied: ${waiting.detail ?? waiting.title}`)
      submit($, `Denied in the tower: do not run ${waiting.title} ${waiting.detail ?? ''}. Continue another way or ask.`)
    }
  } else {
    await note($, 'sent', `Answered: ${msg.text ?? ''}`)
    submit($, `Answer to your question "${waiting.title}": ${msg.text ?? ''}`)
  }
  await report($, 'working')
}

// A slash command from the tower runs as if typed (`/compact`, `/model sonnet`); any other
// text is a prompt. Never awaited: the command queues until the session is idle.
function runCommand($: $, text: string) {
  const [, command = '', args = ''] = /^\/(\S+)\s*([\s\S]*)$/.exec(text.trim()) ?? []
  void $.command.run({ command, args } as never).catch(err => $.ui.log(`beacon: /${command} from the tower failed: ${String(err)}`))
}

// The session's slash commands, for the cockpit's send box to suggest; written once at start.
async function publishCommands($: $) {
  try {
    const list = await $.command.list()
    const commands = list.map(c => ({ name: c.name, description: c.description.slice(0, 120) }))
    await $.fs.write(`${await towerDir($)}/commands/${await $.session.id()}.json`, JSON.stringify(commands))
  } catch {
    // Suggestions are a convenience; the commands still run when typed in full.
  }
}

// One instruction from the tower, by message or by inbox line.
async function obey($: $, msg: TowerMessage) {
  if (msg.kind === 'prompt' && msg.text.trim().startsWith('/')) {
    await note($, 'sent', msg.text.trim())
    runCommand($, msg.text)
    await report($)
  } else if (msg.kind === 'prompt') {
    await note($, 'sent', msg.text)
    submit($, msg.text)
    await report($)
  } else {
    await answer($, msg)
  }
}

// The cockpit appends instructions to inbox/<session>.jsonl; the lines already obeyed
// are counted in the store, so a reload or a restart never obeys one twice.
async function checkInbox($: $) {
  if (inboxBusy) return
  inboxBusy = true
  try {
    const id = await $.session.id()
    const path = `${await towerDir($)}/inbox/${id}.jsonl`
    if (!(await $.fs.exists(path).catch(() => false))) return
    const lines = String(await $.fs.read(path)).split('\n').filter(line => line.trim())
    const seenKey = `inbox:${id}`
    const seen = Number((await $.store.get(seenKey)) ?? 0)
    inboxSeen = Math.min(seen, lines.length)
    if (lines.length <= seen) return
    await $.store.set(seenKey, lines.length)
    inboxSeen = lines.length
    for (const line of lines.slice(seen)) {
      const msg = parseMessage(line)
      const at = msg?.at ? Date.parse(msg.at) : NaN
      if (msg && !(at < startedAt - STALE_GRACE_MS)) await obey($, msg)
    }
  } catch (err) {
    $.ui.log(`beacon: could not read the cockpit's inbox: ${String(err)}`)
  } finally {
    inboxBusy = false
  }
}

// The part in every session: status file, notifications, and the receiving end of the tower.
export const registerBeacon: Register = (on, options) => {
  notifyOnDone = options.notifyOnDone !== false
  minTurnMs = Number(options.minTurnSeconds ?? 30) * 1000
  notifyOnIdle = options.notifyOnIdle === true
  notifications = options.notifications !== false
  remoteAnswers = String(options.remoteAnswers ?? 'launched')
  const inboxMs = Number(options.inboxSeconds ?? 1) * 1000

  // The plugin's one unmatched session.start; the pane's and the status line's match every cwd.
  on('session.start', async ($, e, next) => {
    isRemote = remoteAnswers === 'always' || (remoteAnswers === 'launched'
      && await $.fs.exists(`${await towerDir($)}/launched/${await $.session.id()}.json`).catch(() => false))
    startedAt = await $.clock.now()
    inboxOn = inboxMs > 0
    void report($, 'idle')
    void publishCommands($)
    if (inboxOn) $.clock.every(inboxMs || INBOX_MS, () => { void checkInbox($) })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(e.origin.kind === 'plugin' && e.origin.name === 'tower')) {
      lastPrompt = e.text.slice(0, 500)
      await note($, 'you', e.text)
    }
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
    await obey($, msg)
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
    const diff = diffOf(e.tool, e.input)
    await waitFor($, { kind: 'permission', title: e.tool, detail, key, ...(diff ? { diff } : {}) }, 'Permission', `${e.tool}: ${detail}`)
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

  // Every main-loop tool call: one line of activity, and a count of the same call failing in a row.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.tool === 'AskUserQuestion') return result
    // A tool.call carries the tool's arguments beside its envelope fields.
    const { tool, tool_use_id: _id, agentId: _agent, ...args } = e as unknown as Record<string, unknown>
    const text = `${String(tool)} ${describeInput(args)}`.trim()
    const failed = 'isError' in result && result.isError === true
    if (failed) {
      const key = `${String(tool)}:${JSON.stringify(args)}`
      failing = key === failing.key ? { key, count: failing.count + 1, text } : { key, count: 1, text }
    } else {
      failing = { key: '', count: 0, text: '' }
    }
    await note($, failed ? 'fail' : 'tool', text)
    void report($)
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
    if (e.answer.trim()) {
      lastAnswer = e.answer.trim().slice(-PREVIEW_CHARS)
      await note($, 'say', e.answer.trim().split('\n').filter(Boolean).pop() ?? '')
    }
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
