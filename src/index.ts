// The library other tools (porlocal, an IDE view) build on: the slot layout, the links, the services and the
// `.env.local` block, exactly as the `wt` CLI reads and writes them.

export { resolveCheckout, currentCheckout, type Checkout } from './checkout.js'
export { CONFIG_KEY, projectConfig, type ProjectConfig, type ServiceDecl } from './config.js'
export { LOCAL_ENV, BLOCK_START, BLOCK_END, readEnv, readBlock, writeBlock } from './envLocal.js'
export { MARKER_FILE, MARKER_VERSION, markerPath, readMarker, writeMarker, type Links, type Marker } from './marker.js'
export { normalize, slotsDir, slotPath, checkoutPath, repoMain, slotNumber } from './paths.js'
export { WtError } from './run.js'
export { slotPort, refTarget, declaredPort, slotPortOf, envRefs, resolveEnv, applyEnv, type Target, type PortOf, type ResolvedEnv } from './services.js'
export { mainRoot, isMainCheckout, defaultBranch, listSlots, listWorktrees, findSlot, isClean, unityOpen, isFree, type Slot, type Worktree } from './slots.js'
export { registerProject, listProjects, registryFile, type RegisteredProject } from './registry.js'
export { slugify, branchName } from './issue.js'
