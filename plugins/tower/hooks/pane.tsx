import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TowerSession } from '../types'
import { COLOR, MARK, ago, columns, envelope, merge, tail } from './model'
import type { AgentRow, StatusFile, TowerMessage } from './model'
import { setWaiting } from './strip'

type $ = EngineInterface

const PANE = 'tower'
const USAGE = 'Usage: /tower · /tower list · /tower send <session> <prompt> · /tower launch <repo path> <task> · /tower add <repo path>'
const COCKPIT_PS = `Start-Process -WindowStyle Hidden -FilePath node -ArgumentList (@('"' + $env:TOWER_SERVER + '"') + ($env:TOWER_FLAGS -split ' ')) `
// A session the tower starts is its own, not a child of the tower's.
const CHILD_ENV = { CLAUDECODE: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_CODE_CHILD_SESSION: '', CLAUDE_PID: '' }

const sessions = atom({ plugin: 'tower', key: 'sessions' } as const, [] as TowerSession[])
const selected = atom({ plugin: 'tower', key: 'selected' } as const, null as string | null)
const view = atom({ plugin: 'tower', key: 'view' } as const, 'list' as 'list' | 'launch')
const launchRepo = atom({ plugin: 'tower', key: 'launchRepo' } as const, null as string | null)
const failure = atom({ plugin: 'tower', key: 'error' } as const, null as string | null)

let pollMs = 3000
let polling: Promise<TowerSession[]> | undefined
// Polling starts the first time the tower is used in a session, not in every session the plugin runs in.
let isWatching = false

function folder(path: string) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

async function towerDir($: $) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
  return `${home}/.claude/tower`
}

// The running binary itself: the npm shim is a .cmd no argv call can start.
async function claudeExe($: $) {
  return (await $.env.get('CLAUDE_CODE_EXECPATH')) || 'claude'
}

async function readStatus($: $, dir: string, id: string): Promise<StatusFile | undefined> {
  try {
    return JSON.parse(String(await $.fs.read(`${dir}/sessions/${id}.json`)))
  } catch {
    return undefined
  }
}

async function pollOnce($: $) {
  try {
    const out = await $.process.run([await claudeExe($), 'agents', '--json'], { timeoutMs: 15000 })
    if (out.exitCode !== 0) throw new Error(out.stderr.trim() || `claude agents exited ${out.exitCode}`)
    const agents = JSON.parse(out.stdout) as AgentRow[]
    const dir = await towerDir($)
    const statuses: Record<string, StatusFile> = {}
    await Promise.all(agents.map(async a => {
      const file = await readStatus($, dir, a.sessionId)
      if (file) statuses[a.sessionId] = file
    }))
    const list = merge(agents, statuses, await $.session.id())
    await update($, sessions, () => list)
    await update($, failure, () => null)
    setWaiting(list.filter(s => s.state === 'needs-input').length)
    return list
  } catch (err) {
    await update($, failure, () => String(err instanceof Error ? err.message : err))
    return read($, sessions)
  }
}

// One poll at a time; a tick that finds one running shares its answer.
function poll($: $) {
  polling ??= pollOnce($).finally(() => { polling = undefined })
  return polling
}

// A poll nobody waits for; one that outlives its module (a reload) fails quietly.
function refresh($: $) {
  poll($).catch(() => {})
}

function find(list: readonly TowerSession[], who: string) {
  const w = who.toLowerCase()
  const exact = list.find(s => s.name.toLowerCase() === w || s.id === who)
  if (exact) return exact
  const byLabel = list.filter(s => s.label.toLowerCase() === w)
  if (byLabel.length) return byLabel[0]
  return list.find(s => s.id.startsWith(who) || s.name.toLowerCase().startsWith(w))
}

async function send($: $, s: TowerSession, msg: TowerMessage) {
  const res = await $.session.send({ to: { sessionId: s.id }, text: envelope(s.hasBeacon, msg) })
  refresh($)
  return res.isDelivered ? `Sent to ${s.label}.` : `Not delivered to ${s.label}: ${res.reason}`
}

// Typed text answers a pending question when the tower can; otherwise it is a new prompt.
async function sendText($: $, s: TowerSession, text: string) {
  if (s.pending?.kind === 'question' && s.remoteAnswers) return send($, s, { kind: 'answer', pendingId: s.pending.id, text })
  return send($, s, { kind: 'prompt', text })
}

async function jump($: $, s: TowerSession) {
  if (s.kind === 'background') {
    const ran = await $.process.run(['wt.exe', '-d', s.cwd, await claudeExe($), 'attach', s.id]).catch(() => undefined)
    return ran?.exitCode === 0 ? `Attached to ${s.label} in a new tab.` : `Couldn't open a terminal; run: claude attach ${s.id}`
  }
  // The window is found by process, the way the cockpit does: titles name the tab or the editor, not the session.
  if ((await $.env.get('OS')) === 'Windows_NT' && s.pid) {
    const script = `${$.plugin.root}/cockpit/lib/jump.ps1`
    const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { env: { TOWER_PID: String(s.pid) }, timeoutMs: 15000 })
      .catch(() => undefined)
    const app = ran?.stdout.split('	')[0]?.trim()
    if (ran?.exitCode === 0) return `Brought ${app || 'its window'} forward; ${s.label} is in one of its tabs.`
    if (app) return `Windows would not bring ${app} forward; switch to it yourself. ${s.label} runs in ${s.cwd}.`
  }
  return `Couldn't find its window; ${s.label} runs in ${s.cwd}.`
}

// The cockpit server outlives the session: started detached, it opens the browser itself,
// and a second start just opens the one already running.
async function startCockpit($: $, flags: string) {
  const server = `${$.plugin.root}/cockpit/server.mjs`
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const argv = isWindows
    ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', COCKPIT_PS]
    : ['sh', '-c', 'nohup node "$TOWER_SERVER" $TOWER_FLAGS >/dev/null 2>&1 &']
  const ran = await $.process.run(argv, { env: { TOWER_SERVER: server, TOWER_FLAGS: flags }, timeoutMs: 15000 }).catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  if (ran.exitCode !== 0) return `Couldn't start the cockpit (is Node.js 18+ installed?): ${ran.stderr.trim().slice(0, 200)}\nRun it yourself: node "${server}" ${flags}`
  return flags.includes('--restart') ? 'Restarting the Tower cockpit and opening it in your browser.' : 'Opening the Tower cockpit in your browser. It keeps running after this session; the link it opened works until it stops.'
}

async function stopCockpit($: $) {
  const stopped = await $.process.run(['node', `${$.plugin.root}/cockpit/server.mjs`, '--stop'], { timeoutMs: 10000 }).catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  return stopped.exitCode === 0 ? stopped.stdout.trim() : `Couldn't stop the cockpit: ${stopped.stderr.trim().slice(0, 200)}`
}

async function knownRepos($: $) {
  const saved = ((await $.store.get('repos')) as string[] | undefined) ?? []
  const live = (await read($, sessions)).map(s => s.cwd)
  const seen = new Map<string, string>()
  for (const repo of [...saved, ...live]) seen.set(repo.toLowerCase().replace(/[\\/]+$/, ''), repo)
  return [...seen.values()].sort((a, b) => folder(a).localeCompare(folder(b)))
}

async function remember($: $, repo: string) {
  const saved = ((await $.store.get('repos')) as string[] | undefined) ?? []
  if (!saved.some(r => r.toLowerCase() === repo.toLowerCase())) await $.store.set('repos', [...saved, repo])
}

async function launch($: $, repo: string, task: string) {
  const id = crypto.randomUUID()
  const name = `${folder(repo)}-${id.slice(0, 4)}`
  // Written first: beacon in the new session reads it at session.start.
  await $.fs.write(`${await towerDir($)}/launched/${id}.json`, JSON.stringify({ repo, task, launchedAt: new Date(await $.clock.now()).toISOString() }))
  const ran = await $.process.run([await claudeExe($), '--bg', '--session-id', id, '--name', name, '--', task], { cwd: repo, env: CHILD_ENV, timeoutMs: 60000 })
    .catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  if (ran.exitCode !== 0) return `Couldn't start a session in ${repo}: ${(ran.stderr || ran.stdout).trim().slice(0, 200)}`
  await remember($, repo)
  refresh($)
  return `Started ${name} in ${repo}.`
}

function rowText(s: TowerSession, now: number, width: number) {
  const what = s.pending ? `${s.pending.title}: ${s.pending.detail ?? ''}` : (s.message ?? '')
  const tag = s.kind === 'background' ? ' (bg)' : ''
  const head = `${MARK[s.state]} ${(s.label + tag).padEnd(18)} ${s.state.padEnd(11)} `
  const tail = ` ${ago(s.updatedAt, now)}`
  const room = Math.max(0, width - head.length - tail.length - 4)
  return head + what.replace(/\s+/g, ' ').slice(0, room).padEnd(room) + tail
}

// `launch "D:\My Repo" the task` or `launch D:\repo the task`.
function splitPath(rest: string): [string, string] {
  const quoted = /^"([^"]+)"\s*(.*)$/s.exec(rest)
  if (quoted) return [quoted[1] ?? '', quoted[2] ?? '']
  const at = rest.search(/\s/)
  return at < 0 ? [rest, ''] : [rest.slice(0, at), rest.slice(at).trim()]
}

async function runCommand($: $, args: string): Promise<string> {
  const [verb = '', ...words] = args.trim().split(/\s+/)
  const rest = args.trim().slice(verb.length).trim()
  if (verb === 'list') {
    const list = await poll($)
    const now = await $.clock.now()
    return list.length ? list.map(s => rowText(s, now, 100).trimEnd()).join('\n') : 'No other sessions are running.'
  }
  if (verb === 'send') {
    const [who = '', ...text] = words
    const list = await poll($)
    const target = find(list, who)
    if (!target || !text.length) return `No session "${who}". Running: ${list.map(s => s.label).join(', ') || 'none'}.`
    return sendText($, target, rest.slice(who.length).trim())
  }
  if (verb === 'launch') {
    const [repo, task] = splitPath(rest)
    if (!repo || !task) return USAGE
    return launch($, repo, task)
  }
  if (verb === 'add') {
    if (!rest) return USAGE
    await remember($, splitPath(rest)[0])
    return `Remembered ${rest}.`
  }
  return USAGE
}

// The control pane and its /tower command.
export const registerPane: Register = (on, options) => {
  pollMs = Number(options.pollSeconds ?? 3) * 1000

  // The /tower command. Polling waits until it is first used.
  on('session.start', { cwd: /(?:)/ }, async ($, e, next) => {
    await $.command.register({ name: 'tower', description: 'Watch and steer every running Claude Code session', argumentHint: '[list | send <session> <prompt> | launch <repo> <task> | add <repo>]' })
    await $.command.register({ name: 'cockpit', description: 'Open the Tower cockpit, a web dashboard over every session, in your browser', argumentHint: '[restart | stop]' })
    return next(e)
  })

  // The cockpit server outlives this session: started detached, it opens the browser itself,
  // and a second start just opens the one already running.
  // /cockpit opens it; /cockpit restart replaces it (after an update); /cockpit stop stops it.
  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const verb = e.args.trim().toLowerCase()
    if (verb === 'stop') return { text: await stopCockpit($) }
    return { text: await startCockpit($, verb === 'restart' ? '--restart --open' : '--open') }
  })

  on('command.run', { command: 'tower' }, async ($, e) => {
    if (!isWatching && pollMs > 0) {
      isWatching = true
      $.clock.every(pollMs, () => refresh($))
    }
    if (e.args.trim()) return { text: await runCommand($, e.args) }
    await update($, view, () => 'list')
    refresh($)
    await $.ui.open({ id: PANE, title: 'Tower', focus: true, columns: 110, rows: 24 })
    return { text: 'Tower opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // Mobile has no text field or picker to steer with.
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>Open the tower in a terminal to steer sessions.</Text>
    }
    const { Box, Text, Button, Input, Select } = $.ui.resolve(e)
    const width = (e.props as { bodyColumns?: number }).bodyColumns ?? e.viewport?.columns ?? 80
    const toast = (text: string) => $.ui.toast(text)

    if ((await read($, view)) === 'launch') {
      const repos = await knownRepos($)
      const repo = (await read($, launchRepo)) ?? repos[0] ?? null
      return (
        <Box flexDirection="column">
          <Text bold>New session</Text>
          {repos.length === 0
            ? <Text dimColor>No repos known yet. Add one with /tower add &lt;path&gt;.</Text>
            : <Select key="repo" label="Repo" value={repo ?? undefined} options={repos.map(r => ({ value: r, label: `${folder(r)}  ${r}` }))}
                onSelect={value => void update($, launchRepo, () => value)} />}
          {repo && <Input key="task" label={`Task for ${folder(repo)}`} placeholder="What should it do?" autoFocus submitLabel="launch"
            onSubmit={task => {
              if (!task.trim()) return
              void launch($, repo, task.trim()).then(toast)
              void update($, view, () => 'list')
            }} />}
          <Box gap={1}>
            <Button key="back" hotkey="b" onPress={() => void update($, view, () => 'list')}>Back</Button>
          </Box>
        </Box>
      )
    }

    const list = await read($, sessions)
    const error = await read($, failure)
    const now = await $.clock.now()
    const chosen = await read($, selected)
    const target = list.find(s => s.id === chosen) ?? list[0]
    const waiting = list.filter(s => s.state === 'needs-input').length
    const pending = target?.remoteAnswers ? target.pending : null
    // Side by side when there is room, stacked when there is not.
    const wide = width >= 84
    const listWidth = 34
    // A few lines of the answer's end, each cut to one line: the cockpit has the rest.
    const previewLines = Math.min(6, Math.max(2, (e.viewport?.rows ?? 30) - (wide ? 18 : list.length + 18)))

    const row = (s: TowerSession) => {
      const isChosen = s.id === target?.id
      const what = s.pending ? `${s.pending.title}: ${s.pending.detail ?? ''}` : (s.message ?? '')
      const cols = columns(wide ? listWidth : width)
      const name = (s.label + (s.kind === 'background' ? ' (bg)' : '')).slice(0, wide ? 20 : cols.labelWidth).padEnd(wide ? 20 : cols.labelWidth)
      return (
        <Box key={`row-${s.id}`} gap={1}>
          <Text color={COLOR[s.state]} dimColor={s.state === 'idle'} bold={isChosen}>{isChosen ? '▸' : ' '}{MARK[s.state]}</Text>
          <Button key={`pick-${s.id}`} plain onPress={() => void update($, selected, () => s.id)}>{name}</Button>
          {!wide && cols.showState && <Text color={COLOR[s.state]} dimColor={s.state === 'idle'}>{s.state.padEnd(11)}</Text>}
          <Box flexGrow={1}>{!wide && cols.showMessage && <Text dimColor wrap="truncate-end">{what.replace(/\s+/g, ' ')}</Text>}</Box>
          <Text dimColor>{ago(s.updatedAt, now)}</Text>
        </Box>
      )
    }

    // The list in the order that matters: who needs you, who works, the rest.
    const groups: [string, TowerSession[]][] = [
      ['NEEDS YOU', list.filter(s => s.state === 'needs-input')],
      ['WORKING', list.filter(s => s.state === 'working')],
      ['DONE AND IDLE', list.filter(s => s.state === 'done' || s.state === 'idle')],
    ]
    const sessionList = (
      <Box flexDirection="column" width={wide ? listWidth : undefined}>
        {list.length === 0 && <Text dimColor>No other sessions are running. Press n to start one.</Text>}
        {groups.filter(([, members]) => members.length > 0).map(([title, members], i) => (
          <Box key={`group-${title}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
            <Text dimColor bold>{title}</Text>
            {members.map(row)}
          </Box>
        ))}
      </Box>
    )

    const answerLines = target?.lastAnswer ? tail(target.lastAnswer, previewLines).split('\n') : []
    const detail = target && (
      <Box flexDirection="column" flexGrow={1} flexShrink={1} gap={1} borderStyle="round" borderColor={target.pending ? 'warning' : undefined} borderDimColor={!target.pending} paddingX={1}>
        <Box flexDirection="column">
          <Text bold wrap="truncate-end">{target.label}{target.kind === 'background' ? ' (bg)' : ''}</Text>
          <Text dimColor wrap="truncate-middle">{target.cwd}{target.hasBeacon ? '' : ' · no beacon'}</Text>
        </Box>
        {target.pending && !pending && <Text color="warning">Waiting in its terminal: {target.pending.title} {target.pending.detail ?? ''}</Text>}
        {pending?.kind === 'permission' && (
          <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
            <Text color="warning" bold>Needs approval</Text>
            <Text wrap="truncate-end">{pending.title} {pending.detail ?? ''}</Text>
            <Box gap={1}>
              <Button key="allow" hotkey="a" variant="primary" onPress={() => void send($, target, { kind: 'answer', pendingId: pending.id, allow: true }).then(toast)}>Allow</Button>
              <Button key="deny" hotkey="d" onPress={() => void send($, target, { kind: 'answer', pendingId: pending.id, allow: false }).then(toast)}>Deny</Button>
            </Box>
          </Box>
        )}
        {pending?.kind === 'question' && (
          <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
            <Text color="warning" bold>Asks</Text>
            <Text>{pending.title}</Text>
            <Box gap={1} flexWrap="wrap">
              {(pending.options ?? []).slice(0, 4).map((label, i) => (
                <Button key={`opt-${i}`} hotkey={String(i + 1)} onPress={() => void send($, target, { kind: 'answer', pendingId: pending.id, text: label }).then(toast)}>{label}</Button>
              ))}
            </Box>
          </Box>
        )}
        {!target.pending && target.message && target.state !== 'done' && <Text color={COLOR[target.state]} wrap="truncate-end">{target.message}</Text>}
        {target.lastPrompt && (
          <Box gap={1}>
            <Text bold>You</Text>
            <Box flexGrow={1}><Text dimColor wrap="truncate-end">{target.lastPrompt.replace(/\s+/g, ' ')}</Text></Box>
          </Box>
        )}
        {answerLines.length > 0 && (
          <Box gap={1}>
            <Text bold color="suggestion">Claude</Text>
            <Box flexGrow={1} flexDirection="column">
              {answerLines.map((line, i) => <Text key={`line-${i}`} wrap="truncate-end">{line}</Text>)}
            </Box>
          </Box>
        )}
        {!target.hasBeacon && <Text dimColor>No preview: this session runs without beacon.</Text>}
        <Input key={`say-${target.id}`} placeholder={pending?.kind === 'question' ? `Answer ${target.label}…` : `Send to ${target.label}…`} submitLabel="send"
          onSubmit={text => { if (text.trim()) void sendText($, target, text.trim()).then(toast) }} />
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={1}>
          <Text bold>Tower</Text>
          <Text dimColor>· {list.length} session{list.length === 1 ? '' : 's'}</Text>
          {waiting > 0 && <Text color="warning" bold>· {waiting} need{waiting === 1 ? 's' : ''} you</Text>}
        </Box>
        {error && <Text color="warning">Stale: {error}</Text>}
        {wide
          ? <Box gap={1}>{sessionList}{detail}</Box>
          : <Box flexDirection="column" gap={1}>{sessionList}{detail}</Box>}
        <Box gap={1} flexWrap="wrap">
          {target && <Button key="jump" hotkey="j" onPress={() => void jump($, target).then(toast)}>Jump</Button>}
          <Button key="new" hotkey="n" onPress={() => void update($, view, () => 'launch')}>New session</Button>
          <Button key="cockpit" hotkey="o" onPress={() => void startCockpit($, '--open').then(toast)}>Open cockpit</Button>
          <Button key="refresh" hotkey="r" onPress={() => refresh($)}>Refresh</Button>
        </Box>
      </Box>
    )
  })
}
