// Everything the cockpit reads from the machine: the engine's session list, beacon's
// files, git per working folder, and open PRs. Slow sources are cached.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// Where beacon and the cockpit meet; TOWER_HOME moves it, for tests.
export const TOWER = process.env.TOWER_HOME || join(homedir(), '.claude', 'tower')

export function run(cmd, args, { cwd, timeout = 15000, input } = {}) {
  return new Promise(resolve => {
    const child = execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout), stderr: String(stderr || err?.message || '') })
    })
    if (input !== undefined) child.stdin.end(input)
  })
}

// The real binary: the npm shim is a .cmd that execFile cannot start without a shell,
// and a shell would mangle the task text we pass.
let claudePath
export async function claudeBin() {
  if (claudePath) return claudePath
  if (process.env.CLAUDE_CODE_EXECPATH && existsSync(process.env.CLAUDE_CODE_EXECPATH)) return (claudePath = process.env.CLAUDE_CODE_EXECPATH)
  if (process.platform === 'win32') {
    const where = await run('where', ['claude.cmd'])
    const shim = where.stdout.split(/\r?\n/).find(Boolean)
    const exe = shim && join(dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    if (exe && existsSync(exe)) return (claudePath = exe)
    const direct = (await run('where', ['claude.exe'])).stdout.split(/\r?\n/).find(Boolean)
    if (direct) return (claudePath = direct)
  }
  return (claudePath = 'claude')
}

export async function claude(args, opts) {
  return run(await claudeBin(), args, opts)
}

export async function agents() {
  const out = await claude(['agents', '--json'])
  if (!out.ok) throw new Error(out.stderr.trim() || 'claude agents failed')
  return JSON.parse(out.stdout)
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
}

export const statusOf = id => readJson(join(TOWER, 'sessions', `${id}.json`))
export const commandsOf = id => readJson(join(TOWER, 'commands', `${id}.json`))

// Small TTL caches, keyed by folder: git and gh are the slow part of a refresh.
function cached(ms, load) {
  const memo = new Map()
  return key => {
    const hit = memo.get(key)
    if (hit && Date.now() - hit.at < ms) return hit.value
    const value = load(key).catch(() => null)
    memo.set(key, { at: Date.now(), value })
    return value
  }
}

const git = (cwd, ...args) => run('git', ['-C', cwd, ...args], { timeout: 8000 })

async function defaultBranch(cwd) {
  const head = await git(cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
  if (head.ok) return head.stdout.trim()
  for (const name of ['main', 'master']) if ((await git(cwd, 'rev-parse', '--verify', '--quiet', name)).ok) return name
  return null
}

// Branch, repo, and what changed against the base branch, committed or not.
export const gitOf = cached(5000, async cwd => {
  const top = await git(cwd, 'rev-parse', '--show-toplevel')
  if (!top.ok) return null
  const common = (await git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir')).stdout.trim()
  const repoRoot = common.endsWith('.git') ? dirname(common) : top.stdout.trim()
  const branch = (await git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim() || 'HEAD'
  const base = await defaultBranch(cwd)
  let add = 0, del = 0, ahead = 0, behind = 0
  const files = []
  if (base) {
    const mb = (await git(cwd, 'merge-base', 'HEAD', base)).stdout.trim()
    if (mb) {
      for (const line of (await git(cwd, 'diff', '--numstat', mb)).stdout.split('\n')) {
        const [a, d, path] = line.split('\t')
        if (!path) continue
        const fa = Number(a) || 0, fd = Number(d) || 0
        add += fa; del += fd
        files.push({ path, add: fa, del: fd })
      }
    }
    const counts = (await git(cwd, 'rev-list', '--left-right', '--count', `${base}...HEAD`)).stdout.trim().split(/\s+/)
    behind = Number(counts[0]) || 0
    ahead = Number(counts[1]) || 0
  }
  return { repoRoot, repoName: repoRoot.split(/[\\/]/).pop(), branch, base: base?.replace(/^origin\//, '') ?? 'main', add, del, ahead, behind, files }
})

export const worktreesOf = cached(10000, async root => {
  const out = await git(root, 'worktree', 'list', '--porcelain')
  if (!out.ok) return []
  return out.stdout.split(/\r?\n\r?\n/).map(block => {
    const path = /^worktree (.+)$/m.exec(block)?.[1]
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]
    return path && branch ? { path, branch } : null
  }).filter(Boolean)
})

// Open PRs by head branch, from gh where the repo has a GitHub remote; nothing otherwise.
export const prsOf = cached(60000, async root => {
  const out = await run('gh', ['pr', 'list', '--state', 'open', '--limit', '50', '--json',
    'number,title,headRefName,url,reviewDecision,mergeable,statusCheckRollup'], { cwd: root, timeout: 20000 })
  if (!out.ok) return {}
  const byBranch = {}
  for (const pr of JSON.parse(out.stdout)) {
    const checks = (pr.statusCheckRollup ?? []).map(c => [c.name ?? c.context ?? 'check',
      /SUCCESS|NEUTRAL|SKIPPED/.test(c.conclusion ?? c.state ?? '') ? 'pass' : /PENDING|QUEUED|IN_PROGRESS|EXPECTED/.test(c.status ?? c.state ?? '') ? 'pending' : 'fail'])
    byBranch[pr.headRefName] = {
      num: pr.number, title: `#${pr.number} ${pr.title}`, url: pr.url, checks,
      reviews: pr.reviewDecision === 'APPROVED' ? 'Approved' : pr.reviewDecision === 'CHANGES_REQUESTED' ? 'Changes requested' : 'No approval yet',
      mergeable: pr.mergeable === 'MERGEABLE' && checks.every(c => c[1] !== 'fail') && pr.reviewDecision !== 'CHANGES_REQUESTED',
    }
  }
  return byBranch
})

export async function knownRepos() {
  return (await readJson(join(TOWER, 'repos.json'))) ?? []
}

export async function listSessionFiles() {
  try { return await readdir(join(TOWER, 'sessions')) } catch { return [] }
}
