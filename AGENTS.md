# Tower

A Claude Code plugin: a browser cockpit plus terminal mods (pane, strip, status line) for every Claude Code agent on the machine. User-facing docs are in [README.md](README.md).

## Layout

- `plugins/tower/hooks/`: the mods and hook parts (TypeScript, run by the Claude Code engine). Tests in `plugins/tower/tests/`.
- `plugins/tower/cockpit/`: the cockpit server (`server.mjs`, `lib/`) and page (`web/`). Tests in `plugins/tower/cockpit/test/`.
- `site/`: the GitHub Pages site and live demo (`site/demo/sample.js` is its sample data).
- `scripts/`: `release.mjs` and `record-demo.mjs`.

## Working on it

- The cockpit page is generated: edit `cockpit/web/mockup.dc.html` and `cockpit/web/logic.js`, then run `node plugins/tower/cockpit/web/build.mjs`. It also rebuilds the site's demo.
- Check before committing (CI runs the same):
  ```sh
  claude plugin validate plugins/tower
  claude plugin test plugins/tower
  node --test plugins/tower/cockpit/test/*.test.mjs
  ```
  The real-browser tests skip unless `npm i --no-save puppeteer-core` was run.
- Mod parts never pass `$` to another file; the engine refuses that.

## Commits and releases

- Commit subjects are plain sentences starting with a verb ("Add …", "Fix …", "Show …"). git-cliff sorts the changelog by that first word, so no `feat:` prefixes are needed.
- Never edit `CHANGELOG.md` by hand. Release with `node scripts/release.mjs <x.y.z>` then `git push --follow-tags`.
