# Tower: watch and steer every Claude Code session from one pane

Date: 2026-10-06. Status: approved in chat (approach 1), details decided by Claude on the user's "do all".

Update, later: the web cockpit this spec's first draft left for later is built (`plugins/tower/cockpit`: a zero-dependency Node server on 127.0.0.1 behind a one-time token, a per-session inbox that beacon reads, workstreams through `claude --bg -w`). Its design and security model are in the README. Pause/resume and cost caps from the mockup were left out: Claude Code can pause neither a session nor spend.

Update, same day: beacon, tower and the status line (strip) now ship as one plugin, `tower`, installed in one line. "beacon" and "tower" below name its parts (`hooks/beacon.ts`, `hooks/pane.tsx`), not separate plugins. The pane polls only in a session where `/tower` has run, and its "N need you" count leads the status line, since a plugin has one status entry.

## Goal

One Claude Code session acts as the control tower. Its pane lists every running session on the machine, across repos, with what each is doing and whether it needs the person. From the pane the person can:

1. send a session a new prompt, as if typed in its terminal;
2. answer what a session is waiting on (a permission, an `AskUserQuestion`), for sessions the tower launched;
3. jump to a session's window (or attach to a background one);
4. launch a new session in a repo with a task.

Success: with three repos running sessions, the person never has to hunt through terminals to find which one is blocked, and can unblock or redirect any of them from the tower.

## Out of scope (v1)

- Answering the native permission dialog of a session the person started by hand. That dialog belongs to its terminal; the tower shows it and offers jump.
- Remote machines and cloud sessions. Local sessions only.
- A desktop-app or VS Code drawing. Terminal surface first; the tree uses only elements every surface has, so others may work but are not tested.

## Pieces

```
~/.claude/tower/
  sessions/<id>.json   beacon, per session: state, label, pending, remoteAnswers, updatedAt
  launched/<id>.json   tower, before it launches a session: { repo, task, launchedAt }

claude agents --json   the engine's list of live sessions: pid, cwd, name, kind, idle/busy

beacon (every session)                      tower (the control session)
  status file (as today, plus pending)        /tower opens the pane; status line count
  [tower] messages -> $.prompt.submit         polls agents --json + sessions/ every 3s
  remote answers in launched sessions         send / answer -> $.session.send
                                              jump -> AppActivate(name) | wt claude attach
                                              launch -> claude --bg --session-id --name
```

Two plugins in the `tower` marketplace: `beacon` (exists, extended) and `tower` (new). They share no code; their contract is the status file schema and the message format below.

## Discovery: what the pane lists

Source of truth for "alive" is `claude agents --json` (`sessionId`, `pid`, `cwd`, `name`, `kind: interactive|background`, `status: idle|busy`). It lists sessions with or without beacon.

Each entry is enriched from `sessions/<id>.json` when present. A session with beacon shows beacon's `state` (`idle`, `working`, `needs-input`, `done`) and `message`; one without shows `idle`/`busy` from the engine and a dim "no beacon" mark. The tower's own session is left out. Status files whose session is not in the live list are ignored (that is how ended and crashed sessions disappear; the files stay, they are small).

Sort: `needs-input` first, then `working`/`busy`, then `done`, then `idle`; within a group, most recently updated first.

## Status file (beacon writes)

```json
{
  "sessionId": "…", "label": "dbt-platform", "cwd": "…", "remote": null, "model": "…",
  "state": "needs-input", "message": "Claude needs your permission to use Bash",
  "pending": { "id": "p-3", "kind": "permission", "title": "Bash", "detail": "git push origin main" },
  "remoteAnswers": true,
  "updatedAt": "2026-10-06T14:00:00.000Z"
}
```

`pending` is set only when the session is waiting on something the tower can answer (`remoteAnswers: true`), cleared when answered or when the next turn starts. `kind: "question"` carries `title` (the question) and `options` (labels) instead of `detail`.

## Messages (tower to beacon)

Delivered with `$.session.send({ to: { sessionId }, text })`. Text is `[tower] ` followed by JSON:

- `{ "v": 1, "kind": "prompt", "text": "…" }`
- `{ "v": 1, "kind": "answer", "pendingId": "p-3", "allow": true }` for a permission
- `{ "v": 1, "kind": "answer", "pendingId": "p-4", "text": "staging" }` for a question

Beacon's `session.receive` hook finds a `[tower] {…}` payload in the delivery, consumes the delivery (`{ consumed }`) so the model never reads the envelope, and acts:

- `prompt`: `void $.prompt.submit({ text, asUser: true })` (never awaited inside the hook: that hangs mid-turn). The prompt runs as soon as the session is idle.
- `answer`: see remote answers. An answer whose `pendingId` is not the current pending one is dropped with a `ui.log` line.

A delivery without the marker passes through untouched. A session without beacon receives the tower's text as an ordinary peer message, which the model reads; for those the tower sends the plain prompt text instead of the JSON envelope, so it still works.

## Remote answers

Hooks have a 10 s budget, so a session cannot wait inside a permission check for the tower. Instead, in a session with remote answers on, beacon turns a would-be dialog into a refusal the model waits out, and the tower's answer arrives as the next prompt:

- Permission: a `tool.check` hook awaits `next(e)`. On `ask`, if the exact `tool` + `input` was approved from the tower (a one-shot approval kept in `$.state`), it answers `allow` and consumes the approval. Otherwise it records `pending` (kind `permission`), notifies, and answers `deny` with the reason: "Waiting for approval in the tower. End your turn now; you will be told when to retry." Answer `allow: true` stores the approval and submits "Approved in the tower: retry <tool> <detail>."; `allow: false` submits "Denied in the tower: do not run <tool> <detail>; continue another way or ask."
- Question: the `tool.call` hook on `AskUserQuestion` records `pending` (kind `question`, its first question and option labels) and answers the call itself with the text "The question was sent to the person in the tower. End your turn now; their answer arrives as the next message." An answer submits "Answer to your question \"<question>\": <text>".

Beacon option `remoteAnswers`: `launched` (default: only sessions with a `launched/<id>.json`), `always`, `never`. A hand-started session therefore keeps its normal dialogs unless the person opts in.

## Pane (tower)

`/tower` opens the pane with focus. Layout, top to bottom:

```
Tower · 4 sessions · 1 needs you
 [Select] ▸ ! dbt-platform    needs-input  Bash: git push origin main     2m
            ~ web-app         working      Running tests                  10s
            ✓ infra           done         Migrated 12 models.             5m
            · docs  (bg)      idle                                         1h
 dbt-platform · D:\Projects\dbt-platform · interactive
 Needs approval: Bash  git push origin main          [a Allow] [d Deny]
 [Input] Send to dbt-platform…
 [j Jump] [n New session] [r Refresh]
```

- The session list is a `Select`; picking one makes it the target of the rest.
- The detail row shows the pending item when there is one: Allow/Deny buttons for a permission, one button per option (hotkeys 1–4) for a question; free text in the input answers a question too.
- The input sends a prompt (or the answer, when a question is pending) on Enter.
- New session: the pane switches to a small form: a `Select` of repos (every `cwd` seen in live sessions plus repos remembered in `$.store`), an `Input` for the task, then launch. `/tower add <path>` remembers a repo.
- After each action a toast confirms ("Sent to web-app", or the refusal reason).

The tower session's status line shows `tower: N need you` whenever N > 0, from the same poll, while the pane is open or closed.

## Launch

1. `id = crypto.randomUUID()`, `name = <repo folder>-<4 chars of id>`.
2. Write `launched/<id>.json` (so beacon sees it at `session.start`).
3. `claude --bg --session-id <id> --name <name> <task>` with `cwd` = the repo. Exit code non-zero: toast its stderr, remove nothing.

## Jump

- Background session: `wt.exe -d <cwd> claude attach <id>` (a new Windows Terminal tab attached to it); without `wt.exe`, `cmd /c start claude attach <id>`.
- Interactive: PowerShell `(New-Object -ComObject WScript.Shell).AppActivate('<name>')` (the session name is the terminal title). `False` → toast "Couldn't find its window; it runs in <cwd>".
- macOS/Linux: toast with the cwd and `claude attach` hint only (v1).

## Polling

`clock.every(3000)` started at `session.start` in the tower: `claude agents --json` (≈0.4 s) and the status files of the listed ids. A poll still in flight skips the tick. Results go into `$.state` (`tower.sessions`), which redraws the pane. Errors keep the last good list and show a dim "stale since …" line.

## Beacon fixes in passing

- The two gating hooks get `.catch` handlers that pass `next(e)` through, so a failing alert can never block a dialog (validator warnings today).
- `turn.start` clears `pending`.

## Testing

- beacon: `[tower]` prompt is consumed and submitted; a plain peer message passes through; a permission `ask` in a launched session becomes `deny` + pending, then an allow answer makes the next identical check `allow` once; AskUserQuestion becomes pending and an answer submits the text; `remoteAnswers: never` leaves dialogs alone. Existing four tests keep passing.
- tower: the pure merge/sort (`model.ts`) over agents JSON + status files; sending from the pane calls `session.send` with the envelope for beacon sessions and plain text otherwise; launch writes `launched/<id>.json` before running `claude --bg …`.
- Live check: two real sessions, one with beacon, send a prompt and answer a permission from a third.

## Build order

1. beacon: catch handlers, status `pending`, `session.receive` prompt path, tests.
2. beacon: remote answers (permission, question), option, tests.
3. tower: `model.ts` merge/sort + tests.
4. tower: plugin skeleton, poll, status line, pane list + send, tests.
5. tower: answers, jump, launch, repos.
6. marketplace + README; validate both; live check.
