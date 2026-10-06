import type { Register } from 'claude-code'

import { registerBeacon } from './beacon'
import { registerPane } from './pane'
import { registerStrip } from './strip'

// One plugin, three parts, each with its own switches in /config: beacon in every
// session, the /tower pane where you steer from, and the status line.
export const register: Register = (on, options) => {
  registerBeacon(on, options)
  registerPane(on, options)
  registerStrip(on, options)
}
