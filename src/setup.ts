// What git doesn't carry into a slot: the env files (those env.map.json lists, plus `localDev.wt.copy`), its
// `.env.local` (services.ts), then the project's setup commands (`localDev.wt.setup`, default `pnpm install`).
// Values are never printed when they come from env files: those hold secrets.

import { cpSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Checkout } from './checkout.js'
import { projectConfig, readJson } from './config.js'
import { log, sh } from './run.js'
import { applyEnv } from './services.js'

function envFiles(main: string): string[] {
  const map = readJson(join(main, 'env.map.json')) ?? {}
  return [...Object.keys(map).filter((key) => key !== '$files'), ...Object.keys(map.$files ?? {})]
}

export function setupSlot(slot: Checkout): void {
  const config = projectConfig(slot.main).wt ?? {}
  for (const rel of [...envFiles(slot.main), ...(config.copy ?? [])]) {
    const from = join(slot.main, rel)
    const to = join(slot.path, rel)
    if (!existsSync(from) || existsSync(to)) continue
    log(`copying ${rel}${statSync(from).isDirectory() ? ' (folder, can take a while)' : ''}`)
    cpSync(from, to, { recursive: true })
  }

  applyEnv(slot)

  const setup = config.setup ?? (existsSync(join(slot.path, 'package.json')) ? ['pnpm install'] : [])
  for (const command of setup) sh(command, slot.path)
}
