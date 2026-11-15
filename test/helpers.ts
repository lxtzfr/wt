import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalize } from '../src/paths.js'

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js')
const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
Object.assign(process.env, IDENTITY)

export const sh = (cwd: string, cmd: string, ...args: string[]) => execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** `<tmp>/ws/<repo>` main checkouts, each cloned from a bare `<tmp>/origin/<repo>.git` holding its package.json. */
export function workspace(repos: Record<string, object>): { root: string; main: (repo: string) => string } {
  const tmp = normalize(mkdtempSync(join(tmpdir(), 'wt-')))
  const root = join(tmp, 'ws')
  mkdirSync(root)
  for (const [repo, config] of Object.entries(repos)) {
    const origin = join(tmp, 'origin', `${repo}.git`)
    mkdirSync(origin, { recursive: true })
    sh(origin, 'git', 'init', '--quiet', '--bare', '--initial-branch=main')
    sh(root, 'git', 'clone', '--quiet', origin, repo)
    const main = join(root, repo)
    writeFileSync(join(main, 'package.json'), `${JSON.stringify({ name: repo, localDev: { wt: { setup: [] }, ...config } }, null, 2)}\n`)
    writeFileSync(join(main, '.gitignore'), '.env.local\n')
    sh(main, 'git', 'add', '.')
    sh(main, 'git', 'commit', '--quiet', '-m', 'init')
    sh(main, 'git', 'push', '--quiet', '-u', 'origin', 'main')
    sh(main, 'git', 'remote', 'set-head', 'origin', 'main')
  }
  return { root: normalize(root), main: (repo) => normalize(join(root, repo)) }
}

/** Runs the built CLI in `cwd`; never throws, returns its output. */
export function wt(cwd: string, ...args: string[]): { status: number | null; out: string } {
  const env = { ...process.env, INIT_CWD: '' }
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf-8', env })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}
