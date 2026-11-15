// The managed block of a checkout's `.env.local`. Other tools (porlocal, a port supervisor) rewrite this same block
// with other ports: its markers are a contract, keep them stable. Kept first, so a hand-written line below it wins.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const LOCAL_ENV = '.env.local'
export const BLOCK_START = '# my-stack services: start (rewritten by `pnpm wt env`; override a key on a line below the block)'
const START_PREFIX = '# my-stack services: start'
export const BLOCK_END = '# my-stack services: end'

const readLines = (file: string) => (existsSync(file) ? readFileSync(file, 'utf-8').split(/\r?\n/) : [])

function blockRange(lines: string[]): [number, number] | null {
  const start = lines.findIndex((line) => line.startsWith(START_PREFIX))
  const end = lines.indexOf(BLOCK_END)
  return start >= 0 && end > start ? [start, end] : null
}

const parse = (lines: string[]) =>
  Object.fromEntries(
    lines
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).replace(/^(["'])(.*)\1$/, '$2')]),
  ) as Record<string, string>

/** Every `KEY=value` of an env file (`.env`, `.env.local`), quotes stripped. */
export const readEnv = (file: string) => parse(readLines(file))

/** The managed block of `dir`'s `.env.local`. */
export function readBlock(dir: string): Record<string, string> {
  const lines = readLines(join(dir, LOCAL_ENV))
  const range = blockRange(lines)
  return range ? parse(lines.slice(range[0] + 1, range[1])) : {}
}

/** Replaces the managed block, keeps every other line. Returns true when the file changed. */
export function writeBlock(dir: string, values: Record<string, string>): boolean {
  const file = join(dir, LOCAL_ENV)
  const lines = readLines(file)
  const range = blockRange(lines)
  const rest = range ? [...lines.slice(0, range[0]), ...lines.slice(range[1] + 1)] : lines
  const block = Object.keys(values).length ? [BLOCK_START, ...Object.entries(values).map(([k, v]) => `${k}=${v}`), BLOCK_END] : []
  const content = [...block, ...rest].join('\n').replace(/^\n+/, '').replace(/\n*$/, '\n')
  const before = existsSync(file) ? readFileSync(file, 'utf-8') : null
  if (before === null && !content.trim()) return false
  const next = content.trim() ? content : ''
  if (next === before) return false
  writeFileSync(file, next, 'utf-8')
  return true
}
