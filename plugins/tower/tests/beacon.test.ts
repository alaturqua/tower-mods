import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// The test runtime has timers; the hooks module's typings leave them out.
declare const setTimeout: (fn: () => void, ms: number) => unknown

type Run ={ argv: readonly string[]; env: Record<string, string> }

// The engine beneath the plugin: a Windows host in a repo called "dbt-platform".
// `launched` makes the tower's marker file for this session exist.
function stubHost(on: On, os = 'Windows_NT', launched = false) {
  const runs: Run[] = []
  const writes: { path: string; text: string }[] = []
  const prompts: string[] = []
  let ran: () => void = () => {}
  const firstRun = new Promise<void>(resolve => { ran = resolve })

  on('fs.exists', (_$, e) => ({ value: (launched && /[\\/]tower[\\/]launched[\\/]sess-1\.json$/.test(e.path)) || e.path.replace(/\\/g, '/') in files }))
  on('prompt.submit', (_$, e) => { prompts.push(e.text); return { text: e.text } })
  const env: Record<string, string> = { OS: os, USERPROFILE: 'C:/Users/me' }
  on('env.get', (_$, e) => ({ value: env[e.name] }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: 'D:/Projects/dbt-platform' }))
  on('session.repo', () => ({ value: { root: 'D:/Projects/dbt-platform', name: 'dbt-platform', remote: null, internal: false } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', () => ({ value: Date.now() }))
  on('fs.write', (_$, e) => { writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  on('ui.log', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 37 }, rateLimits: [], cost: { usd: 0.42 } } }) as never)
  on('session.messages', () => ({ value: [{ role: 'assistant', text: 'All 12 models build.\nReady to push.', toolUses: [] }] }) as never)
  const store: Record<string, unknown> = {}
  on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
  on('store.set', (_$, e) => { store[e.key] = e.value; return { value: undefined } })
  // The inbox timer ticks `ticks` times, then waits forever.
  let ticks = 0
  on('clock.every', () => (ticks-- > 0 ? { value: undefined } : new Promise(() => {})) as never)
  const files: Record<string, string> = {}
  on('fs.read', (_$, e) => {
    const text = files[e.path.replace(/\\/g, '/')]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text } as never
  })
  on('process.run', (_$, e) => {
    runs.push({ argv: e.argv, env: e.init?.env ?? {} })
    ran()
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const lastStatus = () => {
    const mine = writes.filter(w => /sessions[\\/]sess-1\.json$/.test(w.path))
    return JSON.parse(mine[mine.length - 1]?.text ?? '{}')
  }
  const tick = (n: number) => { ticks = n }
  return { runs, writes, prompts, firstRun, lastStatus, files, store, tick }
}

const INBOX = 'C:/Users/me/.claude/tower/inbox/sess-1.jsonl'

test('a prompt the cockpit appends to the inbox is submitted once', async ($, on) => {
  const host = stubHost(on)
  on('session.start', () => ({ cwd: 'D:/Projects/dbt-platform' }))
  host.files[INBOX] = JSON.stringify({ v: 1, kind: 'prompt', text: 'run the tests' }) + '\n'
  host.tick(2)
  await $.session.start({ source: 'startup', cwd: 'D:/Projects/dbt-platform' } as never)
  await new Promise(resolve => setTimeout(() => resolve(undefined), 50))

  expect(host.prompts).toEqual(['run the tests'])
  expect(host.store['inbox:sess-1']).toBe(1)
  expect(host.lastStatus().activity.at(-1)).toMatchObject({ kind: 'sent', text: 'run the tests' })
})

test('a slash command from the tower runs as a command, not as text', async ($, on) => {
  const host = stubHost(on)
  const ran: { command: string; args: string }[] = []
  on('command.run', (_$, e) => { ran.push({ command: e.command, args: e.args }); return { text: '' } })
  on('session.receive', (_$, e) => ({ text: e.text }))

  await $.session.receive({ origin: { kind: 'peer' }, text: tower({ kind: 'prompt', text: '/model sonnet' }) })
  await new Promise(resolve => setTimeout(() => resolve(undefined), 20))

  expect(ran).toEqual([{ command: 'model', args: 'sonnet' }])
  expect(host.prompts.length).toBe(0)
})

test('the session publishes its slash commands for the cockpit to suggest', async ($, on) => {
  const host = stubHost(on)
  on('session.start', () => ({ cwd: 'D:/Projects/dbt-platform' }))
  on('command.list', () => ({ value: [{ name: 'compact', description: 'Compact the conversation', source: 'builtin' }] }) as never)
  await $.session.start({ source: 'startup', cwd: 'D:/Projects/dbt-platform' } as never)
  await new Promise(resolve => setTimeout(() => resolve(undefined), 20))

  const file = host.writes.find(w => /commands[\\/]sess-1\.json$/.test(w.path))
  expect(JSON.parse(file?.text ?? '[]')).toEqual([{ name: 'compact', description: 'Compact the conversation' }])
})

test('the status file carries usage, activity, and a loop of the same failing call', async ($, on) => {
  const host = stubHost(on)
  on('tool.call', () => ({ isError: true, result: 'exit 1', text: 'exit 1' }) as never)

  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await new Promise(resolve => setTimeout(() => resolve(undefined), 20))

  const status = host.lastStatus()
  expect(status).toMatchObject({ contextPercent: 37, costUsd: 0.42 })
  expect(status.activity.at(-1)).toMatchObject({ kind: 'fail', text: 'Bash npm test' })
  expect(status.health).toContain('failed 3× in a row')
})

test('a held edit carries its diff and the agent\'s reason', { options: { remoteAnswers: 'always' } }, async ($, on) => {
  const host = stubHost(on)
  on('session.start', () => ({ cwd: 'D:/Projects/dbt-platform' }))
  on('tool.check', () => ({ decision: 'ask' as const }))
  await $.session.start({ source: 'startup', cwd: 'D:/Projects/dbt-platform' } as never)

  await $.tool.check({ tool: 'Edit', input: { file_path: 'src/auth.ts', old_string: 'if (!ok) deny()', new_string: 'if (!(await check())) deny()' }, tool_use_id: 'tu-1' })

  const pending = host.lastStatus().pending
  expect(pending.why).toBe('Ready to push.')
  expect(pending.diff).toEqual([['@@ auth.ts @@', 'hunk'], ['- if (!ok) deny()', 'del'], ['+ if (!(await check())) deny()', 'add']])
})

const tower = (msg: object) => `[tower] ${JSON.stringify({ v: 1, ...msg })}`

test('a tower prompt is consumed and submitted as the person\'s own', async ($, on) => {
  const host = stubHost(on)
  on('session.receive', (_$, e) => ({ text: e.text }))

  const got = await $.session.receive({ origin: { kind: 'peer' }, text: tower({ kind: 'prompt', text: 'run the tests' }) })

  expect(got.consumed).toBeTruthy()
  expect(host.prompts).toEqual(['run the tests'])
})

test('a plain peer message passes through untouched', async ($, on) => {
  const host = stubHost(on)
  on('session.receive', (_$, e) => ({ text: e.text }))

  const got = await $.session.receive({ origin: { kind: 'peer' }, text: 'hello from another session' })

  expect(got.text).toBe('hello from another session')
  expect(host.prompts.length).toBe(0)
})

test('in a launched session a permission ask waits for the tower, then runs once', async ($, on) => {
  const host = stubHost(on, 'Windows_NT', true)
  on('session.start', () => ({ cwd: 'D:/Projects/dbt-platform' }))
  on('session.receive', (_$, e) => ({ text: e.text }))
  on('tool.check', () => ({ decision: 'ask' as const }))
  await $.session.start({ source: 'startup', cwd: 'D:/Projects/dbt-platform' } as never)

  const call = { tool: 'Bash', input: { command: 'git push origin main' }, tool_use_id: 'tu-1' }
  const first = await $.tool.check(call)
  expect(first.decision).toBe('deny')
  const pending = host.lastStatus().pending
  expect(pending).toMatchObject({ kind: 'permission', title: 'Bash', detail: 'git push origin main' })
  expect(host.lastStatus().state).toBe('needs-input')

  await $.session.receive({ origin: { kind: 'peer' }, text: tower({ kind: 'answer', pendingId: pending.id, allow: true }) })
  expect(host.prompts[0]).toContain('Approved in the tower')

  expect((await $.tool.check({ ...call, tool_use_id: 'tu-2' })).decision).toBe('allow')
  expect((await $.tool.check({ ...call, tool_use_id: 'tu-3' })).decision).toBe('deny')
})

test('a denied permission tells the model not to run it', async ($, on) => {
  const host = stubHost(on, 'Windows_NT', true)
  on('session.start', () => ({ cwd: 'D:/Projects/dbt-platform' }))
  on('session.receive', (_$, e) => ({ text: e.text }))
  on('tool.check', () => ({ decision: 'ask' as const }))
  await $.session.start({ source: 'startup', cwd: 'D:/Projects/dbt-platform' } as never)

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'tu-1' })
  const { id } = host.lastStatus().pending
  await $.session.receive({ origin: { kind: 'peer' }, text: tower({ kind: 'answer', pendingId: id, allow: false }) })

  expect(host.prompts[0]).toContain('Denied in the tower')
  expect(host.lastStatus().pending).toBe(null)
})

test('in a launched session a question goes to the tower and the answer comes back as a prompt', async ($, on) => {
  const host = stubHost(on, 'Windows_NT', true)
  on('session.start', () => ({ cwd: 'D:/Projects/dbt-platform' }))
  on('session.receive', (_$, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'asked locally' }) as never)
  await $.session.start({ source: 'startup', cwd: 'D:/Projects/dbt-platform' } as never)

  const got = await $.tool.call({
    tool: 'AskUserQuestion',
    questions: [{ question: 'Which env?', header: 'Env', multiSelect: false, options: [{ label: 'prod', description: '' }, { label: 'staging', description: '' }] }],
  } as never)
  expect('deny' in got && got.deny).toContain('tower')
  const pending = host.lastStatus().pending
  expect(pending).toMatchObject({ kind: 'question', title: 'Which env?', options: ['prod', 'staging'] })

  await $.session.receive({ origin: { kind: 'peer' }, text: tower({ kind: 'answer', pendingId: pending.id, text: 'staging' }) })
  expect(host.prompts[0]).toBe('Answer to your question "Which env?": staging')
})

test('a session started by hand keeps its own dialogs', async ($, on) => {
  stubHost(on)
  on('session.start', () => ({ cwd: 'D:/Projects/dbt-platform' }))
  on('tool.check', () => ({ decision: 'ask' as const }))
  await $.session.start({ source: 'startup', cwd: 'D:/Projects/dbt-platform' } as never)

  const got = await $.tool.check({ tool: 'Bash', input: { command: 'git push' }, tool_use_id: 'tu-1' })

  expect(got.decision).toBe('ask')
})

test('remoteAnswers "always" takes over a hand-started session too', { options: { remoteAnswers: 'always' } }, async ($, on) => {
  stubHost(on)
  on('session.start', () => ({ cwd: 'D:/Projects/dbt-platform' }))
  on('tool.check', () => ({ decision: 'ask' as const }))
  await $.session.start({ source: 'startup', cwd: 'D:/Projects/dbt-platform' } as never)

  const got = await $.tool.check({ tool: 'Bash', input: { command: 'git push' }, tool_use_id: 'tu-1' })

  expect(got.decision).toBe('deny')
})

test('a permission prompt raises a Windows toast named after the repo', async ($, on) => {
  const host = stubHost(on)
  on('classic.Notification', () => ({}))

  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  await host.firstRun

  expect(host.runs[0]?.argv[0]).toBe('powershell.exe')
  expect(host.runs[0]?.env.BEACON_TITLE).toBe('Permission · dbt-platform')
  expect(host.runs[0]?.env.BEACON_BODY).toContain('permission to use Bash')
})

test('idle reminders stay quiet by default', async ($, on) => {
  const host = stubHost(on)
  on('classic.Notification', () => ({}))

  await $.classic.Notification({ message: 'Claude is waiting for your input', notification_type: 'idle_prompt' })

  expect(host.runs.length).toBe(0)
})

test('a short turn finishes without a toast', async ($, on) => {
  const host = stubHost(on)
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.turn.complete({ answer: 'Done.', durationMs: 4000, isAborted: false, turnId: 't1', reason: 'completed' } as never)

  expect(host.runs.length).toBe(0)
  expect(host.writes.some(w => /[\\/]\.claude[\\/]tower[\\/]sessions[\\/]sess-1\.json$/.test(w.path) && w.text.includes('"done"'))).toBe(true)
})

test('the status file carries the end of the last answer for the tower\'s preview', async ($, on) => {
  const host = stubHost(on)
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  const answer = `${'x'.repeat(3000)}\nAll 12 models migrated.`
  await $.turn.complete({ answer, durationMs: 4000, isAborted: false, turnId: 't1', reason: 'completed' } as never)

  const status = host.lastStatus()
  expect(status.lastAnswer.endsWith('All 12 models migrated.')).toBe(true)
  expect(status.lastAnswer.length).toBeLessThanOrEqual(1500)
})

test('a tower envelope never shows as the last prompt', async ($, on) => {
  const host = stubHost(on)
  on('session.receive', (_$, e) => ({ text: e.text }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.session.receive({ origin: { kind: 'peer' }, text: tower({ kind: 'prompt', text: 'run the tests' }) })

  expect(host.prompts).toContain('run the tests')
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'completed' } as never)
  expect(host.lastStatus().lastPrompt).toBe('run the tests')
})

test('a long turn finishing raises a Done toast', async ($, on) => {
  const host = stubHost(on)
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.turn.complete({ answer: 'Migrated 12 models.\nDetails below.', durationMs: 95000, isAborted: false, turnId: 't2', reason: 'completed' } as never)
  await host.firstRun

  expect(host.runs[0]?.env.BEACON_TITLE).toBe('Done · dbt-platform')
  expect(host.runs[0]?.env.BEACON_BODY).toBe('95s · Migrated 12 models.')
})
