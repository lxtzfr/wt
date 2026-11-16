# wt

Worktree slots for multi-repo dev (`@lxtzfr/wt`): one long-lived worktree per ticket (`<parent>.wt/<repo>-<n>`), its
own ports (declared + 10 per slot), links between sibling repos' slots, all written to each checkout's `.env.local`
block. A CLI (`wt`) and the typed library other tools build on (porlocal, my-stack's core kit).

## Commands

- `pnpm install` (builds `dist/` through `prepare`), `pnpm build`, `pnpm test` (builds, then vitest: real git repos
  with a bare origin in a temp dir, the built CLI spawned), `pnpm typecheck`.
- `node dist/cli.js --help`. Try it on a repo without touching it: `wt list` is read-only.

## Layout

- `src/cli.ts`: the commands (`register`, `projects`, `new`, `list`, `setup`, `env`, `link`, `done`, `free`, `remove`); `src/index.ts`: the
  library's public surface, nothing else is API.
- `paths.ts` (slot layout), `slots.ts` (git worktrees), `checkout.ts` (the checkout a cwd is in), `marker.ts` (the
  slot's `my-stack-wt.json` in its git dir), `config.ts` (package.json `localDev`, formerly `myStack`), `services.ts` (ports, links,
  `resolveEnv`), `envLocal.ts` (the `.env.local` block), `setup.ts`, `issue.ts` (`gh`), `registry.ts` (the user's map of projects, written by every command).

## Rules

- Contracts read by other tools: the `.env.local` block markers, `my-stack-wt.json` (`MARKER_VERSION`), the
  `localDev` package.json keys, the slot layout, the user's project map `~/.wt/projects.json` (`WT_HOME`), the library exports. Changing one is a breaking change: major bump.
- Reading and resolving (`resolveCheckout`, `resolveEnv`, `readBlock`, ...) never prints: a daemon calls them. What
  acts logs `[wt] ...` lines (`applyEnv` takes a `log`); the CLI turns a `WtError` into its message and exit 1.
- Paths go through `normalize()` (realpath, `/`): git prints `C:/...`, a cwd may be a Windows 8.3 short one.
- Commits start with `#<n>: `, one branch per issue (`<n>-<slug>`), merged with `--no-ff`. No Claude attribution
  anywhere (no trailer, no session link). LF only.
- Release: bump `version`, tag `v<version>`, push the tag (consumers install `github:lxtzfr/wt#v<version>`).
