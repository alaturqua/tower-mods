import type { EngineInterface, Register } from 'claude-code'

import { compose } from './line'
import type { StripParts } from './line'

type $ = EngineInterface

let showBranch = true
let showContext = true
let showCost = true
let showLine = true
let pollMs = 5000
// What git, the model and the usage said last; mode and effort as the engine last reported them.
let known: StripParts = { folder: '' }
let waiting = 0
let shown: string | undefined

function folder(path: string) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

async function git($: $, root: string, args: string[]) {
  const ran = await $.process.run(['git', '-C', root, ...args], { timeoutMs: 3000 }).catch(() => undefined)
  return ran?.exitCode === 0 ? ran.stdout : undefined
}

// Draws from what is known; no process runs, so it is cheap enough for every tool call.
// With the line switched off, only the tower's count is left to show.
function draw($: $) {
  const line = showLine ? compose({ ...known, waiting }) : (compose({ folder: '', waiting }) || undefined)
  if (line !== shown) $.ui.status((shown = line))
}

// Redraws with the session's own `$`, kept from session.start: `$` never crosses a file.
let redraw: (() => void) | undefined

// The pane's poll reports how many other sessions wait on you; one status entry carries both.
export function setWaiting(count: number) {
  waiting = count
  redraw?.()
}

// Re-reads what changes on its own: the branch, the model, the context and the cost.
async function refresh($: $) {
  const repo = await $.session.repo().catch(() => null)
  const root = repo?.root ?? (await $.session.cwd())
  const next: StripParts = { ...known, folder: repo?.name ?? folder(root), branch: undefined, isDirty: undefined }
  if (showBranch && repo) {
    const [branch, changes] = await Promise.all([git($, root, ['rev-parse', '--abbrev-ref', 'HEAD']), git($, root, ['status', '--porcelain'])])
    next.branch = branch?.trim() || undefined
    next.isDirty = Boolean(changes?.trim())
  }
  next.model = await $.session.model().catch(() => known.model)
  const usage = await $.session.usage().catch(() => undefined)
  next.contextPercent = showContext ? usage?.context.percent : undefined
  next.costUsd = showCost ? usage?.cost?.usd : undefined
  known = next
  draw($)
}

function background($: $) {
  refresh($).catch(() => {})
}

// The classic hook fields that say how the session runs right now.
// How the session runs, as last reported: beacon copies it into the status file.
export function currentRun(): { mode: string | null; effort: string | null } {
  return { mode: known.mode ?? null, effort: known.effort ?? null }
}

function heard($: $, e: { permission_mode?: string; effort?: { level: string } }) {
  if (e.permission_mode) known = { ...known, mode: e.permission_mode }
  if (e.effort?.level) known = { ...known, effort: e.effort.level }
  draw($)
}

// The status line.
export const registerStrip: Register = (on, options) => {
  showBranch = options.showBranch !== false
  showContext = options.showContext !== false
  showCost = options.showCost !== false
  showLine = options.statusLine !== false
  pollMs = Number(options.statusSeconds ?? 5) * 1000

  // The first line, then a refresh on a timer.
  on('session.start', { cwd: /^/ }, async ($, e, next) => {
    redraw = () => draw($)
    if (!showLine) return next(e)
    const effort = await $.env.get('CLAUDE_EFFORT')
    if (effort && !known.effort) known = { ...known, effort }
    await refresh($).catch(() => {})
    if (pollMs > 0) $.clock.every(pollMs, () => background($))
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    heard($, e)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUse', async ($, e, next) => {
    heard($, e)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Stop', async ($, e, next) => {
    heard($, e)
    background($)
    return next(e)
  }).catch(($, e, next) => next(e))
}
