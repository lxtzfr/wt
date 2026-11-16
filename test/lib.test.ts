import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BLOCK_END, BLOCK_START, envRefs, listProjects, listWorktrees, registerProject, projectConfig, markerPath, normalize, readBlock, readMarker, resolveCheckout, resolveEnv, slotPath, writeBlock, type Checkout } from '../src/index.js'
import { slugify } from '../src/issue.js'
import { sh, workspace } from './helpers.js'

const ws = workspace({
  server: { services: { api: { port: 3001 } }, env: { PORT: '{port:api}', DATABASE_URL: '{database:DATABASE_URL}' } },
  web: { services: { web: { port: 4100 } }, env: { API_URL: '{url:server/api}' } },
})
const server = ws.main('server')
const web = ws.main('web')

describe('resolveCheckout', () => {
  it('tells a main checkout, a slot and a worktree outside the layout apart', () => {
    sh(server, 'git', 'worktree', 'add', '--quiet', '--detach', slotPath(server, 3))
    sh(server, 'git', 'worktree', 'add', '--quiet', '--detach', join(ws.root, 'elsewhere'))
    expect(resolveCheckout(join(server, 'node_modules', '..'))).toMatchObject({ n: 1, name: 'server', main: server })
    expect(resolveCheckout(slotPath(server, 3))).toMatchObject({ n: 3, name: 'server-3', main: server })
    expect(resolveCheckout(join(ws.root, 'elsewhere'))).toMatchObject({ n: null, name: 'server@elsewhere' })
    const plain = normalize(mkdtempSync(join(tmpdir(), 'wt-plain-')))
    expect(resolveCheckout(plain)).toMatchObject({ path: plain, main: plain, n: 1, links: {} })
  })

  it('reads a marker written before its version field as version 1', () => {
    writeFileSync(markerPath(slotPath(server, 3)), JSON.stringify({ branch: 'b', links: { web: 2 } }))
    expect(readMarker(slotPath(server, 3))).toMatchObject({ version: 1, branch: 'b', issue: null, links: { web: 2 } })
  })
})

describe('resolveEnv', () => {
  const slot: Checkout = { path: slotPath(web, 2), main: web, repo: 'web', n: 2, name: 'web-2', links: { server: 3 } }

  it('follows the links, or takes the ports another tool leased', () => {
    sh(web, 'git', 'worktree', 'add', '--quiet', '--detach', slot.path)
    expect(resolveEnv(slot).values).toEqual({ API_URL: 'http://localhost:3021' })
    expect(resolveEnv(slot, { portOf: (t) => (t.repo === 'server' ? 5000 : undefined) }).values).toEqual({ API_URL: 'http://localhost:5000' })
    expect(resolveEnv(slot, { portOf: () => undefined }).skipped).toEqual([{ key: 'API_URL', reason: 'no port for server/api' }])
    expect(envRefs(slot)).toEqual([{ key: 'API_URL', target: { path: slotPath(server, 3), main: server, repo: 'server', n: 3, service: 'api' } }])
  })

  it('gives a slot its own database, the main checkout keeps its .env', () => {
    writeFileSync(join(server, '.env'), 'DATABASE_URL="postgres://u:p@localhost:5432/app"\n')
    const main = resolveCheckout(server)
    expect(resolveEnv(main).values).toEqual({ PORT: '3001' })
    const r = resolveEnv({ ...main, path: slotPath(server, 3), n: 3 })
    expect(r.values).toEqual({ PORT: '3021', DATABASE_URL: 'postgres://u:p@localhost:5432/app_3' })
    expect(r.secret).toEqual(['DATABASE_URL'])
  })
})

describe('.env.local block', () => {
  it('replaces the block only, and says when the file changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wt-env-'))
    writeFileSync(join(dir, '.env.local'), 'OTHER=1\n')
    expect(writeBlock(dir, { A: '1' })).toBe(true)
    expect(writeBlock(dir, { A: '1' })).toBe(false)
    expect(readBlock(dir)).toEqual({ A: '1' })
    expect(writeBlock(dir, {})).toBe(true)
    expect(readBlock(dir)).toEqual({})
  })

  it('reads a v1 block, and replaces it with the new markers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wt-env-'))
    writeFileSync(join(dir, '.env.local'), '# my-stack services: start (rewritten by `pnpm wt env`)\nA=1\n# my-stack services: end\nOTHER=1\n')
    expect(readBlock(dir)).toEqual({ A: '1' })
    expect(writeBlock(dir, { A: '2' })).toBe(true)
    expect(readFileSync(join(dir, '.env.local'), 'utf-8')).toBe(`${BLOCK_START}\nA=2\n${BLOCK_END}\nOTHER=1\n`)
  })
})

describe('projectConfig', () => {
  it('reads localDev, else the v1 myStack key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wt-config-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ myStack: { env: { A: '1' } } }))
    expect(projectConfig(dir).env).toEqual({ A: '1' })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ myStack: { env: { A: '1' } }, localDev: { env: { B: '2' } } }))
    expect(projectConfig(dir).env).toEqual({ B: '2' })
  })
})

it('slugifies a title into a branch name', () => {
  expect(slugify("Ma tâche: écran d'accueil du jeu")).toBe('ma-tache-ecran-d-accueil')
})

describe('worktrees and the project map', () => {
  it('lists every worktree, those outside the slot layout too', () => {
    const list = listWorktrees(server)
    expect(list.map((w) => [w.name, w.n])).toEqual(expect.arrayContaining([['server', 1], ['server-3', 3], ['elsewhere', null]]))
  })

  it('registers a main checkout once, lists the ones still there', () => {
    registerProject(server)
    registerProject(server)
    const gone = normalize(mkdtempSync(join(tmpdir(), 'wt-gone-')))
    registerProject(gone)
    expect(listProjects().map((p) => p.path)).toContain(server)
    expect(listProjects().map((p) => p.path)).not.toContain(gone)
  })
})
