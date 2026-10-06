# tower

A Claude Code plugin marketplace of mods for running many sessions across many repos from one place, like a control tower over its flights.

Site: **[alaturqua.github.io/tower-mods](https://alaturqua.github.io/tower-mods/)**

| Plugin | What it does |
| --- | --- |
| [tower](plugins/tower) | `/tower` opens a pane listing every running session on this machine, across repos, sorted so whoever needs you is on top. Pick one to send it a prompt, approve or deny what it waits on, answer its question, or jump to its window. Launch a new background session in any repo with a task. |
| [beacon](plugins/beacon) | Runs in every session. Desktop notification when a session needs you (a permission prompt, an `AskUserQuestion`, a long turn finishing), a status file per session in `~/.claude/tower/sessions/` for the tower to read, and the receiving end of the tower's prompts and answers. Windows toast, macOS `osascript`, Linux `notify-send`. |
| [strip](plugins/strip) | A status line entry at the bottom: `tower-mods ⎇ main* · Opus 5.5 · high · auto · ctx 42% · $1.23`, that is folder, git branch (`*` when there are uncommitted changes), model, effort, permission mode, context fill and session cost. |

## Install

```sh
claude plugin marketplace add alaturqua/tower-mods
claude plugin install beacon@tower
claude plugin install tower@tower
claude plugin install strip@tower
```

Install beacon and tower together: beacon in every session, tower wherever you want the control pane (installing it everywhere is harmless; the pane opens only on `/tower`). Mods draw nothing in the VS Code chat panel; run Claude Code in a terminal (VS Code's integrated terminal works) or the desktop app's Code tab.

## Using the tower

Start sessions as you always do, one per repo. In the one you want as your tower, run `/tower`:

```text
Tower · 4 sessions · 1 needs you
▸! dbt-platform       needs-input Bash: git push origin main              2m
 ~ web                working     Running tests                           10s
 ✓ infra              done        Migrated 12 models.                     5m
 · api (bg)           idle                                                1h
──────────────────────────────────────────────────────────────────────────────
dbt-platform-2b · D:\Projects\dbt-platform · interactive
Needs approval: Bash git push origin main
[ Allow ] [ Deny ]
You › migrate the staging models and push
Ran dbt build on 12 models; all passed.
Ready to push to origin/main.
Send to dbt-platform…
[ Jump ] [ New session ] [ Refresh ]
```

Rows are colored by state in your theme's colors: needs you in the warning color, working in the accent, done in green, idle dim. Below the list, the selected session shows in full: what it waits on (never cut off), the last thing you asked it, and the end of its last answer, as many lines as the pane has room for. In a narrow pane the rows drop the message column first, then the state column, and the buttons wrap.

| Key | Does |
| --- | --- |
| Tab / arrows, Enter | Move to a session's name and select it |
| `a` / `d` | Allow or deny the pending permission |
| `1`–`4` | Pick an answer to the pending question (or type one) |
| `j` | Jump: focus the session's window, or attach to a background session in a new Windows Terminal tab |
| `n` | New session: pick a repo, type a task; it starts in the background with `claude --bg` |
| `r` | Refresh now (it refreshes every 3 seconds anyway) |

Typing in the field and pressing Enter sends a prompt to the selected session. It runs as soon as that session is idle, as if you had typed it there. The status line shows `tower: N need you` even while the pane is closed.

The same actions work as commands: `/tower list`, `/tower send <session> <prompt>`, `/tower launch <repo path> <task>`, `/tower add <repo path>` (remembers a repo for the New session picker).

### Who can be answered from the tower

A permission dialog in a terminal belongs to that terminal, so by default only sessions the tower launched send their permission prompts and questions to the tower. The model is told to wait, your Allow arrives as a "retry" prompt, and the approved call runs once. For a session you started by hand, the tower shows what it waits on and `j` takes you there. Set beacon's `remoteAnswers` to `always` to steer every session from the tower.

Sending prompts works with every session, beacon or not.

## Settings

Change these in `/config` or under `pluginConfigs.<plugin>.options` in `~/.claude/settings.json`:

| Plugin | Option | Default | Meaning |
| --- | --- | --- | --- |
| beacon | `remoteAnswers` | `launched` | Which sessions send permission prompts and questions to the tower: `launched`, `always`, `never` |
| beacon | `notifyOnDone` | `true` | Notify when a turn ends after `minTurnSeconds` |
| beacon | `minTurnSeconds` | `30` | Shorter turns end quietly |
| beacon | `notifyOnIdle` | `false` | Also notify on Claude Code's "still waiting" reminders |
| tower | `pollSeconds` | `3` | How often the session list refreshes |
| strip | `showBranch` | `true` | Git branch after the folder |
| strip | `showContext` | `true` | Context window fill |
| strip | `showCost` | `true` | Session cost, where the account reports one |
| strip | `pollSeconds` | `5` | How often branch, context and cost are re-read between turns |

strip learns the permission mode and effort when Claude Code reports them: on each prompt, each tool call and the end of each turn. A Shift+Tab mode switch therefore shows up with your next prompt, and the mode is blank in a new session until the first one.

## Developing

Add this working copy as a marketplace. Claude Code then reads the plugins straight from the folder instead of an installed copy:

```sh
claude plugin marketplace add D:\Projects\tower-mods
claude plugin install beacon@tower
claude plugin install tower@tower
```

Edit, then run `/reload-plugins` in a session. For hot reload on save, start a session with `claude --plugin-dir D:\Projects\tower-mods\plugins\beacon --plugin-dir D:\Projects\tower-mods\plugins\tower` instead.

Check a plugin before pushing:

```sh
claude plugin validate plugins/tower
claude plugin test plugins/tower
```

The design is in [docs/superpowers/specs/2026-10-06-tower-design.md](docs/superpowers/specs/2026-10-06-tower-design.md).

## License

Apache-2.0, see [LICENSE](LICENSE).
