// What a repo declares in package.json `localDev`:
//   "services": { "api": { "port": 3001, "run": "pnpm start:dev" } },
//   "env": { "PORT": "{port:api}", "WEB_URL": "{url:web/web}", "DATABASE_URL": "{database:DATABASE_URL}" },
//   "wt": { "copy": ["Library"], "setup": ["pnpm install"] }
// `myStack` is its name before v2, still read when `localDev` is absent.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const CONFIG_KEY = 'localDev'
const LEGACY_KEY = 'myStack'

export interface ServiceDecl {
  port?: number
  run?: string
}

export interface ProjectConfig {
  services?: Record<string, ServiceDecl>
  env?: Record<string, string>
  wt?: { copy?: string[]; setup?: string[] }
}

export function readJson(path: string): any {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null
  } catch {
    return null
  }
}

export function projectConfig(path: string): ProjectConfig {
  const pkg = readJson(join(path, 'package.json'))
  return pkg?.[CONFIG_KEY] ?? pkg?.[LEGACY_KEY] ?? {}
}
