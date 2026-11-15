// Ticket info, links and last session start, in the slot's own git dir: never in the tree, gone with the worktree.
// Read by other tools (porlocal, an IDE's worktree view, my-stack's session hook): renaming or removing a field is a
// breaking change, bump MARKER_VERSION.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './run.js'

export const MARKER_FILE = 'my-stack-wt.json'
export const MARKER_VERSION = 1

/** Repo name -> slot n of that sibling repo this checkout talks to (absent = its main checkout). */
export type Links = Record<string, number>

export interface Marker {
  version: number
  branch: string | null
  issue: number | null
  title: string | null
  lastSession: string | null
  links: Links
}

const EMPTY: Marker = { version: MARKER_VERSION, branch: null, issue: null, title: null, lastSession: null, links: {} }

export const markerPath = (path: string) => join(git(path, 'rev-parse', '--path-format=absolute', '--git-dir'), MARKER_FILE)

/** A marker written before `version` existed is version 1. */
export function readMarker(path: string): Marker {
  try {
    return { ...EMPTY, ...JSON.parse(readFileSync(markerPath(path), 'utf-8')) }
  } catch {
    return { ...EMPTY }
  }
}

export function writeMarker(path: string, data: Partial<Marker>): Marker {
  const marker = { ...EMPTY, ...data, version: MARKER_VERSION }
  writeFileSync(markerPath(path), `${JSON.stringify(marker, null, 2)}\n`, 'utf-8')
  return marker
}
