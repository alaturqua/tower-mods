# Changelog

Everything notable in Tower (the plugin and its site), newest first. Generated from the commit history by [git-cliff](https://git-cliff.org).

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

