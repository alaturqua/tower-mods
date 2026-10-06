import { expect, test } from 'claude-code/testing'

import { ago, columns, envelope, merge, tail } from '../hooks/model'

const agent = (sessionId: string, over: object = {}) => ({
  pid: 1, cwd: `D:\\Projects\\${sessionId}`, kind: 'interactive', startedAt: 1000, sessionId, name: `${sessionId}-ab`, status: 'idle', ...over,
})

test('merge lists live sessions, leaves out the tower itself and sorts who needs you first', () => {
  const agents = [agent('web', { status: 'busy' }), agent('tower'), agent('infra'), agent('dbt')]
  const statuses = {
    dbt: { sessionId: 'dbt', label: 'dbt-platform', state: 'needs-input', message: 'Bash: git push', updatedAt: '1970-01-01T00:00:05.000Z',
      pending: { id: 'p-1', kind: 'permission' as const, title: 'Bash', detail: 'git push' }, remoteAnswers: true },
    infra: { sessionId: 'infra', label: 'infra', state: 'done', message: 'Migrated 12 models.', updatedAt: '1970-01-01T00:00:09.000Z' },
  }

  const list = merge(agents, statuses, 'tower')

  expect(list.map(s => s.id)).toEqual(['dbt', 'web', 'infra'])
  expect(list[0]).toMatchObject({ label: 'dbt-platform', state: 'needs-input', hasBeacon: true, remoteAnswers: true, pending: { id: 'p-1' } })
  expect(list[1]).toMatchObject({ label: 'web', state: 'working', hasBeacon: false, pending: null })
})

test('a beacon "working" the engine sees idle reads idle (an interrupted turn)', () => {
  const list = merge([agent('a')], { a: { sessionId: 'a', state: 'working', updatedAt: '1970-01-01T00:00:01.000Z' } }, 'x')

  expect(list[0]?.state).toBe('idle')
})

test('an ended status file never shows', () => {
  const list = merge([agent('a', { status: 'busy' })], { a: { sessionId: 'a', state: 'ended' } }, 'x')

  expect(list[0]).toMatchObject({ state: 'working', hasBeacon: false })
})

test('the envelope is JSON for beacon sessions and plain text otherwise', () => {
  expect(envelope(true, { kind: 'prompt', text: 'run tests' })).toBe('[tower] {"v":1,"kind":"prompt","text":"run tests"}')
  expect(envelope(false, { kind: 'prompt', text: 'run tests' })).toBe('run tests')
})

test('merge carries the conversation preview', () => {
  const list = merge([agent('a')], { a: { sessionId: 'a', state: 'done', lastPrompt: 'do it', lastAnswer: 'done it' } }, 'x')

  expect(list[0]).toMatchObject({ lastPrompt: 'do it', lastAnswer: 'done it' })
})

test('tail keeps the last non-blank lines', () => {
  expect(tail('a\n\nb\nc\n', 2)).toBe('b\nc')
})

test('columns shrink with the pane', () => {
  expect(columns(100)).toMatchObject({ showState: true, showMessage: true })
  expect(columns(70)).toMatchObject({ showState: true, showMessage: false })
  expect(columns(40)).toMatchObject({ showState: false, showMessage: false })
})

test('ago is short', () => {
  expect(ago(0, 4000)).toBe('4s')
  expect(ago(0, 125000)).toBe('2m')
  expect(ago(0, 7300000)).toBe('2h')
})
