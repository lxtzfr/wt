// What a repo declares in package.json `myStack`:
//   "services": { "api": { "port": 3001, "run": "pnpm start:dev" } },
//   "env": { "PORT": "{port:api}", "WEB_URL": "{url:web/web}", "DATABASE_URL": "{database:DATABASE_URL}" },
//   "wt": { "copy": ["Library"], "setup": ["pnpm install"] }

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ServiceDecl {
  port?: number
  run?: string
}

export interface MyStackConfig {
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

export const myStackConfig = (path: string): MyStackConfig => readJson(join(path, 'package.json'))?.myStack ?? {}
