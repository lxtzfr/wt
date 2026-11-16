// Free slot = detached on the default branch with a clean tree; the branch carries the ticket.

import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { git } from './run.js'
import { normalize, slotNumber } from './paths.js'

export interface Slot {
  n: number
  name: string
  path: string
  branch: string | null
}

export const mainRoot = (cwd: string) => normalize(dirname(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir')))

export const isMainCheckout = (cwd: string) => normalize(git(cwd, 'rev-parse', '--show-toplevel')) === mainRoot(cwd)

export function defaultBranch(main: string): string {
  try {
    return git(main, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '')
  } catch {
    return 'main'
  }
}

/** Every git worktree of the repo: the main checkout (n 1), its slots (n >= 2), the others (n null: outside the layout). */
export interface Worktree extends Omit<Slot, 'n'> {
  n: number | null
}

export function listWorktrees(main: string): Worktree[] {
  return git(main, 'worktree', 'list', '--porcelain')
    .split(/\r?\n\r?\n/)
    .map((block) => Object.fromEntries(block.split(/\r?\n/).map((line) => [line.split(' ')[0]!, line.split(' ').slice(1).join(' ')])))
    .flatMap((entry): Worktree[] => {
      if (!entry.worktree) return []
      const path = normalize(entry.worktree)
      return [{ n: path === normalize(main) ? 1 : slotNumber(main, path), name: basename(path), path, branch: entry.branch ? entry.branch.replace('refs/heads/', '') : null }]
    })
    .sort((a, b) => (a.n ?? 99) - (b.n ?? 99) || a.path.localeCompare(b.path))
}

export const listSlots = (main: string): Slot[] => listWorktrees(main).filter((w): w is Slot => w.n !== null && w.n >= 2)

export const findSlot = (main: string, nameOrNumber: string) =>
  listSlots(main).find((slot) => slot.name === nameOrNumber || String(slot.n) === nameOrNumber)

export const isClean = (path: string) => git(path, 'status', '--porcelain').length === 0

/** Unity holds Temp/UnityLockfile while a project is open: switching its branch then corrupts the import state. */
export const unityOpen = (path: string) => existsSync(join(path, 'Temp', 'UnityLockfile'))

export const isFree = (slot: Slot) => !slot.branch && isClean(slot.path) && !unityOpen(slot.path)
