// The projects wt (or a tool built on it) ran in, one map per user: `~/.wt/projects.json` (`WT_HOME` moves it).
// A tool lists them to show every project, not only what it launched itself.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalize } from './paths.js'

export interface RegisteredProject {
  /** The main checkout. */
  path: string
  /** ISO time of the last command or tool run there. */
  lastSeen: string
}

const REFRESH_MS = 60 * 60 * 1000

export const registryFile = () => join(process.env.WT_HOME || join(homedir(), '.wt'), 'projects.json')

function read(): Record<string, string> {
  try {
    const data = JSON.parse(readFileSync(registryFile(), 'utf-8')) as Record<string, string>
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** Adds a main checkout (or refreshes its `lastSeen`, at most hourly: a command is not a write each time). */
export function registerProject(main: string): void {
  const path = normalize(main)
  const projects = read()
  const seen = Date.parse(projects[path] ?? '')
  if (Number.isFinite(seen) && Date.now() - seen < REFRESH_MS) return
  projects[path] = new Date().toISOString()
  mkdirSync(join(registryFile(), '..'), { recursive: true })
  writeFileSync(registryFile(), `${JSON.stringify(projects, null, 2)}
`)
}

/** The registered projects whose main checkout still exists, the latest seen first. */
export function listProjects(): RegisteredProject[] {
  return Object.entries(read())
    .filter(([path]) => existsSync(join(path, '.git')))
    .map(([path, lastSeen]) => ({ path, lastSeen }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
}
