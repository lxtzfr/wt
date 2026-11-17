import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readBlock, readMarker, slotPath } from '../src/index.js'
import { sh, workspace, wt } from './helpers.js'

// A ticket over 2 repos: web reads the server's URL, the server the web's.
const ws = workspace({
  server: { services: { api: { port: 3001 } }, env: { PORT: '{port:api}', WEB_URL: '{url:web/web}' } },
  web: { services: { web: { port: 4100 } }, env: { PORT: '{port:web}', API_URL: '{url:server/api}' } },
})
const server = ws.main('server')
const web = ws.main('web')
const server2 = slotPath(server, 2)
const web2 = slotPath(web, 2)

describe('wt', () => {
  beforeAll(() => {
    expect(wt(server, 'env').status).toBe(0)
    expect(wt(web, 'env').status).toBe(0)
  })

  it('writes the main checkouts declared ports', () => {
    expect(readBlock(server)).toEqual({ PORT: '3001', WEB_URL: 'http://localhost:4100' })
    expect(readBlock(web)).toEqual({ PORT: '4100', API_URL: 'http://localhost:3001' })
  })

  it('creates a slot only when asked', () => {
    const r = wt(server, 'new', '--branch', '5-x')
    expect(r.status).toBe(1)
    expect(r.out).toContain('no free slot')
  })

  it('opens a ticket over two repos, linked both ways', () => {
    expect(wt(server, 'new', '--branch', '5-x', '--new-slot').status).toBe(0)
    expect(readBlock(server2)).toEqual({ PORT: '3011', WEB_URL: 'http://localhost:4100' })

    const r = wt(web, 'new', '--branch', '5-x', '--new-slot', '--link', 'server-2')
    expect(r.status, r.out).toBe(0)
    expect(readBlock(web2)).toEqual({ PORT: '4110', API_URL: 'http://localhost:3011' })
    expect(readMarker(web2)).toMatchObject({ version: 1, branch: '5-x', links: { server: 2 } })
    expect(readMarker(server2).links).toEqual({ web: 2 })
    expect(readBlock(server2).WEB_URL).toBe('http://localhost:4110')
  })

  it('lists the slots with their branch and links', () => {
    const out = wt(server, 'list').out
    expect(out).toMatch(/server-2\s+5-x\s+clean\s+web-2/)
  })

  it('refuses slot commands outside the main checkout', () => {
    expect(wt(server2, 'free', 'server-2').out).toContain('run it from the main checkout')
  })

  it('frees a slot: its links and their links back are gone', () => {
    const r = wt(server, 'free', 'server-2')
    expect(r.status, r.out).toBe(0)
    expect(readMarker(server2)).toMatchObject({ branch: null, links: {} })
    expect(readMarker(web2).links).toEqual({})
    expect(readBlock(web2).API_URL).toBe('http://localhost:3001')
    expect(sh(server2, 'git', 'branch', '--list', '5-x')).toContain('5-x')
  })

  it('reuses a free slot for the next ticket', () => {
    const r = wt(server, 'new', '--branch', '6-y')
    expect(r.status, r.out).toBe(0)
    expect(r.out).toContain('reusing server-2')
  })

  it('merges a done ticket with a merge commit and frees its slot', () => {
    writeFileSync(join(web2, 'feature.txt'), 'x\n')
    sh(web2, 'git', 'add', 'feature.txt')
    sh(web2, 'git', 'commit', '--quiet', '-m', '#5: feature')
    const r = wt(web, 'done', 'web-2')
    expect(r.status, r.out).toBe(0)
    expect(existsSync(join(web, 'feature.txt'))).toBe(true)
    expect(sh(web, 'git', 'log', '-1', '--format=%s %P')).toMatch(/^#5: Merge branch '5-x' \w+ \w+$/)
    expect(sh(web, 'git', 'ls-remote', '--heads', 'origin', '5-x')).toBe('')
    expect(readMarker(web2).branch).toBeNull()
  })

  it('keeps a hand-written override below the block', () => {
    writeFileSync(join(web, '.env.local'), `${readFileSync(join(web, '.env.local'), 'utf-8')}API_URL=http://localhost:9999\n`)
    expect(wt(web, 'env').status).toBe(0)
    expect(readFileSync(join(web, '.env.local'), 'utf-8').trim().split('\n').at(-1)).toBe('API_URL=http://localhost:9999')
  })

  it('removes a slot', () => {
    expect(wt(web, 'remove', 'web-2').status).toBe(0)
    expect(existsSync(web2)).toBe(false)
  })

  it('registers its repo by itself, and by hand', () => {
    expect(wt(web, 'projects').out).toContain(web)
    const other = workspace({ api: {} }).main('api')
    expect(wt(other, 'register').status).toBe(0)
    expect(wt(other, 'projects').out).toContain(other)
  })
})
