import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { compose, modelName } from '../hooks/line'

type Git = { branch?: string; dirty?: boolean } | null

// A session in D:/Projects/tower-mods on Opus 5.5 with effort high from the environment.
function stubHost(on: On, git: Git = { branch: 'main', dirty: true }) {
  const lines: (string | undefined)[] = []
  on('env.get', (_$, e) => ({ value: ({ CLAUDE_EFFORT: 'high' } as Record<string, string>)[e.name] }))
  on('session.cwd', () => ({ value: 'D:/Projects/tower-mods' }))
  on('session.repo', () => ({ value: git ? { root: 'D:/Projects/tower-mods', name: 'tower-mods', remote: null, internal: false } : null }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 84000, window: 200000, percent: 42 }, rateLimits: [], cost: { usd: 1.234 } } }) as never)
  on('ui.status', (_$, e) => { lines.push(e.text); return { value: undefined } })
  on('process.run', (_$, e) => {
    const done = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    if (!git) return { value: { ...done, exitCode: 128, stdout: '' } }
    if (e.argv.includes('rev-parse')) return { value: { ...done, stdout: `${git.branch}\n` } }
    return { value: { ...done, stdout: git.dirty ? ' M README.md\n' : '' } }
  })
  // What the plugin's other parts touch at start: beacon's status file and the /tower command.
  on('session.id', () => ({ value: 'sess-1' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }))
  on('command.register', () => ({ value: { command: 'tower' } }))
  on('session.start', () => ({ cwd: 'D:/Projects/tower-mods' }))
  on('classic.UserPromptSubmit', () => ({}))
  on('classic.Stop', () => ({}))
  return { lines }
}

// No refresh timer: the tests drive every update.
const quiet = { options: { pollSeconds: 0, inboxSeconds: 0 } }
const start = ($: Engine) => $.session.start({ source: 'startup', cwd: 'D:/Projects/tower-mods' } as never)

test('the line shows folder, branch, model, effort, context and cost', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)

  expect(host.lines.at(-1)).toBe('tower-mods ⎇ main* · Opus 5.5 · high · ctx 42% · $1.23')
})

test('the permission mode appears once a prompt reports it, and follows changes', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)

  await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'plan' } as never)
  expect(host.lines.at(-1)).toBe('tower-mods ⎇ main* · Opus 5.5 · high · plan · ctx 42% · $1.23')

  await $.classic.UserPromptSubmit({ prompt: 'go', permission_mode: 'acceptEdits' } as never)
  expect(host.lines.at(-1)).toContain('· accept edits ·')
})

test('the effort the engine reports wins over the starting one', quiet, async ($, on) => {
  const host = stubHost(on)
  await start($)

  await $.classic.Stop({ stop_hook_active: false, permission_mode: 'auto', effort: { level: 'max' } } as never)

  expect(host.lines.at(-1)).toBe('tower-mods ⎇ main* · Opus 5.5 · max · auto · ctx 42% · $1.23')
})

test('outside a git repo the folder stands alone', quiet, async ($, on) => {
  const host = stubHost(on, null)
  await start($)

  expect(host.lines.at(-1)).toBe('tower-mods · Opus 5.5 · high · ctx 42% · $1.23')
})

test('options hide the parts you do not want', { options: { pollSeconds: 0, showCost: false, showContext: false, showBranch: false } }, async ($, on) => {
  const host = stubHost(on)
  await start($)

  expect(host.lines.at(-1)).toBe('tower-mods · Opus 5.5 · high')
})

test('model ids read as names', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('eu.anthropic.claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(modelName('claude-fable-5-1[1m]')).toBe('Fable 5.1 1M')
  expect(modelName('Sonnet 5.5')).toBe('Sonnet 5.5')
})

test('compose leaves out what is unknown', () => {
  expect(compose({ folder: 'x', model: 'Opus 5.5' })).toBe('x · Opus 5.5')
  expect(compose({ folder: 'x', branch: 'dev', isDirty: false, mode: 'bypassPermissions', costUsd: 0 })).toBe('x ⎇ dev · bypass · $0.00')
})
