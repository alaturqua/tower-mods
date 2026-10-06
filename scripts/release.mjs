#!/usr/bin/env node
// Cut a release: bump the version, regenerate CHANGELOG.md, commit, and tag.
//   node scripts/release.mjs 0.3.0
// Then `git push --follow-tags`; the release workflow publishes the GitHub release with
// git-cliff's notes for the tag.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: node scripts/release.mjs <major.minor.patch>')
  process.exit(1)
}
const tag = `v${version}`
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' && cmd === 'npx' }).toString().trim()

if (sh('git', ['status', '--porcelain'])) {
  console.error('Commit or stash your changes first; a release commit holds only the release.')
  process.exit(1)
}
if (sh('git', ['tag', '--list', tag])) {
  console.error(`${tag} already exists.`)
  process.exit(1)
}

function bump(path, edit) {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  edit(json)
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
}
bump('plugins/tower/.claude-plugin/plugin.json', j => { j.version = version })
bump('.claude-plugin/marketplace.json', j => {
  j.metadata.version = version
  for (const p of j.plugins) if (p.name === 'tower') p.version = version
})

sh('npx', ['-y', 'git-cliff@2.14.2', '--tag', tag, '-o', 'CHANGELOG.md'])
sh('git', ['add', 'plugins/tower/.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'CHANGELOG.md'])
sh('git', ['commit', '-m', `Release ${tag}`])
sh('git', ['tag', '-a', tag, '-m', `Tower ${tag}`])
console.log(`Tagged ${tag}. Publish it with: git push --follow-tags`)
