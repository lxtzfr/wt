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

export function listSlots(main: string): Slot[] {
  return git(main, 'worktree', 'list', '--porcelain')
    .split(/\r?\n\r?\n/)
    .map((block) => Object.fromEntries(block.split(/\r?\n/).map((line) => [line.split(' ')[0]!, line.split(' ').slice(1).join(' ')])))
    .flatMap((entry): Slot[] => {
      if (!entry.worktree) return []
      const path = normalize(entry.worktree)
      const n = slotNumber(main, path)
      if (n === null) return []
      return [{ n, name: basename(path), path, branch: entry.branch ? entry.branch.replace('refs/heads/', '') : null }]
    })
    .sort((a, b) => a.n - b.n)
}

export const findSlot = (main: string, nameOrNumber: string) =>
  listSlots(main).find((slot) => slot.name === nameOrNumber || String(slot.n) === nameOrNumber)

export const isClean = (path: string) => git(path, 'status', '--porcelain').length === 0

/** Unity holds Temp/UnityLockfile while a project is open: switching its branch then corrupts the import state. */
export const unityOpen = (path: string) => existsSync(join(path, 'Temp', 'UnityLockfile'))

export const isFree = (slot: Slot) => !slot.branch && isClean(slot.path) && !unityOpen(slot.path)
