# Changelog

Everything notable in Tower (the plugin and its site), newest first. Generated from the commit history by [git-cliff](https://git-cliff.org).

## [0.6.2](https://github.com/alaturqua/tower-mods/releases/tag/v0.6.2) - 2026-10-11

### Changed

- Use Windows' Explorer-style folder dialog for Add repository, in front of the browser ([e948d21](https://github.com/alaturqua/tower-mods/commit/e948d21da2d15a0920f31aae57522040c670d27d))
## [0.6.1](https://github.com/alaturqua/tower-mods/releases/tag/v0.6.1) - 2026-10-11

### Added

- Add repositories with the system's folder picker instead of a browser prompt ([046895b](https://github.com/alaturqua/tower-mods/commit/046895b69aaf81a6057efc4450fd8ec3814e700d))
## [0.6.0](https://github.com/alaturqua/tower-mods/releases/tag/v0.6.0) - 2026-10-11

### Added

- Add AGENTS.md and CLAUDE.md with project instructions, and ignore local graphify files ([a473b2d](https://github.com/alaturqua/tower-mods/commit/a473b2df34e7217e7b99fe5afcd0d46540862fd7))
- Add a dashboard, row actions, a subagents tab, model and effort switches and finished-run details to the cockpit ([6f1307a](https://github.com/alaturqua/tower-mods/commit/6f1307a0dbb32d3c0ea90bdfbebcc95780b81105))

### Changed

- Report each session's subagents to the cockpit: task, type, status, latest tool call and call count ([4a59bd0](https://github.com/alaturqua/tower-mods/commit/4a59bd0666c1e4020b7b40397bb7d151a44898ec))
- Describe the dashboard, subagents, row actions and model switch in the README and on the site ([798b7de](https://github.com/alaturqua/tower-mods/commit/798b7deae17583886f3a8e4ff982fc285f3c930d))
- Ignore Impeccable's local critique archive ([a4dae6a](https://github.com/alaturqua/tower-mods/commit/a4dae6a892387069c301bacaadbffed63ccc602b))
## [0.5.0](https://github.com/alaturqua/tower-mods/releases/tag/v0.5.0) - 2026-10-11

### Added

- Add usage, budgets, a done log, always-allow, a merge queue, conflict warnings and fan-outs to the cockpit ([7937e3b](https://github.com/alaturqua/tower-mods/commit/7937e3b278bff8e3bca8eaf7d99ccf51c1fbc3e9))

### Changed

- Bring back real buttons in the tower pane's footer ([d044f31](https://github.com/alaturqua/tower-mods/commit/d044f316b17205a555094a57090588df851f829a))
- Make the site's header a breadcrumb dropdown on phones ([abcc1ca](https://github.com/alaturqua/tower-mods/commit/abcc1caf28b92bdeaa5235ee8de32ee79a3057e1))
- Say Tower is a Claude Code plugin in the intro instead of a label above the heading ([a1de0fa](https://github.com/alaturqua/tower-mods/commit/a1de0fa697524362c0e1e580d5465500d556c402))
- Show the budget, the 5-hour limit and health flags in the terminal ([bf73667](https://github.com/alaturqua/tower-mods/commit/bf73667fa17ecbd37725a6420fd4f48ea567b341))
## [0.4.3](https://github.com/alaturqua/tower-mods/releases/tag/v0.4.3) - 2026-10-07

### Changed

- Restyle the tower pane after Agents View: Needs input, Working, Completed, and a one-line key footer ([496f97b](https://github.com/alaturqua/tower-mods/commit/496f97b8afc41a9edd8f6b857e09fe1394780cab))
## [0.4.2](https://github.com/alaturqua/tower-mods/releases/tag/v0.4.2) - 2026-10-07

### Changed

- Make the pane's key line real buttons, keep rows on one line, keep the id on long duplicate names ([bc8cc32](https://github.com/alaturqua/tower-mods/commit/bc8cc322f850201665e6d69f063a2edd269dcf5c))
## [0.4.1](https://github.com/alaturqua/tower-mods/releases/tag/v0.4.1) - 2026-10-07

### Changed

- Pin the tower pane's send box to the bottom when docked ([091e747](https://github.com/alaturqua/tower-mods/commit/091e747246569916255b1958f9ed930df27da908))
## [0.4.0](https://github.com/alaturqua/tower-mods/releases/tag/v0.4.0) - 2026-10-07

### Added

- Add a Help section to the site: update, restart, stop and troubleshooting ([3f621d4](https://github.com/alaturqua/tower-mods/commit/3f621d4ae1378897f148b9bc29df703932e9d93e))

### Changed

- Show install and update commands per system: PowerShell chains with a semicolon ([3777acc](https://github.com/alaturqua/tower-mods/commit/3777acc57b9a4148b24e212a9d154c8df1ac226d))
- Give Windows one command per line: Command Prompt has no semicolon chaining ([a39ce8a](https://github.com/alaturqua/tower-mods/commit/a39ce8a9f97ffcb37da465ba3db93106d0f0a0fd))
- Make the tower pane's Jump find the window by process, as the cockpit does ([adaa087](https://github.com/alaturqua/tower-mods/commit/adaa0873cb6244d3fd9a510449d83704f4ba098d))
- Redesign the tower pane: grouped list beside a boxed detail, shorter preview, Open cockpit ([09fec97](https://github.com/alaturqua/tower-mods/commit/09fec97f9f42da5828012dd6aecc3092e55d401a))
- Make the tower pane say how to use it: keyboard hint, state in the card, keys on the buttons ([ae001f0](https://github.com/alaturqua/tower-mods/commit/ae001f01c809decbf327ea0e86e840840b23b847))
- Redesign the tower pane around triage: needs-you cards, one line per session, one send box ([832e4af](https://github.com/alaturqua/tower-mods/commit/832e4afa455c7f946d39569e8f149199f0bd6567))

### Fixed

- Fix the pane hint test ([31e1ebe](https://github.com/alaturqua/tower-mods/commit/31e1ebeea0b5ac8a833e1c3918d0cbaff33cf367))
## [0.3.2](https://github.com/alaturqua/tower-mods/releases/tag/v0.3.2) - 2026-10-07

### Changed

- Replace an older cockpit on /cockpit, add /cockpit restart and stop ([1e6f0f5](https://github.com/alaturqua/tower-mods/commit/1e6f0f5b881299dddaa98aababba31e5bc4e8023))
## [0.3.1](https://github.com/alaturqua/tower-mods/releases/tag/v0.3.1) - 2026-10-07

### Changed

- Lift the demo video's captions above the cockpit's own toasts ([e1d6a27](https://github.com/alaturqua/tower-mods/commit/e1d6a27129c070a7a2326a1ef9cba4ae02ce6bb8))
- Make the cockpit an app that fits the window, with resizable panels ([7a5cbdd](https://github.com/alaturqua/tower-mods/commit/7a5cbdd444966697ac8ab712b790a5da5fa32a5c))
- Record the design check's exception for the cockpit's three edge-to-edge containers ([f0315dc](https://github.com/alaturqua/tower-mods/commit/f0315dc5142c38c0a1b8b28ce6e50e0e3583115e))

### Fixed

- Fix typing, focus and Allow in the cockpit page and the site demo ([c46918b](https://github.com/alaturqua/tower-mods/commit/c46918bee567756f71da14abf38a8238b6c71d47))
## [0.3.0](https://github.com/alaturqua/tower-mods/releases/tag/v0.3.0) - 2026-10-07

### Added

- Add beacon, tower and strip mods with a GitHub Pages site ([e3bcf84](https://github.com/alaturqua/tower-mods/commit/e3bcf8436d85fcb007d0334404e2030059224d22))
- Add a light theme and a remembered theme switch to the site ([f986d50](https://github.com/alaturqua/tower-mods/commit/f986d50d3d92d34b5797c7cbf09d2cd178da925f))
- Add a demo GIF of the cockpit mockup to the site and README ([9961bbc](https://github.com/alaturqua/tower-mods/commit/9961bbc973f598909f10587e75e11c2e83956617))
- Add System, Light and Dark choice to the site, and the demo GIF in both themes ([8eeb92e](https://github.com/alaturqua/tower-mods/commit/8eeb92ea4876105e47aed8552160f49bc83590c0))
- Add the cockpit: a local web dashboard over every session ([fc64db5](https://github.com/alaturqua/tower-mods/commit/fc64db5edea6cddcf3687810538c61f2a1ddc7f2))
- Add git-cliff changelogs, a release script and workflow, and CI ([ddd6c4c](https://github.com/alaturqua/tower-mods/commit/ddd6c4c599a4dd50c3f7ce93c6fad0ec002d2c38))
- Adding fixes and adjustments ([bd693de](https://github.com/alaturqua/tower-mods/commit/bd693debf1d58d5cfcb3f1748c40695daf2bc2e9))

### Changed

- Ship beacon, tower and the status line as one plugin ([d402bac](https://github.com/alaturqua/tower-mods/commit/d402bac31287f7176cbc3b4626433635de1aeb97))
- Redraw the remote-answers section as a four-step flow ([c3bcdce](https://github.com/alaturqua/tower-mods/commit/c3bcdce009e27e2fe4581556430cdc47b217af70))
- Replace the blurry demo GIF with sharp, focused clips ([aa48320](https://github.com/alaturqua/tower-mods/commit/aa48320575ac9abfc77a912d7001082400e5b9dc))
- Show the cockpit demos as animated WebP instead of video ([a1ccc69](https://github.com/alaturqua/tower-mods/commit/a1ccc6951a1b60587082caaac5079c60e35bae67))
- Give the demo image a real default source ([15e53b4](https://github.com/alaturqua/tower-mods/commit/15e53b4d6b213777b359dbbaeef5c95fba6f0dab))
- Stamp the stylesheet link with the commit on deploy ([508bbff](https://github.com/alaturqua/tower-mods/commit/508bbff0d62b894467bdbd4886d4d00d8ec7241e))
- Run the cockpit mockup live on the site instead of recordings ([e21c90e](https://github.com/alaturqua/tower-mods/commit/e21c90eb241b22bcdf126782b5c687ebbb611bfd))
- Report what the cockpit needs from every session, and read its inbox ([72c9847](https://github.com/alaturqua/tower-mods/commit/72c9847e5bf7a23e466ab1f6a7a87a6bbc52d076))
- Run slash commands sent from the tower, and publish each session's list ([b091f7c](https://github.com/alaturqua/tower-mods/commit/b091f7cdfa2a555d4231eba798b980b979147794))
- Patch the page in place on live updates, and explain an empty feed ([d08e398](https://github.com/alaturqua/tower-mods/commit/d08e398d1db665d22937b830476562690276b317))
- Rename and remove repos and worktrees from the cockpit ([4e16010](https://github.com/alaturqua/tower-mods/commit/4e16010315a2bf8c8f8dfa085dbd38dc2b301c41))

### Fixed

- Fix hover contrast and row padding on the site ([57c8367](https://github.com/alaturqua/tower-mods/commit/57c8367dda697e3b2ae5386b62960eaf6ed0aed0))
- Fix the demo player not starting ([b7669f9](https://github.com/alaturqua/tower-mods/commit/b7669f9ca2819b56725d7a800a56380a36ce6edb))
- Fix slash-command suggestions in the cockpit with a drop-up menu ([08fe73f](https://github.com/alaturqua/tower-mods/commit/08fe73ff4b824a12685fe2edfa3c606f11d4c6f1))
- Fix hook tests that failed on Linux ([d4fce43](https://github.com/alaturqua/tower-mods/commit/d4fce4382be3f6dcf64352db0962b1c8c859894b))
- Fix sending to sessions that cannot receive, and jumping to terminals ([faaa9f1](https://github.com/alaturqua/tower-mods/commit/faaa9f108f7492e07d709a092eb536afbb6f5f20))

### Documentation

- Document the cockpit in the README and the spec ([fabac4f](https://github.com/alaturqua/tower-mods/commit/fabac4f059f4078f16d5596ffe5db2af3724df28))

