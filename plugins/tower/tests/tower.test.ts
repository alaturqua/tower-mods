import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

type Run = { argv: readonly string[]; cwd?: string }

// The engine hands paths over in the platform's spelling.
const slash = (path: string) => path.replace(/\\/g, '/')

// Three sessions besides the tower: "web" busy without beacon, "dbt" waiting on a
// permission with beacon, "api" idle in the background.
function stubHost(on: On) {
  const runs: Run[] = []
  const sends: { to: unknown; text: string }[] = []
  const order: string[] = []
  const writes: Record<string, string> = {}
  const statuses: (string | undefined)[] = []
  const agents = [
    { pid: 1, cwd: 'D:\\Projects\\web', kind: 'interactive', startedAt: 1, sessionId: 'web-id', name: 'web-1a', status: 'busy' },
    { pid: 2, cwd: 'D:\\Projects\\dbt-platform', kind: 'interactive', startedAt: 1, sessionId: 'dbt-id', name: 'dbt-2b', status: 'idle' },
    { pid: 3, cwd: 'D:\\Projects\\api', kind: 'background', startedAt: 1, sessionId: 'api-id', name: 'api-3c', status: 'idle' },
    { pid: 4, cwd: 'D:\\Projects\\tower-mods', kind: 'interactive', startedAt: 1, sessionId: 'me', name: 'tower', status: 'busy' },
  ]
  const files: Record<string, string> = {
    'C:/Users/me/.claude/tower/sessions/dbt-id.json': JSON.stringify({
      sessionId: 'dbt-id', label: 'dbt-platform', state: 'needs-input', updatedAt: new Date().toISOString(), remoteAnswers: true,
      pending: { id: 'p-1', kind: 'permission', title: 'Bash', detail: 'git push' },
      lastPrompt: 'migrate the models', lastAnswer: 'Ran the migration.\n\nAll 12 models migrated.',
    }),
  }

  on('env.get', (_$, e) => ({ value: ({ OS: 'Windows_NT', USERPROFILE: 'C:/Users/me', CLAUDE_CODE_EXECPATH: 'C:/bin/claude.exe' } as Record<string, string>)[e.name] }))
  on('session.id', () => ({ value: 'me' }))
  on('clock.now', () => ({ value: Date.now() }))
  on('ui.status', (_$, e) => { statuses.push(e.text); return { value: undefined } })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('fs.read', (_$, e) => {
    const text = files[slash(e.path)]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text } as never
  })
  on('fs.write', (_$, e) => { order.push(`write ${slash(e.path)}`); writes[slash(e.path)] = e.text; return { value: undefined } })
  on('process.run', (_$, e) => {
    runs.push({ argv: e.argv, cwd: e.init?.cwd })
    const done = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    if (e.argv.includes('agents')) return { value: { ...done, stdout: JSON.stringify(agents) } }
    order.push(`run ${e.argv.join(' ')}`)
    return { value: { ...done, stdout: '' } }
  })
  on('session.send', (_$, e) => { sends.push({ to: e.to, text: e.text }); return { isDelivered: true } as never })
  on('command.register', () => ({ value: { command: 'tower' } }))
  on('command.run', () => ({ text: '' }))
  on('session.start', () => ({ cwd: 'D:/Projects/tower-mods' }))
  return { runs, sends, order, writes, statuses }
}

// No refresh timer: each command polls for itself.
const quiet = { options: { pollSeconds: 0 } }

// The pane docked beside the transcript, this many columns wide.
const paneProps = (bodyColumns: number) => ({
  title: 'Tower', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {},
})

const start = ($: Engine) =>
  $.session.start({ source: 'startup', cwd: 'D:/Projects/tower-mods' } as never)

test('/tower send gives a session without beacon the plain words', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)

  const got = await $.command.run({ command: 'tower', args: 'send web run the tests' } as never)

  // The engine spells a { sessionId } address as the id before the send.
  expect(host.sends).toEqual([{ to: 'web-id', text: 'run the tests' }])
  expect(got.text).toContain('web')
})

test('/tower send wraps the words for a beacon session', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)

  await $.command.run({ command: 'tower', args: 'send dbt-platform push it' } as never)

  expect(host.sends[0]?.text).toBe('[tower] {"v":1,"kind":"prompt","text":"push it"}')
})

test('/tower send to nobody says who there is', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)

  const got = await $.command.run({ command: 'tower', args: 'send nope hello' } as never)

  expect(host.sends.length).toBe(0)
  expect(got.text).toContain('dbt-platform')
})

test('/tower launch marks the session as launched, then starts it in the background', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)

  await $.command.run({ command: 'tower', args: 'launch D:\\Projects\\api fix the flaky test' } as never)

  const run = host.runs.find(r => r.argv.includes('--bg'))
  expect(run?.argv[0]).toBe('C:/bin/claude.exe')
  expect(run?.cwd).toBe('D:\\Projects\\api')
  const id = run?.argv[run.argv.indexOf('--session-id') + 1] ?? ''
  expect(run?.argv[run.argv.indexOf('--name') + 1]).toBe(`api-${id.slice(0, 4)}`)
  expect(run?.argv[run.argv.length - 1]).toBe('fix the flaky test')
  expect(host.order[0]).toBe(`write C:/Users/me/.claude/tower/launched/${id}.json`)
  expect(host.order[1]).toContain('--bg')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`on ${surface} the pane allows a pending permission and sends a prompt`, quiet, async ($, on) => {
    const host = stubHost(on)
    await start($)
    await $.command.run({ command: 'tower', args: 'list' } as never)

    const pane = await $.ui.mount({
      plugin: 'tower', surface, component: 'Pane', requestId: 'tower',
      props: paneProps(100),
    })
    expect(await pane.find({ text: /Needs approval: Bash git push/ })).toBeTruthy()

    await pane.press({ key: 'allow' })
    await pane.input({ key: 'say-dbt-id', text: 'then open a PR' })

    expect(host.sends.map(s => s.text)).toEqual([
      '[tower] {"v":1,"kind":"answer","pendingId":"p-1","allow":true}',
      '[tower] {"v":1,"kind":"prompt","text":"then open a PR"}',
    ])
    await pane.unmount()
  })
}

test('picking a row targets that session and previews its conversation', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)
  await $.command.run({ command: 'tower', args: 'list' } as never)
  const pane = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: paneProps(100) })

  expect(await pane.find({ text: /All 12 models migrated\./ })).toBeTruthy()
  expect(await pane.find({ text: /migrate the models/ })).toBeTruthy()

  await pane.press({ key: 'pick-web-id' })
  await pane.input({ key: 'say-web-id', text: 'hurry up' })

  expect(host.sends).toEqual([{ to: 'web-id', text: 'hurry up' }])
  await pane.unmount()
})

test('a narrow pane drops the message column but the detail still shows it whole', quiet, async ($, on) => {
  stubHost(on)
  await start($)
  await $.command.run({ command: 'tower', args: 'list' } as never)
  const pane = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: paneProps(50) })

  const rows = await pane.findAll({ text: /^Bash: git push$/ })
  expect(rows.length).toBe(0)
  expect(await pane.find({ text: /Needs approval: Bash git push/ })).toBeTruthy()
  await pane.unmount()
})

test('the status line counts who needs you', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)
  const got = await $.command.run({ command: 'tower', args: 'list' } as never)

  expect(host.statuses.at(-1)).toBe('tower: 1 needs you')
  expect(got.text).toContain('! dbt-platform')
})
