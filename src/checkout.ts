import { basename } from 'node:path'
import { readMarker, type Links } from './marker.js'
import { normalize, slotNumber } from './paths.js'
import { git, WtError } from './run.js'
import { mainRoot } from './slots.js'

/** A repo's main checkout (n = 1) or one of its slots; n = null for a worktree outside the slot layout. */
export interface Checkout {
  path: string
  main: string
  repo: string
  n: number | null
  /** `server`, `server-2`, `server@<folder>` outside the layout. */
  name: string
  links: Links
}

/** The checkout `cwd` is in; a folder outside git is its own main checkout. */
export function resolveCheckout(cwd: string): Checkout {
  let top: string | null = null
  try {
    top = git(cwd, 'rev-parse', '--show-toplevel')
  } catch {}
  const path = normalize(top ?? cwd)
  const main = top ? mainRoot(path) : path
  const repo = basename(main)
  const n = path === main ? 1 : slotNumber(main, path)
  const name = n === 1 ? repo : n ? `${repo}-${n}` : `${repo}@${basename(path)}`
  return { path, main, repo, n, name, links: top ? readMarker(path).links : {} }
}

/** Same, for a command that needs the slot layout (its ports, its links). */
export function currentCheckout(cwd: string): Checkout & { n: number } {
  const checkout = resolveCheckout(cwd)
  if (checkout.n === null) throw new WtError(`${checkout.path} is neither the main checkout ${checkout.main} nor one of its slots`)
  return checkout as Checkout & { n: number }
}
