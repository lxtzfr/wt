import { execFileSync, execSync } from 'node:child_process'

/** A failure the CLI prints as is (no stack): a wrong argument, a dirty slot, a failed command. */
export class WtError extends Error {}

export type Log = (message: string) => void
export const log: Log = (message) => console.log(`[wt] ${message}`)

/** Captured output, trimmed; throws with the command's stderr. */
export function run(cmd: string, args: string[], { cwd }: { cwd?: string } = {}): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim()
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string }
    throw new WtError(`${cmd} ${args.join(' ')}: ${(e.stderr || e.message || '').toString().trim()}`)
  }
}

export const git = (cwd: string, ...args: string[]) => run('git', ['-C', cwd, ...args])

/** A shell command shown live (pnpm is a .cmd on Windows: it needs the shell). */
export function sh(command: string, cwd: string): void {
  log(`$ ${command}`)
  execSync(command, { cwd, stdio: 'inherit' })
}
