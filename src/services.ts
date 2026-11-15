// A checkout's ports and links to sibling repos, declared in package.json `localDev` (config.ts), resolved into its
// `.env.local` block. Slot n: every declared port + 10 * (n - 1), the database name gets `_<n>`. `<repo>/<service>`:
// the sibling repo's main checkout, or its slot picked with `wt link`. `.env` (vault) is never written.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Checkout } from './checkout.js'
import { projectConfig, readJson } from './config.js'
import { LOCAL_ENV, readEnv, writeBlock } from './envLocal.js'
import { checkoutPath, repoMain } from './paths.js'
import { log as defaultLog, WtError, type Log } from './run.js'

const PLACEHOLDER = /\{(port|url|database):([^}]+)\}/g

export const slotPort = (port: number, n: number) => port + 10 * (n - 1)

/** The checkout and service a `<service>` (this checkout) or `<repo>/<service>` reference points at. */
export interface Target {
  path: string
  main: string
  repo: string
  n: number | null
  service: string
}

export function refTarget(checkout: Checkout, ref: string): Target {
  const [repo, service] = ref.includes('/') ? (ref.split('/') as [string, string]) : [checkout.repo, ref]
  if (repo === checkout.repo) return { path: checkout.path, main: checkout.main, repo, n: checkout.n, service }
  const main = repoMain(checkout.main, repo)
  const n = checkout.links[repo] ?? 1
  return { path: checkoutPath(main, n), main, repo, n, service }
}

/** The port a service declares, the checkout's own declaration first (a branch may move a port), else its main's. */
export function declaredPort(path: string, main: string, service: string): number | undefined {
  const port = projectConfig(path).services?.[service]?.port ?? projectConfig(main).services?.[service]?.port
  return port ? Number(port) : undefined
}

/** Where a target listens; undefined or a throw: its key is skipped. */
export type PortOf = (target: Target) => number | undefined

/** wt's own answer: the declared port, shifted for the slot. Another tool (porlocal) passes the ports it leased. */
export const slotPortOf: PortOf = (target) => {
  if (target.n === null) throw new WtError(`${target.path} is outside the slot layout: no port to derive`)
  if (!existsSync(target.path)) throw new WtError(`${target.path} does not exist`)
  const port = declaredPort(target.path, target.main, target.service)
  if (!port) throw new WtError(`${target.repo} declares no service "${target.service}" with a port (localDev.services)`)
  return slotPort(port, target.n)
}

/** Every `{port:<ref>}` / `{url:<ref>}` of the env: which key points at which service of which checkout. */
export function envRefs(checkout: Checkout, env = projectConfig(checkout.path).env ?? {}): { key: string; target: Target }[] {
  return Object.entries(env).flatMap(([key, template]) =>
    [...template.matchAll(PLACEHOLDER)].filter(([, kind]) => kind !== 'database').map(([, , ref]) => ({ key, target: refTarget(checkout, ref!) })),
  )
}

/** The main checkout keeps its `.env` database (no copy of a vault value in `.env.local`): null skips the key. */
function resolveDatabase(checkout: Checkout, key: string): string | null {
  if (checkout.n === 1 || checkout.n === null) return null
  const value = readEnv(join(checkout.main, '.env'))[key]
  if (!value) throw new WtError(`no ${key} in ${join(checkout.main, '.env')}`)
  const url = new URL(value)
  url.pathname = `${url.pathname.replace(/_\d+$/, '')}_${checkout.n}`
  return url.toString()
}

export interface ResolvedEnv {
  values: Record<string, string>
  /** Keys holding a vault-derived value: never printed. */
  secret: string[]
  skipped: { key: string; reason: string }[]
}

/** `localDev.env` of the checkout with every placeholder resolved. */
export function resolveEnv(checkout: Checkout, { env = projectConfig(checkout.path).env ?? {}, portOf = slotPortOf }: { env?: Record<string, string>; portOf?: PortOf } = {}): ResolvedEnv {
  const result: ResolvedEnv = { values: {}, secret: [], skipped: [] }
  for (const [key, template] of Object.entries(env)) {
    try {
      let skip = false
      const value = template.replace(PLACEHOLDER, (_, kind: string, ref: string) => {
        if (kind === 'database') {
          result.secret.push(key)
          const url = resolveDatabase(checkout, ref)
          if (url === null) skip = true
          return url ?? ''
        }
        const port = portOf(refTarget(checkout, ref))
        if (port === undefined) throw new WtError(`no port for ${ref}`)
        return kind === 'url' ? `http://localhost:${port}` : String(port)
      })
      if (!skip) result.values[key] = value
    } catch (err) {
      result.skipped.push({ key, reason: (err as Error).message })
    }
  }
  return result
}

/** Rewrites the checkout's `.env.local` block from its declarations (after a port or link change). */
export function applyEnv(checkout: Checkout, log: Log = defaultLog): ResolvedEnv {
  const resolved = resolveEnv(checkout)
  writeBlock(checkout.path, resolved.values)
  for (const [key, value] of Object.entries(resolved.values)) log(`${LOCAL_ENV}: ${key}${resolved.secret.includes(key) ? ' set' : `=${value}`}`)
  for (const { key, reason } of resolved.skipped) log(`${LOCAL_ENV}: skipped ${key}: ${reason}`)
  return resolved
}
