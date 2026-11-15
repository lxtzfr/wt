# wt

Worktree slots for multi-repo development: work on several tickets in parallel, each in its own long-lived
git worktree with its own ports, and point the repos of a ticket at each other through `.env.local`.

```
C:/src/acme/server         main checkout (slot 1)    api on 3001
C:/src/acme/web            main checkout (slot 1)    web on 4100, API_URL=http://localhost:3001
C:/src/acme.wt/server-2    slot 2, branch 12-login   api on 3011
C:/src/acme.wt/web-2       slot 2, branch 12-login   web on 4110, API_URL=http://localhost:3011 (linked)
```

A slot's path never changes: its IDE window, Unity Hub entry and caches stay valid from one ticket to the next. The
branch carries the ticket.

## Install

Node 22+, pnpm, `git`; `gh` for the commands that create or read issues.

```sh
pnpm add -D github:lxtzfr/wt#v2.0.0
```

pnpm builds it on install (TypeScript): allow that in `package.json` (or `allowBuilds` in `pnpm-workspace.yaml`):

```json
"pnpm": { "onlyBuiltDependencies": ["@lxtzfr/wt"] }
```

Then add `"wt": "wt"` to `scripts` and run it as `pnpm wt <command>`.

## Commands

| Command | Does |
|---------|------|
| `wt new "<title>" [--type Bug]` | Creates the issue (`gh`), takes the first free slot, puts branch `<n>-<slug>` on it, sets it up |
| `wt new --issue <n>` / `--branch <name>` | Same, from an existing issue / without a ticket |
| `wt new ... --new-slot` | Creates a slot when none is free (never implicit: a slot costs disk and setup) |
| `wt new ... --link server-2` | Links the new slot to another repo's slot, both ways |
| `wt new "<title>" --repos server,web` | From a workspace repo holding the repos: an umbrella issue, one issue and slot per repo, all linked |
| `wt list` | Slots, branch, issue, clean / dirty, links, last session |
| `wt setup <slot>` | Copies the missing env files again, rewrites `.env.local`, runs the setup commands |
| `wt env` | Rewrites this checkout's `.env.local` block (after a port or link change) |
| `wt link [<repo>-<n> \| <repo>]...` | Shows or changes this checkout's links (`<repo>` alone: back to its main checkout) |
| `wt free <slot>` | Parks the ticket: the slot goes back to the default branch, the branch is kept |
| `wt done <slot>` | Merges the branch (`--no-ff`) into the default branch, pushes, deletes it, frees the slot |
| `wt remove <slot> [--force]` | Removes the worktree |

Slot commands run from the main checkout; `list`, `env` and `link` from any checkout.

## Configuration

In each repo's `package.json` (`myStack`, its name before v2, is still read):

```json
"localDev": {
  "services": { "api": { "port": 3001, "run": "pnpm start:dev" } },
  "env": {
    "PORT": "{port:api}",
    "WEB_URL": "{url:web/web}",
    "DATABASE_URL": "{database:DATABASE_URL}"
  },
  "wt": { "copy": ["Library"], "setup": ["pnpm install"] }
}
```

- `services`: the ports of the main checkout. Slot n adds `10 * (n - 1)`.
- `env`: the keys written to `.env.local`. `{port:<service>}` and `{url:<service>}` point at this checkout,
  `{port:<repo>/<service>}` at a sibling repo (`<parent>/<repo>`): its main checkout, or the slot `wt link` chose.
  `{database:<KEY>}` takes the main checkout's `.env` URL with the database name suffixed `_<n>` (slots only).
- `wt.copy`: files or folders git doesn't carry, copied from the main checkout into a new slot (along with the files
  an `env.map.json` lists). `wt.setup`: commands run in a new slot (default `pnpm install`).

`.env.local` gets a managed block; a line written below it overrides a key:

```
# local services: start (generated: override a key on a line below the block)
PORT=3011
WEB_URL=http://localhost:4110
# local services: end
```

Your app loads `.env.local` before `.env` (Vite does it already).

## Library

Other tools read and write the same layout through the library:

```ts
import { resolveCheckout, resolveEnv, writeBlock, listSlots } from '@lxtzfr/wt'

const checkout = resolveCheckout(process.cwd()) // { path, main, repo, n, name, links }
const { values, skipped } = resolveEnv(checkout, { portOf: (target) => leasedPort(target) })
writeBlock(checkout.path, values)
```

[porlocal](https://github.com/lxtzfr/porlocal) uses it to give services free ports and keep every `.env.local`
pointing at them.

Stable contracts (a change is a major version): the slot layout, the `.env.local` block markers, the `localDev` keys,
the slot file `my-stack-wt.json` in each worktree's git dir (`version` field), and the library exports.

## License

MIT
