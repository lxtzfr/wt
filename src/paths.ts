// A slot = a long-lived worktree `<parent>.wt/<repo>-<n>` (n >= 2, 1 being the main checkout). Its path never changes,
// so an IDE window, a Unity Hub entry, Claude's per-path memory and a warm Unity Library stay valid across tickets.
// Sibling repos share the main checkouts' parent (`<parent>/web`, `<parent>/server`), their slots `<parent>.wt/`.

import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/** One spelling per folder: git prints `C:/...`, Node `C:\...`, a cwd can be a Windows 8.3 short one (`ALEXAN~1`). */
export function normalize(path: string): string {
  let full = resolve(path)
  try {
    full = realpathSync.native(full)
  } catch {}
  return full.replace(/\\/g, '/').replace(/\/$/, '')
}

export const slotsDir = (main: string) => `${dirname(main)}.wt`
export const slotPath = (main: string, n: number) => normalize(join(slotsDir(main), `${basename(main)}-${n}`))
export const checkoutPath = (main: string, n: number) => (n === 1 ? main : slotPath(main, n))
export const repoMain = (main: string, repo: string) => (repo === basename(main) ? main : normalize(join(dirname(main), repo)))

/** `<repo>-<n>` -> n when `path` is a slot of `main`, else null. */
export function slotNumber(main: string, path: string): number | null {
  if (normalize(dirname(path)) !== normalize(slotsDir(main))) return null
  const match = basename(path).match(new RegExp(`^${basename(main).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`))
  return match && Number(match[1]) >= 2 ? Number(match[1]) : null
}
