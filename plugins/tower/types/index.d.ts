export type TowerState = 'needs-input' | 'working' | 'done' | 'idle'

// What beacon reports a session waits on (its status file's `pending`).
export type TowerPending = {
  id: string
  kind: 'permission' | 'question'
  title: string
  detail?: string
  options?: string[]
}

// One running session as the pane draws it: the engine's live list, enriched by beacon.
export type TowerSession = {
  id: string
  name: string
  label: string
  cwd: string
  kind: 'interactive' | 'background'
  state: TowerState
  message: string | null
  pending: TowerPending | null
  hasBeacon: boolean
  remoteAnswers: boolean
  // The conversation preview beacon keeps: the last prompt, and how the last answer ended.
  lastPrompt: string | null
  lastAnswer: string | null
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    tower: {
      sessions: TowerSession[]
      selected: string | null
      view: 'list' | 'launch'
      launchRepo: string | null
      // When the last poll failed, why; the list then is the last good one.
      error: string | null
    }
  }
}
