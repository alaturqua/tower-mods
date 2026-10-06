// What a session is waiting on that the tower can answer; mirrored into the status file.
export type BeaconPending = {
  id: string
  kind: 'permission' | 'question'
  title: string
  detail?: string
  options?: string[]
  // The permission's exact call, so an approval allows that call and no other.
  key?: string
}

declare module 'claude-code' {
  interface PluginState {
    beacon: {
      pending: BeaconPending | null
      // One-shot approvals from the tower, by permission key.
      approvals: string[]
    }
  }
}
