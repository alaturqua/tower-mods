// What the status line knows; any part left out is not drawn.
export type StripParts = {
  folder: string
  branch?: string
  isDirty?: boolean
  model?: string
  effort?: string
  mode?: string
  contextPercent?: number
  costUsd?: number
  // Other sessions waiting on you, from the tower's poll; leads the line when any are.
  waiting?: number
}

const MODES: Record<string, string> = {
  default: 'default',
  acceptEdits: 'accept edits',
  plan: 'plan',
  auto: 'auto',
  bypassPermissions: 'bypass',
  dontAsk: "don't ask",
}

// `claude-opus-5-5` reads `Opus 5.5`; a name already readable is kept.
// Finds the name wherever it sits in the id, so a provider's prefix
// ("eu.anthropic.claude-sonnet-5-5") needs no special case.
export function modelName(model: string) {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(model)
  if (!m) return model
  const family = (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1)
  return `${family} ${m[2]}${m[3] ? '.' + m[3] : ''}${/\[1m\]/i.test(model) ? ' 1M' : ''}`
}

export function compose(p: StripParts) {
  const where = p.branch ? `${p.folder} ⎇ ${p.branch}${p.isDirty ? '*' : ''}` : p.folder
  const mode = p.mode === undefined ? undefined : (MODES[p.mode] ?? p.mode)
  return [
    p.waiting ? `${p.waiting} need${p.waiting === 1 ? 's' : ''} you` : undefined,
    where,
    p.model && modelName(p.model),
    p.effort,
    mode,
    p.contextPercent === undefined ? undefined : `ctx ${Math.round(p.contextPercent)}%`,
    p.costUsd === undefined ? undefined : `$${p.costUsd.toFixed(2)}`,
  ].filter(Boolean).join(' · ')
}
