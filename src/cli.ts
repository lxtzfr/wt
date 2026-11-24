#!/usr/bin/env node
// One slot (a long-lived worktree) per ticket worked in parallel; run from the main checkout (list, env, link: anywhere).

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentCheckout, type Checkout } from './checkout.js'
import { branchName, createIssue, getIssue, repoSlug, setIssueBody, slugify, type Issue } from './issue.js'
import { readMarker, writeMarker, type Links } from './marker.js'
import { normalize, repoMain, slotPath } from './paths.js'
import { listProjects, registerProject, registryFile } from './registry.js'
import { git, log, WtError } from './run.js'
import { applyEnv } from './services.js'
import { setupSlot } from './setup.js'
import { defaultBranch, findSlot, isClean, isFree, isMainCheckout, listSlots, mainRoot, unityOpen, type Slot } from './slots.js'

const USAGE = `usage:
  wt new "<title>" [--type Task|Bug|Question] | new --issue <n> | new --branch <name>   [--new-slot] [--link <slot>,..]
  wt new "<title>" --repos <repo>,<repo>[,..] [--type ..] [--new-slot]   (from the workspace repo: one slot per repo)
  wt list | wt setup <slot> | wt done <slot> | wt free <slot> | wt remove <slot> [--force]
  wt env | wt link [<repo>-<n> | <repo>]...   (the checkout it runs in)
  wt register [<dir>...] | wt projects   (every command registers its repo in ~/.wt/projects.json; this adds one by hand, lists them)`

// pnpm runs a script from the package root: INIT_CWD is where the user typed it.
const cwd = normalize(process.env.INIT_CWD || process.cwd())

interface Opts {
  _: string[]
  [flag: string]: string | boolean | string[] | undefined
}

function parse(args: string[]): Opts {
  const opts: Opts = { _: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--force' || arg === '--new-slot') opts[arg.slice(2)] = true
    else if (arg.startsWith('--')) opts[arg.slice(2)] = args[++i]
    else opts._.push(arg)
  }
  return opts
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)

function requireMain(): string {
  const main = mainRoot(cwd)
  if (!isMainCheckout(cwd)) throw new WtError(`run it from the main checkout (${main}), not from a slot`)
  return main
}

function requireSlot(main: string, name: string | undefined): Slot {
  const slot = name ? findSlot(main, name) : undefined
  if (!slot) throw new WtError(`unknown slot "${name ?? ''}": ${listSlots(main).map((s) => s.name).join(', ') || 'none yet'}`)
  return slot
}

const asCheckout = (main: string, slot: Slot, links: Links): Checkout => ({ path: slot.path, main, repo: basename(main), n: slot.n, name: slot.name, links })

/** `server-2` -> server's slot 2, `server` -> its main checkout (the default, so no entry). Throws on a missing one. */
function parseLinks(main: string, args: string[], links: Links = {}): Links {
  const next = { ...links }
  for (const arg of args.flatMap((a) => a.split(','))) {
    const [, repo, n] = arg.match(/^(.+?)(?:-(\d+))?$/)!
    const target = repoMain(main, repo!)
    if (!existsSync(target)) throw new WtError(`no checkout of ${repo} at ${target}`)
    if (!n || n === '1') delete next[repo!]
    else if (!existsSync(slotPath(target, Number(n)))) throw new WtError(`no slot ${arg} at ${slotPath(target, Number(n))}`)
    else next[repo!] = Number(n)
  }
  return next
}

const describeLinks = (links: Links) =>
  Object.entries(links)
    .map(([repo, n]) => `${repo}-${n}`)
    .join(', ')

/** A ticket's branch: reuse it (local or pushed) when it exists, else start it from the default branch. */
function checkoutBranch(path: string, branch: string, base: string): void {
  if (git(path, 'branch', '--list', branch)) git(path, 'switch', branch)
  else if (git(path, 'ls-remote', '--heads', 'origin', branch)) git(path, 'switch', '-c', branch, '--track', `origin/${branch}`)
  else git(path, 'switch', '-c', branch, `origin/${base}`)
}

/**
 * From the workspace repo (the repos are its sub-folders): an umbrella issue here, then per repo an issue linking back
 * and that repo's own `wt new` (its setup, its slots), each slot linked to the previous ones (links go both ways).
 */
function cmdNewAcross(opts: Opts): void {
  const main = requireMain()
  const repos = str(opts.repos)!.split(',').map((r) => r.trim()).filter(Boolean)
  const title = opts._[0]
  if (!title || repos.length < 2) throw new WtError('usage: wt new "<title>" --repos <repo>,<repo>[,..]   (run from the workspace repo)')
  for (const repo of repos) if (!existsSync(join(main, repo, '.git'))) throw new WtError(`${repo}: no git repo at ${join(main, repo)}`)
  const type = str(opts.type) ?? 'Task'
  const umbrella = createIssue(main, title, type)
  const umbrellaRef = `${repoSlug(main)}#${umbrella.number}`
  log(`umbrella ${umbrellaRef} ${title} (${umbrella.url})`)
  const parts: string[] = []
  const slots: string[] = []
  try {
    for (const repo of repos) {
      const path = join(main, repo)
      const issue = createIssue(path, title, type, `Part of ${umbrellaRef}.`)
      parts.push(`- [ ] ${repoSlug(path)}#${issue.number}`)
      console.log('')
      log(`${repo}: issue #${issue.number}${slots.length ? `, linked to ${slots.join(', ')}` : ''}`)
      const args = [fileURLToPath(import.meta.url), 'new', '--issue', String(issue.number), ...(opts['new-slot'] ? ['--new-slot'] : []), ...(slots.length ? ['--link', slots.join(',')] : [])]
      // INIT_CWD wins over cwd: point it at the sub-repo.
      const r = spawnSync(process.execPath, args, { cwd: path, stdio: 'inherit', env: { ...process.env, INIT_CWD: path } })
      if (r.status !== 0) throw new WtError(`${repo}: wt new failed (its issue #${issue.number} stays open)`)
      slots.push(listSlots(normalize(path)).find((s) => s.branch === branchName(issue))!.name)
    }
  } finally {
    setIssueBody(main, umbrella.number, parts.join('\n'))
  }
  console.log('')
  log(`${umbrellaRef}: ${slots.join(', ')} linked to each other; one session per slot (its /rename above)`)
}

function cmdNew(opts: Opts): void {
  if (opts.repos) return cmdNewAcross(opts)
  const main = requireMain()
  const base = defaultBranch(main)
  git(main, 'fetch', '--quiet', 'origin')
  const slots = listSlots(main)
  let slot = slots.find(isFree)
  // A slot costs disk (Unity Library), a database, an IDE / Unity Hub entry: creating one is the user's call.
  if (!slot && !opts['new-slot']) {
    if (slots.length) cmdList()
    throw new WtError('no free slot: free one (wt free <slot> / wt done <slot>) or create one with --new-slot (ask the user first)')
  }

  let issue: Issue | null = null
  let branch = str(opts.branch)
  if (!branch) {
    if (opts.issue) issue = getIssue(main, str(opts.issue)!)
    else if (opts._[0]) issue = createIssue(main, opts._[0], str(opts.type) ?? 'Task')
    else throw new WtError('usage: wt new "<title>" [--type Task] | --issue <n> | --branch <name>')
    branch = branchName(issue)
    log(`issue #${issue.number} ${issue.title} (${issue.url})`)
  }

  const links = parseLinks(main, opts.link ? [str(opts.link)!] : [])
  const taken = slots.find((s) => s.branch === branch)
  if (taken) throw new WtError(`${branch} is already in ${taken.name}`)
  const created = !slot
  if (!slot) {
    const n = Math.max(1, ...slots.map((s) => s.n)) + 1
    const path = slotPath(main, n)
    slot = { n, name: basename(path), path, branch: null }
    log(`creating ${slot.name} at ${slot.path}`)
    git(main, 'worktree', 'add', '--detach', slot.path, `origin/${base}`)
  } else {
    log(`reusing ${slot.name}`)
  }

  checkoutBranch(slot.path, branch, base)
  writeMarker(slot.path, { branch, issue: issue?.number ?? null, title: issue?.title ?? null, links })
  const checkout = asCheckout(main, slot, links)
  setupSlot(checkout)
  linkBack(checkout, {}, links)

  const name = issue ? `${slot.name} #${issue.number} ${slugify(issue.title)}` : `${slot.name} ${branch}`
  console.log('')
  log(`${slot.name} is on ${branch}`)
  console.log(`  open:    code "${slot.path}"   (then start the ticket's Claude session there)`)
  console.log(`  /rename: ${name}`)
  if (created && existsSync(join(slot.path, 'Assets'))) console.log(`  Unity:   add "${slot.path}" to Unity Hub once (its path never changes)`)
}

function cmdList(): void {
  const main = mainRoot(cwd)
  const slots = listSlots(main)
  if (slots.length === 0) return log(`no slot yet for ${main}`)
  const rows = slots.map((slot) => {
    const marker = readMarker(slot.path)
    const issue = slot.branch && marker.branch === slot.branch && marker.issue ? `#${marker.issue} ${marker.title}` : ''
    const state = unityOpen(slot.path) ? 'unity open' : isClean(slot.path) ? 'clean' : 'dirty'
    const last = marker.lastSession ? new Date(marker.lastSession).toLocaleString() : ''
    return [slot.name, slot.branch ?? '(free)', issue, state, describeLinks(marker.links), last]
  })
  const head = ['slot', 'branch', 'issue', 'state', 'links', 'last session']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)))
  for (const row of [head, ...rows]) console.log(row.map((cell, i) => cell.padEnd(widths[i]!)).join('  ').trimEnd())
}

function cmdSetup(opts: Opts): void {
  const main = mainRoot(cwd)
  const slot = requireSlot(main, opts._[0])
  setupSlot(asCheckout(main, slot, readMarker(slot.path).links))
}

/** Rewrites this checkout's `.env.local` (after a port or link change, or once in the main checkout). */
function cmdEnv(): void {
  applyEnv(currentCheckout(cwd))
}

function setLinks(checkout: Checkout, links: Links): void {
  writeMarker(checkout.path, { ...readMarker(checkout.path), links })
  log(`${checkout.name} links: ${describeLinks(links) || 'none (main checkouts)'}`)
  applyEnv({ ...checkout, links })
}

/**
 * Points this checkout's `{url:<repo>/...}` at another repo's slot, and that slot back at this checkout (a ticket over
 * 2 repos talks both ways: web -> api, api -> web URL). Links last until the slot is freed.
 */
function cmdLink(opts: Opts): void {
  const checkout = currentCheckout(cwd)
  if (opts._.length === 0) return log(`${checkout.name} links: ${describeLinks(checkout.links) || 'none (main checkouts)'}`)
  const links = parseLinks(checkout.main, opts._, checkout.links)
  setLinks(checkout, links)
  linkBack(checkout, checkout.links, links)
  log('restart the services that read these keys')
}

/**
 * The slots `from` no longer links drop their link back, the ones `to` links point back at the checkout (main
 * checkouts hold no entry). A slot missing on disk (removed) is skipped.
 */
function linkBack(checkout: Checkout, from: Links, to: Links): void {
  for (const other of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[other] === to[other]) continue
    for (const [n, back] of [[from[other], null], [to[other], checkout.n]] as const) {
      const path = n && slotPath(repoMain(checkout.main, other), n)
      if (!path || !existsSync(path)) continue
      const target = currentCheckout(path)
      const next = { ...target.links }
      if (back && back !== 1) next[checkout.repo] = back
      else delete next[checkout.repo]
      setLinks(target, next)
    }
  }
}

/** Back to free: no ticket, no links (the slots it was linked with point at the main checkout again). */
function releaseSlot(main: string, slot: Slot): void {
  const marker = readMarker(slot.path)
  writeMarker(slot.path, { lastSession: marker.lastSession })
  const checkout = asCheckout(main, slot, {})
  linkBack(checkout, marker.links, {})
  applyEnv(checkout)
}

function requireIdle(slot: Slot): void {
  if (!isClean(slot.path)) throw new WtError(`${slot.name} has uncommitted changes: commit them first`)
  if (unityOpen(slot.path)) throw new WtError(`${slot.name} is open in Unity: close it first`)
}

function cmdDone(opts: Opts): void {
  const main = requireMain()
  const slot = requireSlot(main, opts._[0])
  const { branch } = slot
  if (!branch) throw new WtError(`${slot.name} has no branch: nothing to merge`)
  requireIdle(slot)
  const base = defaultBranch(main)

  // Merged in the slot, onto origin's tip, never in the main checkout: another session often holds it (another branch,
  // uncommitted work), and a conflict stays in the slot instead of leaving that checkout mid-merge
  git(slot.path, 'fetch', '--quiet', 'origin')
  git(slot.path, 'switch', '--quiet', '--detach', `origin/${base}`)
  log(`merging ${branch} into ${base} (--no-ff)`)
  // The ticket number prefixes every commit of the branch (`<n>-<slug>`), the merge included; none: git's own subject.
  const ticket = /^(\d+)-/.exec(branch)?.[1]
  try {
    git(slot.path, 'merge', '--no-ff', branch, '-m', `${ticket ? `#${ticket}: ` : ''}Merge branch '${branch}'`)
    git(slot.path, 'push', '--quiet', 'origin', `HEAD:${base}`)
  } catch (err) {
    backToBranch(slot.path, branch)
    throw new WtError(`${branch} not merged (${(err as Error).message}): merge origin/${base} into it in ${slot.name}, then wt done again`)
  }
  git(slot.path, 'branch', '-d', branch)
  if (git(main, 'ls-remote', '--heads', 'origin', branch)) git(main, 'push', '--quiet', 'origin', '--delete', branch)
  updateMain(main, base)
  releaseSlot(main, slot)
  log(`${branch} merged and pushed, ${slot.name} is free`)
}

// A failed merge or push: the slot goes back to its branch as it was, the local merge commit (if any) dropped
function backToBranch(path: string, branch: string): void {
  try {
    git(path, 'merge', '--abort')
  } catch {
    // no merge in progress: the merge went through, the push failed
  }
  git(path, 'switch', '--quiet', '--discard-changes', branch)
}

// The main checkout follows only when it sits on the default branch and can fast-forward: another branch or
// uncommitted work in the way is someone else's, left alone
function updateMain(main: string, base: string): void {
  const current = git(main, 'branch', '--show-current')
  if (current !== base) {
    log(`main checkout on ${current || 'a detached HEAD'}: not updated`)
    return
  }
  try {
    git(main, 'pull', '--quiet', '--ff-only')
  } catch (err) {
    log(`main checkout not updated (${(err as Error).message}): pull it once free`)
  }
}

/** Parks a ticket without merging it: the branch stays (local and pushed), the slot goes back to the default branch. */
function cmdFree(opts: Opts): void {
  const main = requireMain()
  const slot = requireSlot(main, opts._[0])
  if (!slot.branch) throw new WtError(`${slot.name} is already free`)
  requireIdle(slot)
  git(slot.path, 'fetch', '--quiet', 'origin')
  git(slot.path, 'switch', '--detach', `origin/${defaultBranch(main)}`)
  releaseSlot(main, slot)
  log(`${slot.name} is free (branch ${slot.branch} kept: \`wt new --branch ${slot.branch}\` takes it back)`)
}

function cmdRemove(opts: Opts): void {
  const main = requireMain()
  const slot = requireSlot(main, opts._[0])
  if (unityOpen(slot.path)) throw new WtError(`${slot.name} is open in Unity: close it first`)
  linkBack(asCheckout(main, slot, {}), readMarker(slot.path).links, {})
  git(main, 'worktree', 'remove', ...(opts.force ? ['--force'] : []), slot.path)
  log(`${slot.name} removed${slot.branch ? ` (branch ${slot.branch} kept)` : ''}`)
}

function cmdRegister(opts: Opts): void {
  for (const dir of opts._.length ? opts._ : [cwd]) {
    const main = mainRoot(normalize(dir))
    registerProject(main)
    log(`registered ${main}`)
  }
}

function cmdProjects(): void {
  const projects = listProjects()
  if (!projects.length) return log(`no project yet (${registryFile()})`)
  for (const p of projects) console.log(`${p.path}  ${new Date(p.lastSeen).toLocaleString()}`)
}

const commands: Record<string, (opts: Opts) => void> = { register: cmdRegister, projects: cmdProjects, new: cmdNew, list: cmdList, setup: cmdSetup, env: cmdEnv, link: cmdLink, done: cmdDone, free: cmdFree, remove: cmdRemove }

const [command, ...rest] = process.argv.slice(2)
if (!command || command === '--help' || command === '-h') {
  console.log(USAGE)
} else if (!commands[command]) {
  console.error(`[wt] unknown command "${command}"\n${USAGE}`)
  process.exit(1)
} else {
  try {
    // Automatic: whatever wt runs for, its repo joins the user's map (a folder outside git, or a failed write: skipped).
    if (command !== 'register' && command !== 'projects') {
      try {
        registerProject(mainRoot(cwd))
      } catch {}
    }
    commands[command](parse(rest))
  } catch (err) {
    if (!(err instanceof WtError)) throw err
    console.error(`[wt] ${err.message}`)
    process.exit(1)
  }
}
